import * as fs from 'fs/promises';
import { logError } from '../utils/outputChannel';

export type TestOutcome = 'Passed' | 'Failed' | 'NotExecuted' | 'Inconclusive' | 'Timeout' | 'Error';

export interface TestResult {
    testName: string;
    outcome: TestOutcome;
    duration: number;
    errorMessage?: string;
    stackTrace?: string;
    stdout?: string;
}

export interface TrxSummary {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
    results: TestResult[];
}

export async function parseTrxFile(trxPath: string): Promise<TrxSummary> {
    const xml = await fs.readFile(trxPath, 'utf-8');
    return parseTrxXml(xml);
}

export function parseTrxXml(xml: string): TrxSummary {
    // Lazy-load to avoid crashing activation if the package is missing
    const { XMLParser } = require('fast-xml-parser');
    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        isArray: (name: string) => name === 'UnitTestResult' || name === 'UnitTest',
    });

    const doc = parser.parse(xml);
    const testRun = doc.TestRun;

    if (!testRun) {
        return emptyResult();
    }

    const results: TestResult[] = [];
    const unitTestResults = getArray(testRun.Results?.UnitTestResult);

    // Build a map from testId -> testName using TestDefinitions
    const testDefs = new Map<string, string>();
    const unitTests = getArray(testRun.TestDefinitions?.UnitTest);
    for (const ut of unitTests) {
        const id = ut['@_id'];
        const name = ut['@_name'];
        if (id && name) {
            testDefs.set(id, name);
        }
    }

    for (const utr of unitTestResults) {
        const testId = utr['@_testId'] ?? '';
        const testName = utr['@_testName'] ?? testDefs.get(testId) ?? 'Unknown';
        const outcome = mapOutcome(utr['@_outcome']);
        const duration = parseDuration(utr['@_duration']);

        let errorMessage: string | undefined;
        let stackTrace: string | undefined;
        let stdout: string | undefined;

        const output = utr.Output;
        if (output) {
            const errorInfo = output.ErrorInfo;
            if (errorInfo) {
                errorMessage = errorInfo.Message ?? undefined;
                stackTrace = errorInfo.StackTrace ?? undefined;
            }
            stdout = output.StdOut ?? undefined;
        }

        results.push({
            testName,
            outcome,
            duration,
            errorMessage,
            stackTrace,
            stdout,
        });
    }

    const counters = testRun.ResultSummary?.Counters;
    const total = parseInt(counters?.['@_total'] ?? '0', 10);
    const passed = parseInt(counters?.['@_passed'] ?? '0', 10);
    const failed = parseInt(counters?.['@_failed'] ?? '0', 10);
    const skipped = total - passed - failed;

    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

    return { total, passed, failed, skipped, duration: totalDuration, results };
}

function mapOutcome(raw: string | undefined): TestOutcome {
    switch (raw) {
        case 'Passed': return 'Passed';
        case 'Failed': return 'Failed';
        case 'NotExecuted': return 'NotExecuted';
        case 'Inconclusive': return 'Inconclusive';
        case 'Timeout': return 'Timeout';
        case 'Error': return 'Error';
        default: return 'NotExecuted';
    }
}

/** Parse TRX duration "HH:MM:SS.FFFFFFF" to milliseconds */
function parseDuration(raw: string | undefined): number {
    if (!raw) { return 0; }

    const match = raw.match(/^(\d+):(\d+):(\d+)(?:\.(\d+))?$/);
    if (!match) { return 0; }

    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const seconds = parseInt(match[3], 10);
    const fraction = match[4] ? parseInt(match[4].substring(0, 3).padEnd(3, '0'), 10) : 0;

    return (hours * 3600 + minutes * 60 + seconds) * 1000 + fraction;
}

function getArray<T>(value: T | T[] | undefined): T[] {
    if (value === undefined || value === null) { return []; }
    return Array.isArray(value) ? value : [value];
}

function emptyResult(): TrxSummary {
    return { total: 0, passed: 0, failed: 0, skipped: 0, duration: 0, results: [] };
}
