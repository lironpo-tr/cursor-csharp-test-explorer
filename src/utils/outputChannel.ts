import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

export function getOutputChannel(): vscode.OutputChannel {
    if (!channel) {
        channel = vscode.window.createOutputChannel('C# Test Explorer');
    }
    return channel;
}

export function log(message: string): void {
    getOutputChannel().appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
}

export function logError(message: string, error?: unknown): void {
    const errorMsg = error instanceof Error ? error.message : String(error ?? '');
    getOutputChannel().appendLine(
        `[${new Date().toLocaleTimeString()}] ERROR: ${message} ${errorMsg}`,
    );
}

export function showOutput(): void {
    getOutputChannel().show(true);
}

export function disposeChannel(): void {
    channel?.dispose();
    channel = undefined;
}
