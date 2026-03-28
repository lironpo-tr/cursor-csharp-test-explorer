import { spawn, ChildProcess } from 'child_process';
import * as vscode from 'vscode';
import { Logger } from './logger';

export interface DotnetResult {
    exitCode: number;
    stdout: string;
    stderr: string;
}

function getDotnetPath(): string {
    return vscode.workspace
        .getConfiguration('csharpTestExplorer')
        .get<string>('dotnetPath', 'dotnet');
}

function getExtraArgs(): string[] {
    const extra = vscode.workspace
        .getConfiguration('csharpTestExplorer')
        .get<string>('testArguments', '');
    return extra ? extra.split(/\s+/).filter(Boolean) : [];
}

export function shouldBuildBeforeTest(): boolean {
    return vscode.workspace
        .getConfiguration('csharpTestExplorer')
        .get<boolean>('buildBeforeTest', true);
}

export async function runDotnet(
    args: string[],
    cwd: string,
    token: vscode.CancellationToken | undefined,
    logger: Logger,
    env?: Record<string, string>,
): Promise<DotnetResult> {
    const dotnetPath = getDotnetPath();
    logger.log(`> ${dotnetPath} ${args.join(' ')}  [cwd: ${cwd}]`);

    return new Promise<DotnetResult>((resolve, reject) => {
        const proc = spawn(dotnetPath, args, {
            cwd,
            env: { ...process.env, ...env },
            shell: true,
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data: Buffer) => {
            stdout += data.toString();
        });

        proc.stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
        });

        const onCancel = token?.onCancellationRequested(() => {
            proc.kill();
            reject(new Error('Cancelled'));
        });

        proc.on('close', (code) => {
            onCancel?.dispose();
            resolve({ exitCode: code ?? 1, stdout, stderr });
        });

        proc.on('error', (err) => {
            onCancel?.dispose();
            logger.logError('Failed to spawn dotnet', err);
            reject(err);
        });
    });
}

export function spawnDotnet(
    args: string[],
    cwd: string,
    logger: Logger,
    env?: Record<string, string>,
): ChildProcess {
    const dotnetPath = getDotnetPath();
    logger.log(`> ${dotnetPath} ${args.join(' ')}  [cwd: ${cwd}]`);

    return spawn(dotnetPath, args, {
        cwd,
        env: { ...process.env, ...env },
        shell: true,
    });
}

export { getExtraArgs };
