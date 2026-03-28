import * as fs from 'fs/promises';
import { XMLParser } from 'fast-xml-parser';

// ── Parsed TRX XML interfaces ──
// These mirror the structure returned by fast-xml-parser when parsing
// a .trx file with `ignoreAttributes: false` and `attributeNamePrefix: '@_'`.

export interface TrxErrorInfo {
    Message?: string;
    StackTrace?: string;
}

export interface TrxOutput {
    ErrorInfo?: TrxErrorInfo;
    StdOut?: string;
}

export interface TrxUnitTestResult {
    '@_testId'?: string;
    '@_testName'?: string;
    '@_outcome'?: string;
    '@_duration'?: string;
    Output?: TrxOutput;
}

export interface TrxUnitTestDefinition {
    '@_id'?: string;
    '@_name'?: string;
}

export interface TrxCounters {
    '@_total'?: string;
    '@_passed'?: string;
    '@_failed'?: string;
}

export interface TrxResultSummary {
    Counters?: TrxCounters;
}

export interface TrxTestRun {
    TestDefinitions?: {
        UnitTest?: TrxUnitTestDefinition | TrxUnitTestDefinition[];
    };
    Results?: {
        UnitTestResult?: TrxUnitTestResult | TrxUnitTestResult[];
    };
    ResultSummary?: TrxResultSummary;
}

export interface TrxDocument {
    TestRun?: TrxTestRun;
}

// ── Public result types ──

export type TestOutcome =
    | 'Passed'
    | 'Failed'
    | 'NotExecuted'
    | 'Inconclusive'
    | 'Timeout'
    | 'Error';

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
    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        isArray: (name: string) => name === 'UnitTestResult' || name === 'UnitTest',
    });

    const doc: TrxDocument = parser.parse(xml);
    const testRun: TrxTestRun | undefined = doc.TestRun;

    if (!testRun) {
        return emptyResult();
    }

    const results: TestResult[] = [];
    const unitTestResults: TrxUnitTestResult[] = getArray(testRun.Results?.UnitTestResult);

    const testDefs = new Map<string, string>();
    const unitTests: TrxUnitTestDefinition[] = getArray(testRun.TestDefinitions?.UnitTest);
    for (const ut of unitTests) {
        const id = ut['@_id'];
        const name = ut['@_name'];
        if (id && name) {
            testDefs.set(id, name);
        }
    }

    for (const utr of unitTestResults) {
        const testId: string = utr['@_testId'] ?? '';
        const testName: string = utr['@_testName'] ?? testDefs.get(testId) ?? 'Unknown';
        const outcome: TestOutcome = mapOutcome(utr['@_outcome']);
        const duration: number = parseDuration(utr['@_duration']);

        let errorMessage: string | undefined;
        let stackTrace: string | undefined;
        let stdout: string | undefined;

        const output: TrxOutput | undefined = utr.Output;
        if (output) {
            const errorInfo: TrxErrorInfo | undefined = output.ErrorInfo;
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

    const counters: TrxCounters | undefined = testRun.ResultSummary?.Counters;
    const total: number = parseInt(counters?.['@_total'] ?? '0', 10);
    const passed: number = parseInt(counters?.['@_passed'] ?? '0', 10);
    const failed: number = parseInt(counters?.['@_failed'] ?? '0', 10);
    const skipped: number = total - passed - failed;

    const totalDuration: number = results.reduce((sum, r) => sum + r.duration, 0);

    return { total, passed, failed, skipped, duration: totalDuration, results };
}

function mapOutcome(raw: string | undefined): TestOutcome {
    switch (raw) {
        case 'Passed':
            return 'Passed';
        case 'Failed':
            return 'Failed';
        case 'NotExecuted':
            return 'NotExecuted';
        case 'Inconclusive':
            return 'Inconclusive';
        case 'Timeout':
            return 'Timeout';
        case 'Error':
            return 'Error';
        default:
            return 'NotExecuted';
    }
}

/** Parse TRX duration "HH:MM:SS.FFFFFFF" to milliseconds */
function parseDuration(raw: string | undefined): number {
    if (!raw) {
        return 0;
    }

    const match = raw.match(/^(\d+):(\d+):(\d+)(?:\.(\d+))?$/);
    if (!match) {
        return 0;
    }

    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const seconds = parseInt(match[3], 10);
    const fraction = match[4] ? parseInt(match[4].substring(0, 3).padEnd(3, '0'), 10) : 0;

    return (hours * 3600 + minutes * 60 + seconds) * 1000 + fraction;
}

function getArray<T>(value: T | T[] | undefined): T[] {
    if (value === undefined || value === null) {
        return [];
    }
    return Array.isArray(value) ? value : [value];
}

function emptyResult(): TrxSummary {
    return { total: 0, passed: 0, failed: 0, skipped: 0, duration: 0, results: [] };
}
