export interface Logger {
    log(message: string): void;
    logError(message: string, error?: unknown): void;
    showOutput(): void;
}
