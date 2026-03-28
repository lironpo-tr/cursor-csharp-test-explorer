import { describe, it, expect } from 'vitest';
import { parseTrxXml } from '../../src/execution/trxParser';

function makeTrx({
    results = '',
    definitions = '',
    counters = '',
}: {
    results?: string;
    definitions?: string;
    counters?: string;
} = {}): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<TestRun>
  <TestDefinitions>${definitions}</TestDefinitions>
  <Results>${results}</Results>
  <ResultSummary>
    <Counters ${counters} />
  </ResultSummary>
</TestRun>`;
}

const PASSED_RESULT = `
  <UnitTestResult testId="id-1" testName="MyNamespace.MyClass.PassingTest"
    outcome="Passed" duration="00:00:01.2340000" />`;

const FAILED_RESULT = `
  <UnitTestResult testId="id-2" testName="MyNamespace.MyClass.FailingTest"
    outcome="Failed" duration="00:00:00.5000000">
    <Output>
      <ErrorInfo>
        <Message>Expected 1 but got 2</Message>
        <StackTrace>at MyNamespace.MyClass.FailingTest() in MyClass.cs:line 42</StackTrace>
      </ErrorInfo>
    </Output>
  </UnitTestResult>`;

const SKIPPED_RESULT = `
  <UnitTestResult testId="id-3" testName="MyNamespace.MyClass.SkippedTest"
    outcome="NotExecuted" duration="00:00:00.0000000" />`;

const STDOUT_RESULT = `
  <UnitTestResult testId="id-4" testName="MyNamespace.MyClass.TestWithOutput"
    outcome="Passed" duration="00:00:00.1000000">
    <Output>
      <StdOut>Hello from test</StdOut>
    </Output>
  </UnitTestResult>`;

describe('parseTrxXml', () => {
    it('should return empty result for xml without TestRun element', () => {
        const xml = '<?xml version="1.0"?><Root></Root>';

        const result = parseTrxXml(xml);

        expect(result).toEqual({
            total: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
            duration: 0,
            results: [],
        });
    });

    it('should return empty result for TestRun with no results', () => {
        const xml = makeTrx();

        const result = parseTrxXml(xml);

        expect(result.results).toHaveLength(0);
        expect(result.total).toBe(0);
    });

    it('should parse a single passing test', () => {
        const xml = makeTrx({
            results: PASSED_RESULT,
            counters: 'total="1" passed="1" failed="0"',
        });

        const result = parseTrxXml(xml);

        expect(result.total).toBe(1);
        expect(result.passed).toBe(1);
        expect(result.failed).toBe(0);
        expect(result.skipped).toBe(0);
        expect(result.results).toHaveLength(1);
        expect(result.results[0]).toMatchObject({
            testName: 'MyNamespace.MyClass.PassingTest',
            outcome: 'Passed',
        });
    });

    it('should parse duration in HH:MM:SS.FFFFFFF format to milliseconds', () => {
        const xml = makeTrx({
            results: PASSED_RESULT,
            counters: 'total="1" passed="1" failed="0"',
        });

        const result = parseTrxXml(xml);

        expect(result.results[0].duration).toBe(1234);
    });

    it('should parse a failed test with error message and stack trace', () => {
        const xml = makeTrx({
            results: FAILED_RESULT,
            counters: 'total="1" passed="0" failed="1"',
        });

        const result = parseTrxXml(xml);

        expect(result.failed).toBe(1);
        const failedTest = result.results[0];
        expect(failedTest.outcome).toBe('Failed');
        expect(failedTest.errorMessage).toBe('Expected 1 but got 2');
        expect(failedTest.stackTrace).toContain('MyClass.cs:line 42');
    });

    it('should parse a skipped test', () => {
        const xml = makeTrx({
            results: SKIPPED_RESULT,
            counters: 'total="1" passed="0" failed="0"',
        });

        const result = parseTrxXml(xml);

        expect(result.skipped).toBe(1);
        expect(result.results[0].outcome).toBe('NotExecuted');
    });

    it('should capture stdout output', () => {
        const xml = makeTrx({
            results: STDOUT_RESULT,
            counters: 'total="1" passed="1" failed="0"',
        });

        const result = parseTrxXml(xml);

        expect(result.results[0].stdout).toBe('Hello from test');
    });

    it('should parse mixed results correctly', () => {
        const xml = makeTrx({
            results: PASSED_RESULT + FAILED_RESULT + SKIPPED_RESULT,
            counters: 'total="3" passed="1" failed="1"',
        });

        const result = parseTrxXml(xml);

        expect(result.total).toBe(3);
        expect(result.passed).toBe(1);
        expect(result.failed).toBe(1);
        expect(result.skipped).toBe(1);
        expect(result.results).toHaveLength(3);
    });

    it('should compute total duration from individual test durations', () => {
        const xml = makeTrx({
            results: PASSED_RESULT + STDOUT_RESULT,
            counters: 'total="2" passed="2" failed="0"',
        });

        const result = parseTrxXml(xml);

        expect(result.duration).toBe(1234 + 100);
    });

    it('should resolve test name from TestDefinitions when testName attribute is missing', () => {
        const results = `
            <UnitTestResult testId="def-1" outcome="Passed" duration="00:00:00.0010000" />`;
        const definitions = `
            <UnitTest id="def-1" name="DefinedTestName" />`;
        const xml = makeTrx({
            results,
            definitions,
            counters: 'total="1" passed="1" failed="0"',
        });

        const result = parseTrxXml(xml);

        expect(result.results[0].testName).toBe('DefinedTestName');
    });

    it('should use "Unknown" when test name cannot be resolved', () => {
        const results = `
            <UnitTestResult testId="no-def" outcome="Passed" duration="00:00:00.0010000" />`;
        const xml = makeTrx({
            results,
            counters: 'total="1" passed="1" failed="0"',
        });

        const result = parseTrxXml(xml);

        expect(result.results[0].testName).toBe('Unknown');
    });

    it('should map all known outcome values', () => {
        const outcomes: string[] = [
            'Passed',
            'Failed',
            'NotExecuted',
            'Inconclusive',
            'Timeout',
            'Error',
        ];
        const results = outcomes
            .map(
                (o, i) =>
                    `<UnitTestResult testId="id-${i}" testName="Test${i}" outcome="${o}" duration="00:00:00.0010000" />`,
            )
            .join('\n');
        const xml = makeTrx({
            results,
            counters: `total="${outcomes.length}" passed="1" failed="1"`,
        });

        const result = parseTrxXml(xml);

        const actualOutcomes = result.results.map((r) => r.outcome);
        expect(actualOutcomes).toEqual(outcomes);
    });

    it('should default unknown outcomes to NotExecuted', () => {
        const results = `
            <UnitTestResult testId="id-1" testName="Test1" outcome="SomethingWeird" duration="00:00:00.0010000" />`;
        const xml = makeTrx({
            results,
            counters: 'total="1" passed="0" failed="0"',
        });

        const result = parseTrxXml(xml);

        expect(result.results[0].outcome).toBe('NotExecuted');
    });

    it('should handle duration without fractional seconds', () => {
        const results = `
            <UnitTestResult testId="id-1" testName="Test1" outcome="Passed" duration="00:01:30" />`;
        const xml = makeTrx({
            results,
            counters: 'total="1" passed="1" failed="0"',
        });

        const result = parseTrxXml(xml);

        expect(result.results[0].duration).toBe(90_000);
    });

    it('should handle missing duration attribute gracefully', () => {
        const results = `
            <UnitTestResult testId="id-1" testName="Test1" outcome="Passed" />`;
        const xml = makeTrx({
            results,
            counters: 'total="1" passed="1" failed="0"',
        });

        const result = parseTrxXml(xml);

        expect(result.results[0].duration).toBe(0);
    });

    it('should handle missing counters gracefully', () => {
        const xml = `<?xml version="1.0"?>
<TestRun>
  <Results>${PASSED_RESULT}</Results>
</TestRun>`;

        const result = parseTrxXml(xml);

        expect(result.total).toBe(0);
        expect(result.results).toHaveLength(1);
    });

    it('should handle failed test without ErrorInfo in Output', () => {
        const results = `
            <UnitTestResult testId="id-1" testName="Test1" outcome="Failed" duration="00:00:00.0010000">
                <Output>
                    <StdOut>Some output before failure</StdOut>
                </Output>
            </UnitTestResult>`;
        const xml = makeTrx({
            results,
            counters: 'total="1" passed="0" failed="1"',
        });

        const result = parseTrxXml(xml);

        expect(result.results[0].errorMessage).toBeUndefined();
        expect(result.results[0].stdout).toBe('Some output before failure');
    });

    it('should handle short fractional duration like 00:00:00.5', () => {
        const results = `
            <UnitTestResult testId="id-1" testName="Test1" outcome="Passed" duration="00:00:00.5" />`;
        const xml = makeTrx({
            results,
            counters: 'total="1" passed="1" failed="0"',
        });

        const result = parseTrxXml(xml);

        expect(result.results[0].duration).toBe(500);
    });
});
