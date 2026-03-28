export interface Logger {
    log(message: string): void;
    logError(message: string, error?: unknown): void;
    logTrace(message: string): void;
    showOutput(): void;
}
