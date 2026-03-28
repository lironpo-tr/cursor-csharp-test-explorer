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

export function buildFilterForNode(node: TestTreeNode): string | undefined {
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
    const methodNodes = collectMethodNodes(node);
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
    if (!node.projectPath || token.isCancellationRequested) {
        return;
    }

    const projectDir = path.dirname(node.projectPath);
    const trxDir = path.join(os.tmpdir(), RESULTS_DIR_NAME, Date.now().toString());
    await fs.mkdir(trxDir, { recursive: true });
    const trxFileName = 'results.trx';

    const args = ['test', node.projectPath, '--no-restore'];
    args.push('--logger', `trx;LogFileName=${trxFileName}`);
    args.push('--results-directory', trxDir);

    const filter = buildFilterForNode(node);
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

        logger.logError(`dotnet test failed to execute for ${node.label}`, err);
        markRunningNodesAsFailed(node, err, treeProvider);
        fs.rm(trxDir, { recursive: true }).catch((cleanupErr) => {
            logger.logTrace(`Failed to clean up TRX directory ${trxDir}: ${cleanupErr}`);
        });
        return;
    }

    if (token.isCancellationRequested) {
        return;
    }

    const trxPath = path.join(trxDir, trxFileName);
    const methodNodes = collectMethodNodes(node);

    try {
        const summary = await parseTrxFile(trxPath);
        matchAndApplyResults(summary, methodNodes, treeProvider, logger);
    } catch (err) {
        logger.logError('Could not read TRX results, check output for raw dotnet test output', err);
        if (result.stdout) {
            logger.log(result.stdout);
        }
        if (result.stderr) {
            logger.log(result.stderr);
        }

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

function isCancelError(err: unknown): boolean {
    return err instanceof Error && err.message === 'Cancelled';
}
