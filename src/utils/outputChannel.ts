import * as vscode from 'vscode';
import { Logger } from './logger';

export class OutputChannelLogger implements Logger {
    private readonly channel: vscode.OutputChannel;

    constructor(channel: vscode.OutputChannel) {
        this.channel = channel;
    }

    log(message: string): void {
        this.channel.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
    }

    logError(message: string, error?: unknown): void {
        const errorMsg = error instanceof Error ? error.message : String(error ?? '');
        this.channel.appendLine(
            `[${new Date().toLocaleTimeString()}] ERROR: ${message} ${errorMsg}`,
        );
    }

    showOutput(): void {
        this.channel.show(true);
    }

    dispose(): void {
        this.channel.dispose();
    }
}

let defaultLogger: OutputChannelLogger | undefined;

function getDefaultLogger(): OutputChannelLogger {
    if (!defaultLogger) {
        const channel = vscode.window.createOutputChannel('C# Test Explorer');
        defaultLogger = new OutputChannelLogger(channel);
    }
    return defaultLogger;
}

export function createLogger(): OutputChannelLogger {
    const channel = vscode.window.createOutputChannel('C# Test Explorer');
    return new OutputChannelLogger(channel);
}

export function log(message: string): void {
    getDefaultLogger().log(message);
}

export function logError(message: string, error?: unknown): void {
    getDefaultLogger().logError(message, error);
}

export function showOutput(): void {
    getDefaultLogger().showOutput();
}

export function disposeChannel(): void {
    defaultLogger?.dispose();
    defaultLogger = undefined;
}
