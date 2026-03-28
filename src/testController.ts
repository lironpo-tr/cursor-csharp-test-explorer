import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { detectTestProjects, TestProject } from './discovery/projectDetector';
import { discoverTests, DiscoveredTest } from './discovery/dotnetDiscoverer';
import { TestTreeProvider, TestTreeNode, TestState } from './testTreeProvider';
import { runDotnet, getExtraArgs } from './utils/dotnetCli';
import { parseTrxFile } from './execution/trxParser';
import { log, logError, showOutput } from './utils/outputChannel';

/**
 * Normalizes parameter formatting in test names for comparison.
 * TRX output and source-code discovery may differ in whitespace within parameter lists
 * (e.g., "Method(1, 2)" vs "Method(1,2)").
 */
export function normalizeTestName(name: string): string {
    const parenIdx = name.indexOf('(');
    if (parenIdx === -1) { return name; }
    return name.substring(0, parenIdx) + name.substring(parenIdx).replace(/,\s+/g, ',');
}

export class CSharpTestController implements vscode.Disposable {
    readonly treeProvider: TestTreeProvider;
    private readonly statusBar: vscode.StatusBarItem;
    private readonly disposables: vscode.Disposable[] = [];
    private isDiscovering = false;

    private activeCts: vscode.CancellationTokenSource | undefined;
    private isRunning = false;

    private projects: TestProject[] = [];
    private testsByProject = new Map<string, DiscoveredTest[]>();

    constructor(private readonly context: vscode.ExtensionContext) {
        this.treeProvider = new TestTreeProvider();

        const treeView = vscode.window.createTreeView('csharpTestExplorerView', {
            treeDataProvider: this.treeProvider,
            showCollapseAll: true,
        });

        this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.statusBar.command = 'csharpTestExplorer.runAll';
        this.statusBar.text = '$(beaker) C# Tests';
        this.statusBar.show();

        this.disposables.push(treeView, this.statusBar, this.treeProvider);
    }

    get running(): boolean {
        return this.isRunning;
    }

    stopRun(): void {
        if (this.activeCts) {
            log('Cancelling test run...');
            this.activeCts.cancel();
            this.activeCts.dispose();
            this.activeCts = undefined;
            this.isRunning = false;

            // Clear all "running" states back to "none"
            this.treeProvider.clearRunningStates();
            this.updateStatusBar();
            log('Test run cancelled.');
        }
    }

    async discoverAllTests(token?: vscode.CancellationToken): Promise<void> {
        if (this.isDiscovering) {
            log('Discovery already in progress, skipping.');
            return;
        }

        this.isDiscovering = true;
        this.statusBar.text = '$(loading~spin) Discovering C# tests...';

        try {
            this.projects = await detectTestProjects();

            if (this.projects.length === 0) {
                log('No test projects found.');
                this.statusBar.text = '$(beaker) No test projects';
                return;
            }

            this.testsByProject.clear();
            let totalTests = 0;

            for (const project of this.projects) {
                if (token?.isCancellationRequested) { return; }

                const tests = await discoverTests(project, token);
                this.testsByProject.set(project.csprojPath, tests);
                totalTests += tests.length;
            }

            this.treeProvider.buildTree(this.projects, this.testsByProject);

            this.statusBar.text = `$(beaker) ${totalTests} C# test(s)`;
            log(`Discovery complete: ${totalTests} test(s) across ${this.projects.length} project(s).`);
        } catch (err) {
            logError('Discovery failed', err);
            this.statusBar.text = '$(error) Discovery failed';
        } finally {
            this.isDiscovering = false;
        }
    }

    async runNode(node: TestTreeNode): Promise<void> {
        if (!node.projectPath) {
            logError('No project path for node');
            return;
        }

        this.startRun();
        const methodNodes = this.collectMethodNodes(node);
        for (const m of methodNodes) {
            m.state = 'running';
        }
        this.treeProvider.refresh();

        try {
            await this.executeTests(node, this.activeCts!.token);
        } catch (err) {
            if (!this.isCancelError(err)) {
                logError('Run failed', err);
                this.markRunningNodesAsFailed(node, err);
            }
        } finally {
            this.finishRun();
        }
    }

    async runAll(): Promise<void> {
        this.startRun();
        const allMethods = this.treeProvider.getAllMethodNodes();
        for (const m of allMethods) {
            m.state = 'running';
        }
        this.treeProvider.refresh();

        const token = this.activeCts!.token;
        try {
            for (const root of this.treeProvider.getRoots()) {
                if (token.isCancellationRequested) { break; }

                try {
                    await this.executeTests(root, token);
                } catch (err) {
                    if (this.isCancelError(err)) { break; }

                    logError(`Run failed for project: ${root.label}`, err);
                    this.markRunningNodesAsFailed(root, err);
                }
            }
        } finally {
            this.finishRun();
        }
    }

    async debugNode(node: TestTreeNode): Promise<void> {
        if (!node.projectPath) {
            logError('No project path for node');
            return;
        }

        this.startRun();
        this.statusBar.text = '$(debug) Debugging...';
        showOutput();

        const projectDir = path.dirname(node.projectPath);
        const args = ['test', node.projectPath, '--no-restore'];

        const filter = this.buildFilterForNode(node);
        if (filter) {
            args.push('--filter', filter);
        }

        const extraArgs = getExtraArgs();
        if (extraArgs.length > 0) {
            args.push(...extraArgs);
        }

        log('Starting test host with VSTEST_HOST_DEBUG=1...');

        const { spawnDotnet } = await import('./utils/dotnetCli');
        const proc = spawnDotnet(args, projectDir, { VSTEST_HOST_DEBUG: '1' });

        const pidRegex = /Process Id:\s*(\d+)/;
        let buffer = '';
        const token = this.activeCts!.token;

        try {
            const pid = await new Promise<number>((resolve, reject) => {
                proc.stdout?.on('data', (data: Buffer) => {
                    buffer += data.toString();
                    const match = buffer.match(pidRegex);
                    if (match) {
                        resolve(parseInt(match[1], 10));
                    }
                });
                proc.stderr?.on('data', (data: Buffer) => {
                    buffer += data.toString();
                });
                proc.on('close', (code) => {
                    reject(new Error(`Test host exited (code ${code}) before PID detected`));
                });
                token.onCancellationRequested(() => {
                    proc.kill();
                    reject(new Error('Cancelled'));
                });
                setTimeout(() => reject(new Error('Timeout waiting for test host PID')), 60_000);
            });

            log(`Test host PID: ${pid}. Attaching debugger...`);

            const debugConfig: vscode.DebugConfiguration = {
                type: 'coreclr',
                name: 'Attach to Test Host',
                request: 'attach',
                processId: pid.toString(),
            };

            const folder = vscode.workspace.workspaceFolders?.[0];
            const started = await vscode.debug.startDebugging(folder, debugConfig);

            if (!started) {
                logError('Failed to attach debugger');
                proc.kill();
                return;
            }

            await new Promise<void>((resolve) => {
                proc.on('close', () => resolve());
                token.onCancellationRequested(() => {
                    proc.kill();
                    resolve();
                });
            });

            log('Debug session completed.');
        } catch (err) {
            proc.kill();
            if (!this.isCancelError(err)) {
                logError('Debug failed', err);
            }
        } finally {
            this.finishRun();
        }
    }

    private startRun(): void {
        // Cancel any existing run
        this.stopRun();
        this.activeCts = new vscode.CancellationTokenSource();
        this.isRunning = true;
        this.statusBar.text = '$(loading~spin) Running tests...';
        // Update context for when-clause so stop button appears
        vscode.commands.executeCommand('setContext', 'csharpTestExplorer.isRunning', true);
    }

    private finishRun(): void {
        this.isRunning = false;
        this.activeCts?.dispose();
        this.activeCts = undefined;
        vscode.commands.executeCommand('setContext', 'csharpTestExplorer.isRunning', false);

        // Clear any nodes still stuck in "running"
        this.treeProvider.clearRunningStates();
        this.updateStatusBar();
    }

    private async executeTests(node: TestTreeNode, token: vscode.CancellationToken): Promise<void> {
        if (!node.projectPath || token.isCancellationRequested) { return; }

        const projectDir = path.dirname(node.projectPath);
        const trxDir = path.join(os.tmpdir(), '.cursor-test-results', Date.now().toString());
        await fs.mkdir(trxDir, { recursive: true });
        const trxFileName = 'results.trx';

        const args = ['test', node.projectPath, '--no-restore'];
        args.push('--logger', `trx;LogFileName=${trxFileName}`);
        args.push('--results-directory', trxDir);

        const filter = this.buildFilterForNode(node);
        if (filter) {
            args.push('--filter', filter);
        }

        const extraArgs = getExtraArgs();
        if (extraArgs.length > 0) {
            args.push(...extraArgs);
        }

        let result: Awaited<ReturnType<typeof runDotnet>>;
        try {
            result = await runDotnet(args, projectDir, token);
        } catch (err) {
            if (this.isCancelError(err)) { throw err; }

            logError(`dotnet test failed to execute for ${node.label}`, err);
            this.markRunningNodesAsFailed(node, err);
            fs.rm(trxDir, { recursive: true }).catch(() => {});
            return;
        }

        if (token.isCancellationRequested) { return; }

        const trxPath = path.join(trxDir, trxFileName);
        const methodNodes = this.collectMethodNodes(node);

        try {
            const summary = await parseTrxFile(trxPath);

            // Build lookup maps for flexible matching (strip params so parameterized cases group by base method name)
            const methodsByName = new Map<string, TestTreeNode[]>();
            for (const m of methodNodes) {
                const shortName = m.fqn.replace(/\(.*\)$/, '').split('.').pop() ?? m.fqn;
                const list = methodsByName.get(shortName) ?? [];
                list.push(m);
                methodsByName.set(shortName, list);
            }

            for (const tr of summary.results) {
                const state: TestState = tr.outcome === 'Passed' ? 'passed'
                    : tr.outcome === 'Failed' || tr.outcome === 'Error' || tr.outcome === 'Timeout' ? 'failed'
                    : 'skipped';

                const details = {
                    errorMessage: tr.errorMessage,
                    stackTrace: tr.stackTrace,
                    duration: tr.duration,
                };

                // Try exact FQN match (works for parameterized cases discovered statically)
                let matched = this.tryMatchResult(tr.testName, state, details, methodNodes);

                if (!matched) {
                    const baseName = tr.testName.replace(/\(.*\)$/, '');
                    const hasParams = baseName !== tr.testName;

                    if (hasParams) {
                        // Dynamically create a parameterized case node under the parent method
                        const parentBaseFqn = baseName;
                        const displayName = tr.testName.split('.').pop() ?? tr.testName;
                        const dynamicNode = this.treeProvider.addDynamicCaseNode(
                            parentBaseFqn, tr.testName, displayName,
                        );
                        if (dynamicNode) {
                            this.applyState(dynamicNode, state, details);
                            matched = true;
                        }
                    }

                    if (!matched) {
                        matched = this.tryMatchResult(baseName, state, details, methodNodes);
                    }
                }

                if (!matched) {
                    const shortName = tr.testName.replace(/\(.*\)$/, '').split('.').pop() ?? tr.testName;
                    const candidates = methodsByName.get(shortName);
                    if (candidates && candidates.length > 0) {
                        for (const c of candidates) {
                            this.applyState(c, state, details);
                        }
                        matched = true;
                    }
                }

                if (!matched) {
                    log(`Unmatched result: ${tr.testName} (${tr.outcome})`);
                }
            }

            log(`Results: ${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped`);
        } catch {
            logError('Could not read TRX results, check output for raw dotnet test output');
            if (result.stdout) { log(result.stdout); }
            if (result.stderr) { log(result.stderr); }

            if (result.exitCode !== 0) {
                for (const m of methodNodes) {
                    if (m.state === 'running') {
                        this.applyState(m, 'failed', {
                            errorMessage: 'Test run failed. Check C# Test Explorer output.',
                        });
                    }
                }
            }
        }

        fs.rm(trxDir, { recursive: true }).catch(() => {});
    }

    private tryMatchResult(
        name: string,
        state: TestState,
        details: { errorMessage?: string; stackTrace?: string; duration?: number },
        candidates: TestTreeNode[]
    ): boolean {
        const normalized = normalizeTestName(name);
        for (const node of candidates) {
            const normalizedFqn = normalizeTestName(node.fqn);
            if (normalizedFqn === normalized || normalizedFqn.endsWith(`.${normalized}`)) {
                this.applyState(node, state, details);
                return true;
            }
        }
        return false;
    }

    private applyState(
        node: TestTreeNode,
        state: TestState,
        details?: { errorMessage?: string; stackTrace?: string; duration?: number }
    ): void {
        node.state = state;
        if (details) {
            node.errorMessage = details.errorMessage;
            node.stackTrace = details.stackTrace;
            node.duration = details.duration;
        }
        this.treeProvider.refreshNode(node);
    }

    private buildFilterForNode(node: TestTreeNode): string | undefined {
        switch (node.nodeType) {
            case 'parameterizedCase':
                return `FullyQualifiedName=${node.fqn}`;
            case 'method':
                return `FullyQualifiedName~${node.fqn.split('.').pop()}`;
            case 'class':
                return `FullyQualifiedName~${node.fqn}`;
            case 'namespace':
                return `FullyQualifiedName~${node.fqn}`;
            case 'project':
                return undefined;
        }
    }

    private markRunningNodesAsFailed(node: TestTreeNode, err: unknown): void {
        const methodNodes = this.collectMethodNodes(node);
        for (const m of methodNodes) {
            if (m.state === 'running') {
                this.applyState(m, 'failed', {
                    errorMessage: err instanceof Error ? err.message : String(err),
                });
            }
        }
    }

    private collectMethodNodes(node: TestTreeNode): TestTreeNode[] {
        if (node.nodeType === 'parameterizedCase') {
            return [node];
        }
        if (node.nodeType === 'method' && node.children.length === 0) {
            return [node];
        }
        const result: TestTreeNode[] = [];
        for (const child of node.children) {
            result.push(...this.collectMethodNodes(child));
        }
        return result;
    }

    private isCancelError(err: unknown): boolean {
        return err instanceof Error && err.message === 'Cancelled';
    }

    private updateStatusBar(): void {
        const methods = this.treeProvider.getAllMethodNodes();
        const passed = methods.filter(m => m.state === 'passed').length;
        const failed = methods.filter(m => m.state === 'failed').length;
        const total = methods.length;

        if (failed > 0) {
            this.statusBar.text = `$(error) ${passed}/${total} passed, ${failed} failed`;
            this.statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        } else if (passed === total && total > 0) {
            this.statusBar.text = `$(pass) ${total}/${total} passed`;
            this.statusBar.backgroundColor = undefined;
        } else {
            this.statusBar.text = `$(beaker) ${total} C# test(s)`;
            this.statusBar.backgroundColor = undefined;
        }
    }

    dispose(): void {
        this.stopRun();
        for (const d of this.disposables) {
            d.dispose();
        }
    }
}
