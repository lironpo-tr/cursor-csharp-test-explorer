import * as vscode from 'vscode';
import * as path from 'path';
import { ChildProcess } from 'child_process';
import { spawnDotnet, getExtraArgs } from '../utils/dotnetCli';
import { log, logError, showOutput } from '../utils/outputChannel';
import { buildFilter, getProjectPath } from '../execution/filterBuilder';

const PID_REGEX = /Process Id:\s*(\d+)/;

export async function debugTests(
    testRun: vscode.TestRun,
    items: readonly vscode.TestItem[],
    token: vscode.CancellationToken
): Promise<void> {
    if (items.length === 0) { return; }

    const firstItem = items[0];
    const projectPath = findProjectPath(firstItem);
    if (!projectPath) {
        logError('Cannot debug: no project path found for test item');
        return;
    }

    const projectDir = path.dirname(projectPath);
    const { filter } = buildFilter(items);

    const args = ['test', projectPath, '--no-restore'];
    if (filter) {
        args.push('--filter', filter);
    }

    const extraArgs = getExtraArgs();
    if (extraArgs.length > 0) {
        args.push(...extraArgs);
    }

    log('Starting test host in debug mode (VSTEST_HOST_DEBUG=1)...');
    showOutput();

    const proc = spawnDotnet(args, projectDir, { VSTEST_HOST_DEBUG: '1' });

    try {
        const pid = await waitForPid(proc, token);

        if (token.isCancellationRequested) {
            proc.kill();
            return;
        }

        log(`Test host PID: ${pid}. Attaching debugger...`);

        const debugConfig: vscode.DebugConfiguration = {
            type: 'coreclr',
            name: 'Attach to Test Host',
            request: 'attach',
            processId: pid.toString(),
        };

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const started = await vscode.debug.startDebugging(workspaceFolder, debugConfig);

        if (!started) {
            logError('Failed to attach debugger. Make sure the C# extension (or OmniSharp) is installed.');
            proc.kill();
            return;
        }

        // Wait for the process to exit
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
        if (err instanceof Error && err.message !== 'Cancelled') {
            logError('Debug session failed', err);
        }
    }
}

function waitForPid(proc: ChildProcess, token: vscode.CancellationToken): Promise<number> {
    return new Promise<number>((resolve, reject) => {
        let buffer = '';

        const onData = (data: Buffer) => {
            buffer += data.toString();
            const match = buffer.match(PID_REGEX);
            if (match) {
                const pid = parseInt(match[1], 10);
                proc.stdout?.removeListener('data', onData);
                resolve(pid);
            }
        };

        proc.stdout?.on('data', onData);
        proc.stderr?.on('data', (data: Buffer) => {
            buffer += data.toString();
        });

        proc.on('close', (code) => {
            reject(new Error(`Test host exited (code ${code}) before PID was detected`));
        });

        const onCancel = token.onCancellationRequested(() => {
            onCancel.dispose();
            reject(new Error('Cancelled'));
        });

        // Timeout after 60 seconds
        setTimeout(() => {
            reject(new Error('Timed out waiting for test host PID. Is VSTEST_HOST_DEBUG supported?'));
        }, 60_000);
    });
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
