import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => {
    const EventEmitter = class {
        fire = vi.fn();
        dispose = vi.fn();
        event = vi.fn();
    };

    return {
        EventEmitter,
        TreeItem: class {
            constructor(
                public label: string,
                public collapsibleState?: number,
            ) {}
        },
        TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
        ThemeIcon: class {
            constructor(
                public id: string,
                public color?: unknown,
            ) {}
        },
        ThemeColor: class {
            constructor(public id: string) {}
        },
        Uri: {
            file: (p: string) => ({ fsPath: p, toString: () => p }),
        },
        Range: class {
            constructor(
                public startLine: number,
                public startCol: number,
                public endLine: number,
                public endCol: number,
            ) {}
        },
        window: {
            createOutputChannel: () => ({
                appendLine: vi.fn(),
                show: vi.fn(),
                dispose: vi.fn(),
            }),
        },
    };
});

import { TestTreeProvider, TestTreeNode } from '../../src/ui/testTreeProvider';
import { applyResultState, matchAndApplyResults } from '../../src/execution/resultMatcher';
import type { TrxSummary } from '../../src/execution/trxParser';
import type { Logger } from '../../src/utils/logger';

function createMockLogger(): Logger {
    return { log: vi.fn(), logError: vi.fn(), showOutput: vi.fn() };
}

function makeMethodNode(fqn: string, projectPath = '/proj.csproj'): TestTreeNode {
    const node = new TestTreeNode(`method:${projectPath}:${fqn}`, fqn.split('.').pop()!, 'method', fqn);
    node.projectPath = projectPath;
    return node;
}

describe('applyResultState', () => {
    let treeProvider: TestTreeProvider;

    beforeEach(() => {
        treeProvider = new TestTreeProvider();
    });

    it('should set the node state to the given value', () => {
        const node = makeMethodNode('NS.Class.Test1');

        applyResultState(node, 'passed', undefined, treeProvider);

        expect(node.state).toBe('passed');
    });

    it('should apply error details to the node', () => {
        const node = makeMethodNode('NS.Class.Test1');
        const details = {
            errorMessage: 'Expected true but got false',
            stackTrace: 'at NS.Class.Test1() in Class.cs:line 10',
            duration: 150,
        };

        applyResultState(node, 'failed', details, treeProvider);

        expect(node.state).toBe('failed');
        expect(node.errorMessage).toBe('Expected true but got false');
        expect(node.stackTrace).toBe('at NS.Class.Test1() in Class.cs:line 10');
        expect(node.duration).toBe(150);
    });

    it('should not overwrite fields when details is undefined', () => {
        const node = makeMethodNode('NS.Class.Test1');
        node.errorMessage = 'old error';

        applyResultState(node, 'passed', undefined, treeProvider);

        expect(node.state).toBe('passed');
        expect(node.errorMessage).toBe('old error');
    });
});

describe('matchAndApplyResults', () => {
    let treeProvider: TestTreeProvider;
    let mockLogger: Logger;

    beforeEach(() => {
        treeProvider = new TestTreeProvider();
        mockLogger = createMockLogger();
        vi.clearAllMocks();
    });

    it('should match by exact FQN', () => {
        const node = makeMethodNode('MyNamespace.MyClass.TestMethod');
        const summary: TrxSummary = {
            total: 1,
            passed: 1,
            failed: 0,
            skipped: 0,
            duration: 100,
            results: [{ testName: 'MyNamespace.MyClass.TestMethod', outcome: 'Passed', duration: 100 }],
        };

        matchAndApplyResults(summary, [node], treeProvider, mockLogger);

        expect(node.state).toBe('passed');
    });

    it('should match by normalized name stripping spaces after commas', () => {
        const node = makeMethodNode('NS.Class.Add(1,2,3)');
        const summary: TrxSummary = {
            total: 1,
            passed: 1,
            failed: 0,
            skipped: 0,
            duration: 50,
            results: [{ testName: 'NS.Class.Add(1, 2, 3)', outcome: 'Passed', duration: 50 }],
        };

        matchAndApplyResults(summary, [node], treeProvider, mockLogger);

        expect(node.state).toBe('passed');
    });

    it('should match by short name fallback when FQN does not match', () => {
        const node = makeMethodNode('MyNamespace.MyClass.SomeTest');
        const summary: TrxSummary = {
            total: 1,
            passed: 0,
            failed: 1,
            skipped: 0,
            duration: 200,
            results: [
                {
                    testName: 'DifferentNamespace.DifferentClass.SomeTest',
                    outcome: 'Failed',
                    errorMessage: 'Assertion failed',
                    duration: 200,
                },
            ],
        };

        matchAndApplyResults(summary, [node], treeProvider, mockLogger);

        expect(node.state).toBe('failed');
        expect(node.errorMessage).toBe('Assertion failed');
    });

    it('should map Failed outcome to failed state', () => {
        const node = makeMethodNode('NS.Class.Test1');
        const summary: TrxSummary = {
            total: 1,
            passed: 0,
            failed: 1,
            skipped: 0,
            duration: 0,
            results: [{ testName: 'NS.Class.Test1', outcome: 'Failed', duration: 0 }],
        };

        matchAndApplyResults(summary, [node], treeProvider, mockLogger);

        expect(node.state).toBe('failed');
    });

    it('should map Error outcome to failed state', () => {
        const node = makeMethodNode('NS.Class.Test1');
        const summary: TrxSummary = {
            total: 1,
            passed: 0,
            failed: 1,
            skipped: 0,
            duration: 0,
            results: [{ testName: 'NS.Class.Test1', outcome: 'Error', duration: 0 }],
        };

        matchAndApplyResults(summary, [node], treeProvider, mockLogger);

        expect(node.state).toBe('failed');
    });

    it('should map Timeout outcome to failed state', () => {
        const node = makeMethodNode('NS.Class.Test1');
        const summary: TrxSummary = {
            total: 1,
            passed: 0,
            failed: 1,
            skipped: 0,
            duration: 0,
            results: [{ testName: 'NS.Class.Test1', outcome: 'Timeout', duration: 0 }],
        };

        matchAndApplyResults(summary, [node], treeProvider, mockLogger);

        expect(node.state).toBe('failed');
    });

    it('should map NotExecuted outcome to skipped state', () => {
        const node = makeMethodNode('NS.Class.Test1');
        const summary: TrxSummary = {
            total: 1,
            passed: 0,
            failed: 0,
            skipped: 1,
            duration: 0,
            results: [{ testName: 'NS.Class.Test1', outcome: 'NotExecuted', duration: 0 }],
        };

        matchAndApplyResults(summary, [node], treeProvider, mockLogger);

        expect(node.state).toBe('skipped');
    });

    it('should match multiple results to their corresponding nodes', () => {
        const node1 = makeMethodNode('NS.Class.Test1');
        const node2 = makeMethodNode('NS.Class.Test2');
        const summary: TrxSummary = {
            total: 2,
            passed: 1,
            failed: 1,
            skipped: 0,
            duration: 300,
            results: [
                { testName: 'NS.Class.Test1', outcome: 'Passed', duration: 100 },
                { testName: 'NS.Class.Test2', outcome: 'Failed', duration: 200 },
            ],
        };

        matchAndApplyResults(summary, [node1, node2], treeProvider, mockLogger);

        expect(node1.state).toBe('passed');
        expect(node2.state).toBe('failed');
    });

    it('should match by suffix when TRX uses full FQN and node uses partial', () => {
        const node = makeMethodNode('Class.TestMethod');
        const summary: TrxSummary = {
            total: 1,
            passed: 1,
            failed: 0,
            skipped: 0,
            duration: 50,
            results: [{ testName: 'MyNamespace.Class.TestMethod', outcome: 'Passed', duration: 50 }],
        };

        matchAndApplyResults(summary, [node], treeProvider, mockLogger);

        expect(node.state).toBe('passed');
    });

    it('should match base name without parameters when exact match fails', () => {
        const node = makeMethodNode('NS.Class.Add');
        const summary: TrxSummary = {
            total: 1,
            passed: 1,
            failed: 0,
            skipped: 0,
            duration: 50,
            results: [{ testName: 'NS.Class.Add(1,2,3)', outcome: 'Passed', duration: 50 }],
        };

        matchAndApplyResults(summary, [node], treeProvider, mockLogger);

        expect(node.state).toBe('passed');
    });

    it('should handle empty results gracefully', () => {
        const node = makeMethodNode('NS.Class.Test1');
        const summary: TrxSummary = {
            total: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
            duration: 0,
            results: [],
        };

        matchAndApplyResults(summary, [node], treeProvider, mockLogger);

        expect(node.state).toBe('none');
    });

    it('should handle empty method nodes gracefully', () => {
        const summary: TrxSummary = {
            total: 1,
            passed: 1,
            failed: 0,
            skipped: 0,
            duration: 50,
            results: [{ testName: 'NS.Class.Test1', outcome: 'Passed', duration: 50 }],
        };

        expect(() => matchAndApplyResults(summary, [], treeProvider, mockLogger)).not.toThrow();
    });
});
