import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { runDotnet, getExtraArgs } from '../utils/dotnetCli';
import { log, logError, showOutput } from '../utils/outputChannel';
import { parseTrxFile, TrxSummary, TestResult } from './trxParser';
import { buildFilter, getProjectPath } from './filterBuilder';

const RESULTS_DIR_NAME = '.cursor-test-results';

export interface RunResult {
    trxSummary: TrxSummary;
    projectPath: string;
}

export async function runTests(
    testRun: vscode.TestRun,
    items: readonly vscode.TestItem[],
    token: vscode.CancellationToken
): Promise<RunResult | undefined> {
    // Group items by project
    const projectGroups = groupByProject(items);

    for (const [projectPath, projectItems] of projectGroups) {
        if (token.isCancellationRequested) { return undefined; }

        const result = await runProjectTests(testRun, projectPath, projectItems, token);
        if (result) {
            applyResults(testRun, projectItems, result.trxSummary);
            return result;
        }
    }

    return undefined;
}

async function runProjectTests(
    testRun: vscode.TestRun,
    projectPath: string,
    items: vscode.TestItem[],
    token: vscode.CancellationToken
): Promise<RunResult | undefined> {
    const projectDir = path.dirname(projectPath);

    const trxDir = path.join(os.tmpdir(), RESULTS_DIR_NAME, Date.now().toString());
    await fs.mkdir(trxDir, { recursive: true });
    const trxFileName = 'results.trx';

    const { filter } = buildFilter(items);

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

    // Mark all included test items as started
    for (const item of items) {
        markStarted(testRun, item);
    }

    try {
        const result = await runDotnet(args, projectDir, token);

        if (token.isCancellationRequested) {
            return undefined;
        }

        testRun.appendOutput(result.stdout.replace(/\n/g, '\r\n'));

        if (result.stderr) {
            testRun.appendOutput(`\r\n--- stderr ---\r\n${result.stderr.replace(/\n/g, '\r\n')}`);
        }

        const trxPath = path.join(trxDir, trxFileName);
        let trxSummary: TrxSummary;

        try {
            trxSummary = await parseTrxFile(trxPath);
        } catch {
            logError('TRX file not found or unreadable, falling back to exit code');
            trxSummary = {
                total: 0, passed: 0, failed: 0, skipped: 0,
                duration: 0, results: [],
            };

            if (result.exitCode !== 0) {
                for (const item of items) {
                    markFailed(testRun, item, 'Test run failed. Check output for details.');
                }
            }
        }

        // Clean up temp directory (best-effort)
        fs.rm(trxDir, { recursive: true }).catch(() => {});

        return { trxSummary, projectPath };
    } catch (err) {
        if (err instanceof Error && err.message === 'Cancelled') {
            return undefined;
        }
        logError('Test run failed', err);
        showOutput();
        return undefined;
    }
}

function applyResults(
    testRun: vscode.TestRun,
    items: vscode.TestItem[],
    summary: TrxSummary
): void {
    // Build a map from test name -> result for quick lookup
    const resultMap = new Map<string, TestResult>();
    for (const r of summary.results) {
        resultMap.set(r.testName, r);
    }

    for (const item of items) {
        applyResultToItem(testRun, item, resultMap);
    }

    log(`Run complete: ${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped (${summary.duration}ms)`);
}

function applyResultToItem(
    testRun: vscode.TestRun,
    item: vscode.TestItem,
    resultMap: Map<string, TestResult>
): void {
    // Check if this item has a direct result
    const result = resultMap.get(item.id) ?? resultMap.get(item.label);

    if (result) {
        const duration = result.duration;
        switch (result.outcome) {
            case 'Passed':
                testRun.passed(item, duration);
                break;
            case 'Failed':
            case 'Error':
            case 'Timeout':
                markFailed(testRun, item, result.errorMessage, result.stackTrace, duration);
                break;
            case 'NotExecuted':
            case 'Inconclusive':
                testRun.skipped(item);
                break;
        }
        return;
    }

    // Recurse into children
    item.children.forEach(child => {
        applyResultToItem(testRun, child, resultMap);
    });
}

function groupByProject(items: readonly vscode.TestItem[]): Map<string, vscode.TestItem[]> {
    const groups = new Map<string, vscode.TestItem[]>();

    for (const item of items) {
        const pp = findProjectPath(item);
        if (!pp) { continue; }

        let list = groups.get(pp);
        if (!list) {
            list = [];
            groups.set(pp, list);
        }
        list.push(item);
    }

    return groups;
}

function findProjectPath(item: vscode.TestItem): string | undefined {
    let current: vscode.TestItem | undefined = item;
    while (current) {
        const pp = getProjectPath(current);
        if (pp) { return pp; }
        current = current.parent;
    }
    return undefined;
}

function markStarted(testRun: vscode.TestRun, item: vscode.TestItem): void {
    testRun.started(item);
    item.children.forEach(child => markStarted(testRun, child));
}

function markFailed(
    testRun: vscode.TestRun,
    item: vscode.TestItem,
    message?: string,
    stackTrace?: string,
    duration?: number,
): void {
    const msg = new vscode.TestMessage(message ?? 'Test failed');
    if (stackTrace) {
        msg.message = `${message ?? 'Test failed'}\n\n${stackTrace}`;
    }
    testRun.failed(item, msg, duration);
}
