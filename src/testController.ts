import * as vscode from 'vscode';
import { detectTestProjects, TestProject } from './discovery/projectDetector';
import { discoverTests, DiscoveredTest } from './discovery/dotnetDiscoverer';
import { TestTreeProvider, TestTreeNode } from './ui/testTreeProvider';
import { StatusBarManager } from './ui/statusBarManager';
import {
    executeTests,
    collectMethodNodes,
    markRunningNodesAsFailed,
} from './execution/testRunner';
import { launchDebugSession } from './debug/debugLauncher';
import { Logger } from './utils/logger';

export class CSharpTestController implements vscode.Disposable {
    readonly treeProvider: TestTreeProvider;
    private readonly statusBar: StatusBarManager;
    private readonly disposables: vscode.Disposable[] = [];
    private isDiscovering = false;

    private activeCts: vscode.CancellationTokenSource | undefined;
    private isRunning = false;

    private projects: TestProject[] = [];
    private testsByProject = new Map<string, DiscoveredTest[]>();

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly logger: Logger,
    ) {
        this.treeProvider = new TestTreeProvider();
        this.statusBar = new StatusBarManager();

        const treeView = vscode.window.createTreeView('csharpTestExplorerView', {
            treeDataProvider: this.treeProvider,
            showCollapseAll: true,
        });

        this.disposables.push(treeView, this.statusBar, this.treeProvider);
    }

    get running(): boolean {
        return this.isRunning;
    }

    stopRun(): void {
        if (this.activeCts) {
            this.logger.log('Cancelling test run...');
            this.activeCts.cancel();
            this.activeCts.dispose();
            this.activeCts = undefined;
            this.isRunning = false;

            this.treeProvider.clearRunningStates();
            this.statusBar.updateResults(this.treeProvider.getAllMethodNodes());
            this.logger.log('Test run cancelled.');
        }
    }

    async discoverAllTests(token?: vscode.CancellationToken): Promise<void> {
        if (this.isDiscovering) {
            this.logger.log('Discovery already in progress, skipping.');
            return;
        }

        this.isDiscovering = true;
        this.statusBar.showDiscovering();

        try {
            this.projects = await detectTestProjects(this.logger);

            if (this.projects.length === 0) {
                this.logger.log('No test projects found.');
                this.statusBar.showNoProjects();
                return;
            }

            this.testsByProject.clear();
            let totalTests = 0;

            for (const project of this.projects) {
                if (token?.isCancellationRequested) {
                    return;
                }

                const tests = await discoverTests(project, this.logger, token);
                this.testsByProject.set(project.csprojPath, tests);
                totalTests += tests.length;
            }

            this.treeProvider.buildTree(this.projects, this.testsByProject);

            this.statusBar.showDiscovered(totalTests);
            this.logger.log(
                `Discovery complete: ${totalTests} test(s) across ${this.projects.length} project(s).`,
            );
        } catch (err) {
            this.logger.logError('Discovery failed', err);
            this.statusBar.showDiscoveryFailed();
        } finally {
            this.isDiscovering = false;
        }
    }

    async runNode(node: TestTreeNode): Promise<void> {
        if (!node.projectPath) {
            this.logger.logError('No project path for node');
            return;
        }

        this.startRun();
        const methodNodes = collectMethodNodes(node);
        for (const m of methodNodes) {
            m.state = 'running';
        }
        this.treeProvider.refresh();

        try {
            await executeTests(node, this.activeCts!.token, this.treeProvider, this.logger);
        } catch (err) {
            if (!this.isCancelError(err)) {
                this.logger.logError('Run failed', err);
                markRunningNodesAsFailed(node, err, this.treeProvider);
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
                if (token.isCancellationRequested) {
                    break;
                }

                try {
                    await executeTests(root, token, this.treeProvider, this.logger);
                } catch (err) {
                    if (this.isCancelError(err)) {
                        break;
                    }

                    this.logger.logError(`Run failed for project: ${root.label}`, err);
                    markRunningNodesAsFailed(root, err, this.treeProvider);
                }
            }
        } finally {
            this.finishRun();
        }
    }

    async debugNode(node: TestTreeNode): Promise<void> {
        if (!node.projectPath) {
            this.logger.logError('No project path for node');
            return;
        }

        this.startRun();
        this.statusBar.showDebugging();
        this.logger.showOutput();

        try {
            await launchDebugSession(node, this.activeCts!.token, this.logger);
        } catch (err) {
            if (!this.isCancelError(err)) {
                this.logger.logError('Debug failed', err);
            }
        } finally {
            this.finishRun();
        }
    }

    private startRun(): void {
        this.stopRun();
        this.activeCts = new vscode.CancellationTokenSource();
        this.isRunning = true;
        this.statusBar.showRunning();
        vscode.commands.executeCommand('setContext', 'csharpTestExplorer.isRunning', true);
    }

    private finishRun(): void {
        this.isRunning = false;
        this.activeCts?.dispose();
        this.activeCts = undefined;
        vscode.commands.executeCommand('setContext', 'csharpTestExplorer.isRunning', false);

        this.treeProvider.clearRunningStates();
        this.statusBar.updateResults(this.treeProvider.getAllMethodNodes());
    }

    private isCancelError(err: unknown): boolean {
        return err instanceof Error && err.message === 'Cancelled';
    }

    dispose(): void {
        this.stopRun();
        for (const d of this.disposables) {
            d.dispose();
        }
    }
}
