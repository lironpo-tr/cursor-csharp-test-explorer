import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        root: '.',
        include: ['test/**/*.test.ts'],
        alias: {
            vscode: path.resolve(__dirname, 'test', '__mocks__', 'vscode.ts'),
        },
    },
});
