import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { findTrxFile } from '../../src/execution/testRunner';

const TEST_DIR_PREFIX = 'cursor-trx-test-';

let testDir: string;

beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), TEST_DIR_PREFIX));
});

afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
});

describe('findTrxFile', () => {
    it('should find a .trx file in the root of the directory', async () => {
        const trxPath = path.join(testDir, 'results.trx');
        await fs.writeFile(trxPath, '<TestRun />');

        const result = await findTrxFile(testDir, 0, 0);

        expect(result).toBe(trxPath);
    });

    it('should find a .trx file with a non-standard name', async () => {
        const trxPath = path.join(testDir, 'user_machine_2024-01-15.trx');
        await fs.writeFile(trxPath, '<TestRun />');

        const result = await findTrxFile(testDir, 0, 0);

        expect(result).toBe(trxPath);
    });

    it('should find a .trx file nested in a subdirectory', async () => {
        const subDir = path.join(testDir, 'sub');
        await fs.mkdir(subDir);
        const trxPath = path.join(subDir, 'results.trx');
        await fs.writeFile(trxPath, '<TestRun />');

        const result = await findTrxFile(testDir, 0, 0);

        expect(result).toBe(trxPath);
    });

    it('should return undefined when no .trx files exist', async () => {
        await fs.writeFile(path.join(testDir, 'readme.txt'), 'not a trx');

        const result = await findTrxFile(testDir, 0, 0);

        expect(result).toBeUndefined();
    });

    it('should return undefined for an empty directory', async () => {
        const result = await findTrxFile(testDir, 0, 0);

        expect(result).toBeUndefined();
    });

    it('should return undefined when directory does not exist', async () => {
        const nonExistent = path.join(testDir, 'does-not-exist');

        const result = await findTrxFile(nonExistent, 0, 0);

        expect(result).toBeUndefined();
    });

    it('should ignore non-trx files', async () => {
        await fs.writeFile(path.join(testDir, 'results.xml'), '<xml />');
        await fs.writeFile(path.join(testDir, 'results.json'), '{}');
        await fs.writeFile(path.join(testDir, 'log.txt'), 'log');

        const result = await findTrxFile(testDir, 0, 0);

        expect(result).toBeUndefined();
    });

    it('should retry and find a .trx file that appears after a delay', async () => {
        const trxPath = path.join(testDir, 'results.trx');

        setTimeout(async () => {
            await fs.writeFile(trxPath, '<TestRun />');
        }, 100);

        const result = await findTrxFile(testDir, 3, 100);

        expect(result).toBe(trxPath);
    });

    it('should return undefined after exhausting all retries', async () => {
        const result = await findTrxFile(testDir, 2, 10);

        expect(result).toBeUndefined();
    });

    it('should return on first attempt when file exists immediately', async () => {
        const trxPath = path.join(testDir, 'results.trx');
        await fs.writeFile(trxPath, '<TestRun />');

        const start = Date.now();
        const result = await findTrxFile(testDir, 3, 500);
        const elapsed = Date.now() - start;

        expect(result).toBe(trxPath);
        expect(elapsed).toBeLessThan(200);
    });
});
