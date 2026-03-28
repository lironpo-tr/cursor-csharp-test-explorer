import * as vscode from 'vscode';
import * as path from 'path';
import { ChildProcess } from 'child_process';
import { TestTreeNode } from '../ui/testTreeProvider';
import { getExtraArgs } from '../utils/dotnetCli';
import { log, logError, showOutput } from '../utils/outputChannel';
import { buildFilterForNode } from '../execution/testRunner';

const PID_REGEX = /Process Id:\s*(\d+)/;

export async function launchDebugSession(
    node: TestTreeNode,
    token: vscode.CancellationToken,
): Promise<void> {
    if (!node.projectPath) {
        logError('No project path for node');
        return;
    }

    const projectDir = path.dirname(node.projectPath);
    const args = ['test', node.projectPath, '--no-restore'];

    const filter = buildFilterForNode(node);
    if (filter) {
        args.push('--filter', filter);
    }

    const extraArgs = getExtraArgs();
    if (extraArgs.length > 0) {
        args.push(...extraArgs);
    }

    log('Starting test host with VSTEST_HOST_DEBUG=1...');
    showOutput();

    const { spawnDotnet } = await import('../utils/dotnetCli');
    const proc = spawnDotnet(args, projectDir, { VSTEST_HOST_DEBUG: '1' });

    try {
        const pid = await waitForPid(proc, token);

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
        if (!(err instanceof Error && err.message === 'Cancelled')) {
            logError('Debug failed', err);
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
                proc.stdout?.removeListener('data', onData);
                resolve(parseInt(match[1], 10));
            }
        };

        proc.stdout?.on('data', onData);
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
}
