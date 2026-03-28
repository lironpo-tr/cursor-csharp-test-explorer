import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { TestTreeProvider, TestTreeNode } from '../ui/testTreeProvider';
import { runDotnet, getExtraArgs } from '../utils/dotnetCli';
import { parseTrxFile } from './trxParser';
import { Logger } from '../utils/logger';
import { matchAndApplyResults, applyResultState } from './resultMatcher';

const RESULTS_DIR_NAME = '.cursor-test-results';
const TRX_MAX_RETRIES = 3;
const TRX_RETRY_DELAY_MS = 500;

export function buildFilterForNode(node: TestTreeNode): string | undefined {
    switch (node.nodeType) {
        case 'parameterizedCase':
            return `FullyQualifiedName=${node.fqn}`;
        case 'method':
            return `FullyQualifiedName~${node.fqn}`;
        case 'class':
            return `FullyQualifiedName~${node.fqn}`;
        case 'namespace':
            return `FullyQualifiedName~${node.fqn}`;
        case 'project':
            return undefined;
    }
}

export function collectMethodNodes(node: TestTreeNode): TestTreeNode[] {
    if (node.nodeType === 'parameterizedCase') {
        return [node];
    }
    if (node.nodeType === 'method' && node.children.length === 0) {
        return [node];
    }
    const result: TestTreeNode[] = [];
    for (const child of node.children) {
        result.push(...collectMethodNodes(child));
    }
    return result;
}

export function markRunningNodesAsFailed(
    node: TestTreeNode,
    err: unknown,
    treeProvider: TestTreeProvider,
): void {
    markMethodNodesFailed(collectMethodNodes(node), err, treeProvider);
}

function markMethodNodesFailed(
    methodNodes: TestTreeNode[],
    err: unknown,
    treeProvider: TestTreeProvider,
): void {
    for (const m of methodNodes) {
        if (m.state === 'running') {
            applyResultState(
                m,
                'failed',
                { errorMessage: err instanceof Error ? err.message : String(err) },
                treeProvider,
            );
        }
    }
}

export async function executeTests(
    node: TestTreeNode,
    token: vscode.CancellationToken,
    treeProvider: TestTreeProvider,
    logger: Logger,
): Promise<void> {
    if (token.isCancellationRequested) {
        return;
    }

    if (!node.projectPath) {
        const msg = `No project path associated with "${node.label}". Re-discover tests and try again.`;
        logger.logError(msg);
        markRunningNodesAsFailed(node, new Error(msg), treeProvider);
        return;
    }

    const filter = buildFilterForNode(node);
    const methodNodes = collectMethodNodes(node);

    await executeTestRun(
        node.projectPath,
        node.label,
        filter,
        methodNodes,
        token,
        treeProvider,
        logger,
    );
}

export function buildFilterForNodes(nodes: TestTreeNode[]): string | undefined {
    const expressions: string[] = [];

    for (const node of nodes) {
        const filter = buildFilterForNode(node);
        if (!filter) {
            return undefined;
        }
        expressions.push(filter);
    }

    if (expressions.length === 0) {
        return undefined;
    }

    return expressions.length === 1
        ? expressions[0]
        : expressions.map((e) => `(${e})`).join(' | ');
}

export function collectAllMethodNodes(nodes: TestTreeNode[]): TestTreeNode[] {
    const result: TestTreeNode[] = [];
    const seen = new Set<string>();

    for (const node of nodes) {
        for (const m of collectMethodNodes(node)) {
            if (!seen.has(m.id)) {
                seen.add(m.id);
                result.push(m);
            }
        }
    }

    return result;
}

export function groupNodesByProject(nodes: TestTreeNode[]): Map<string, TestTreeNode[]> {
    const grouped = new Map<string, TestTreeNode[]>();

    for (const node of nodes) {
        const projectPath = node.projectPath;
        if (!projectPath) {
            continue;
        }

        const list = grouped.get(projectPath) ?? [];
        list.push(node);
        grouped.set(projectPath, list);
    }

    return grouped;
}

export async function executeTestsForNodes(
    nodes: TestTreeNode[],
    token: vscode.CancellationToken,
    treeProvider: TestTreeProvider,
    logger: Logger,
): Promise<void> {
    const byProject = groupNodesByProject(nodes);

    for (const [projectPath, projectNodes] of byProject) {
        if (token.isCancellationRequested) {
            break;
        }

        const filter = buildFilterForNodes(projectNodes);
        const methodNodes = collectAllMethodNodes(projectNodes);
        const label = projectNodes.map((n) => n.label).join(', ');

        await executeTestRun(projectPath, label, filter, methodNodes, token, treeProvider, logger);
    }
}

async function executeTestRun(
    projectPath: string,
    label: string,
    filter: string | undefined,
    methodNodes: TestTreeNode[],
    token: vscode.CancellationToken,
    treeProvider: TestTreeProvider,
    logger: Logger,
): Promise<void> {
    if (token.isCancellationRequested) {
        return;
    }

    let projectExists = false;
    try {
        await fs.access(projectPath);
        projectExists = true;
    } catch {
        // file does not exist or is inaccessible
    }

    if (!projectExists) {
        const msg = `Project file not found: ${projectPath}. Re-discover tests to refresh the project list.`;
        logger.logError(msg);
        markMethodNodesFailed(methodNodes, new Error(msg), treeProvider);
        return;
    }

    const projectDir = path.dirname(projectPath);
    const trxDir = path.join(os.tmpdir(), RESULTS_DIR_NAME, Date.now().toString());
    await fs.mkdir(trxDir, { recursive: true });
    const trxFileName = 'results.trx';

    const args = ['test', projectPath, '--no-restore'];
    args.push('--logger', `trx;LogFileName=${trxFileName}`);
    args.push('--results-directory', trxDir);

    if (filter) {
        args.push('--filter', filter);
    }

    const extraArgs = getExtraArgs();
    if (extraArgs.length > 0) {
        args.push(...extraArgs);
    }

    let result: Awaited<ReturnType<typeof runDotnet>>;
    try {
        result = await runDotnet(args, projectDir, token, logger);
    } catch (err) {
        if (isCancelError(err)) {
            throw err;
        }

        logger.logError(`dotnet test failed to execute for ${label}`, err);
        markMethodNodesFailed(methodNodes, err, treeProvider);
        fs.rm(trxDir, { recursive: true }).catch((cleanupErr) => {
            logger.logTrace(`Failed to clean up TRX directory ${trxDir}: ${cleanupErr}`);
        });
        return;
    }

    if (token.isCancellationRequested) {
        return;
    }

    const trxPath = await findTrxFile(trxDir);

    if (!trxPath) {
        handleMissingTrxFile(result, methodNodes, treeProvider, logger);
        fs.rm(trxDir, { recursive: true }).catch((cleanupErr) => {
            logger.logTrace(`Failed to clean up TRX directory ${trxDir}: ${cleanupErr}`);
        });
        return;
    }

    try {
        const summary = await parseTrxFile(trxPath);
        matchAndApplyResults(summary, methodNodes, treeProvider, logger);
    } catch (err) {
        logger.logError('Could not parse TRX results, check output for raw dotnet test output', err);
        dumpDotnetOutput(result, logger);

        if (result.exitCode !== 0) {
            for (const m of methodNodes) {
                if (m.state === 'running') {
                    applyResultState(
                        m,
                        'failed',
                        { errorMessage: 'Test run failed. Check C# Test Explorer output.' },
                        treeProvider,
                    );
                }
            }
        }
    }

    fs.rm(trxDir, { recursive: true }).catch((cleanupErr) => {
        logger.logTrace(`Failed to clean up TRX directory ${trxDir}: ${cleanupErr}`);
    });
}

function handleMissingTrxFile(
    result: { exitCode: number; stdout: string; stderr: string },
    methodNodes: TestTreeNode[],
    treeProvider: TestTreeProvider,
    logger: Logger,
): void {
    if (result.exitCode === 0) {
        logger.log(
            'No TRX results file generated. Tests may have been filtered out or skipped.',
        );
        for (const m of methodNodes) {
            if (m.state === 'running') {
                applyResultState(m, 'skipped', undefined, treeProvider);
            }
        }
    } else {
        logger.logError(
            'No TRX results file generated and dotnet test exited with a non-zero code. ' +
                'Check output for details.',
        );
        dumpDotnetOutput(result, logger);
        for (const m of methodNodes) {
            if (m.state === 'running') {
                applyResultState(
                    m,
                    'failed',
                    { errorMessage: 'Test run failed — no TRX results produced. Check C# Test Explorer output.' },
                    treeProvider,
                );
            }
        }
    }
}

function dumpDotnetOutput(
    result: { stdout: string; stderr: string },
    logger: Logger,
): void {
    if (result.stdout) {
        logger.log(result.stdout);
    }
    if (result.stderr) {
        logger.log(result.stderr);
    }
}

/**
 * Scans a directory for `.trx` files, retrying with a short delay to handle
 * the race condition where dotnet test has exited but the TRX file hasn't
 * been flushed to disk yet.
 *
 * Returns the path to the first `.trx` file found, or `undefined` if none
 * exists after all retries.
 */
export async function findTrxFile(
    trxDir: string,
    maxRetries: number = TRX_MAX_RETRIES,
    retryDelayMs: number = TRX_RETRY_DELAY_MS,
): Promise<string | undefined> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (attempt > 0) {
            await delay(retryDelayMs);
        }

        const trxFiles = await findTrxFilesInDir(trxDir);
        if (trxFiles.length > 0) {
            return trxFiles[0];
        }
    }
    return undefined;
}

async function findTrxFilesInDir(dir: string): Promise<string[]> {
    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const results: string[] = [];

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isFile() && entry.name.endsWith('.trx')) {
                results.push(fullPath);
            } else if (entry.isDirectory()) {
                const nested = await findTrxFilesInDir(fullPath);
                results.push(...nested);
            }
        }

        return results;
    } catch {
        return [];
    }
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isCancelError(err: unknown): boolean {
    return err instanceof Error && err.message === 'Cancelled';
}
