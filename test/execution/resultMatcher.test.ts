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
import type { DiscoveredTest } from '../../src/discovery/dotnetDiscoverer';
import type { TestProject } from '../../src/discovery/projectDetector';
import type { Logger } from '../../src/utils/logger';

function createMockLogger(): Logger {
    return { log: vi.fn(), logError: vi.fn(), logTrace: vi.fn(), showOutput: vi.fn() };
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

    it('should match results for tests selected from different classes', () => {
        const nodeA = makeMethodNode('NS.ClassA.TestAlpha');
        const nodeB = makeMethodNode('NS.ClassB.TestBeta');
        const nodeC = makeMethodNode('NS.ClassC.TestGamma');
        const summary: TrxSummary = {
            total: 3,
            passed: 2,
            failed: 1,
            skipped: 0,
            duration: 450,
            results: [
                { testName: 'NS.ClassA.TestAlpha', outcome: 'Passed', duration: 100 },
                { testName: 'NS.ClassB.TestBeta', outcome: 'Failed', errorMessage: 'assertion failed', duration: 200 },
                { testName: 'NS.ClassC.TestGamma', outcome: 'Passed', duration: 150 },
            ],
        };

        matchAndApplyResults(summary, [nodeA, nodeB, nodeC], treeProvider, mockLogger);

        expect(nodeA.state).toBe('passed');
        expect(nodeB.state).toBe('failed');
        expect(nodeB.errorMessage).toBe('assertion failed');
        expect(nodeC.state).toBe('passed');
    });

    it('should leave unmatched nodes unchanged when only a subset has results', () => {
        const node1 = makeMethodNode('NS.Class.Test1');
        const node2 = makeMethodNode('NS.Class.Test2');
        const node3 = makeMethodNode('NS.Class.Test3');
        const summary: TrxSummary = {
            total: 2,
            passed: 2,
            failed: 0,
            skipped: 0,
            duration: 200,
            results: [
                { testName: 'NS.Class.Test1', outcome: 'Passed', duration: 100 },
                { testName: 'NS.Class.Test3', outcome: 'Passed', duration: 100 },
            ],
        };

        matchAndApplyResults(summary, [node1, node2, node3], treeProvider, mockLogger);

        expect(node1.state).toBe('passed');
        expect(node2.state).toBe('none');
        expect(node3.state).toBe('passed');
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

function makeProject(name: string, csprojPath: string): TestProject {
    return {
        projectName: name,
        csprojPath,
        projectDir: csprojPath.replace(/[/\\][^/\\]+$/, ''),
    } as TestProject;
}

function makeTest(
    ns: string,
    cls: string,
    method: string,
    overrides: Partial<DiscoveredTest> = {},
): DiscoveredTest {
    return {
        fullyQualifiedName: `${ns}.${cls}.${method}`,
        namespace: ns,
        className: cls,
        methodName: method,
        displayName: method,
        sourceFile: `${cls}.cs`,
        ...overrides,
    } as DiscoveredTest;
}

function buildTreeWithTests(tests: DiscoveredTest[]): TestTreeProvider {
    const provider = new TestTreeProvider();
    const project = makeProject('TestProj', '/repo/TestProj/TestProj.csproj');
    const testsByProject = new Map<string, DiscoveredTest[]>();
    testsByProject.set(project.csprojPath, tests);
    provider.buildTree([project], testsByProject);
    return provider;
}

describe('matchAndApplyResults — TestCaseSource (dynamic cases)', () => {
    let mockLogger: Logger;

    beforeEach(() => {
        mockLogger = createMockLogger();
        vi.clearAllMocks();
    });

    it('should create dynamic case nodes when TRX uses FQN with params', () => {
        const provider = buildTreeWithTests([
            makeTest('NS', 'Cls', 'Add'),
        ]);
        const methodNodes = provider.getAllMethodNodes();
        const summary: TrxSummary = {
            total: 2,
            passed: 2,
            failed: 0,
            skipped: 0,
            duration: 100,
            results: [
                { testName: 'NS.Cls.Add(1,2,3)', outcome: 'Passed', duration: 50 },
                { testName: 'NS.Cls.Add(4,5,9)', outcome: 'Passed', duration: 50 },
            ],
        };

        matchAndApplyResults(summary, methodNodes, provider, mockLogger);

        const methodNode = provider.getNodeByFqn('NS.Cls.Add');
        expect(methodNode).toBeDefined();
        expect(methodNode!.children).toHaveLength(2);
        expect(methodNode!.children[0].nodeType).toBe('parameterizedCase');
        expect(methodNode!.children[1].nodeType).toBe('parameterizedCase');
        expect(methodNode!.children[0].state).toBe('passed');
        expect(methodNode!.children[1].state).toBe('passed');
    });

    it('should create dynamic case nodes when TRX uses short names (no namespace)', () => {
        const provider = buildTreeWithTests([
            makeTest('MyNamespace', 'MyClass', 'Calculate'),
        ]);
        const methodNodes = provider.getAllMethodNodes();
        const summary: TrxSummary = {
            total: 2,
            passed: 1,
            failed: 1,
            skipped: 0,
            duration: 200,
            results: [
                { testName: 'Calculate(10,20,30)', outcome: 'Passed', duration: 100 },
                { testName: 'Calculate(1,1,3)', outcome: 'Failed', errorMessage: 'Expected 3 but got 2', duration: 100 },
            ],
        };

        matchAndApplyResults(summary, methodNodes, provider, mockLogger);

        const methodNode = provider.getNodeByFqn('MyNamespace.MyClass.Calculate');
        expect(methodNode).toBeDefined();
        expect(methodNode!.children).toHaveLength(2);
        expect(methodNode!.children[0].state).toBe('passed');
        expect(methodNode!.children[1].state).toBe('failed');
        expect(methodNode!.children[1].errorMessage).toBe('Expected 3 but got 2');
    });

    it('should propagate failed state to parent when any child fails', () => {
        const provider = buildTreeWithTests([
            makeTest('NS', 'Cls', 'Multiply'),
        ]);
        const methodNodes = provider.getAllMethodNodes();
        const summary: TrxSummary = {
            total: 3,
            passed: 2,
            failed: 1,
            skipped: 0,
            duration: 150,
            results: [
                { testName: 'NS.Cls.Multiply(2,3,6)', outcome: 'Passed', duration: 50 },
                { testName: 'NS.Cls.Multiply(0,5,0)', outcome: 'Passed', duration: 50 },
                { testName: 'NS.Cls.Multiply(-1,3,-4)', outcome: 'Failed', duration: 50 },
            ],
        };

        matchAndApplyResults(summary, methodNodes, provider, mockLogger);

        const methodNode = provider.getNodeByFqn('NS.Cls.Multiply');
        expect(methodNode).toBeDefined();
        expect(methodNode!.children).toHaveLength(3);
        expect(methodNode!.state).toBe('failed');
    });

    it('should set display name correctly for dynamic case nodes', () => {
        const provider = buildTreeWithTests([
            makeTest('NS', 'Cls', 'Format'),
        ]);
        const methodNodes = provider.getAllMethodNodes();
        const summary: TrxSummary = {
            total: 1,
            passed: 1,
            failed: 0,
            skipped: 0,
            duration: 50,
            results: [
                { testName: 'NS.Cls.Format("hello","world")', outcome: 'Passed', duration: 50 },
            ],
        };

        matchAndApplyResults(summary, methodNodes, provider, mockLogger);

        const methodNode = provider.getNodeByFqn('NS.Cls.Format');
        expect(methodNode!.children).toHaveLength(1);
        expect(methodNode!.children[0].label).toBe('Format("hello","world")');
    });

    it('should construct correct FQN for dynamic case nodes from short TRX names', () => {
        const provider = buildTreeWithTests([
            makeTest('App.Tests', 'MathTests', 'Add'),
        ]);
        const methodNodes = provider.getAllMethodNodes();
        const summary: TrxSummary = {
            total: 1,
            passed: 1,
            failed: 0,
            skipped: 0,
            duration: 50,
            results: [
                { testName: 'Add(1,2,3)', outcome: 'Passed', duration: 50 },
            ],
        };

        matchAndApplyResults(summary, methodNodes, provider, mockLogger);

        const methodNode = provider.getNodeByFqn('App.Tests.MathTests.Add');
        expect(methodNode!.children).toHaveLength(1);
        expect(methodNode!.children[0].fqn).toBe('App.Tests.MathTests.Add(1,2,3)');
    });

    it('should not log unmatched for TestCaseSource results with short names', () => {
        const provider = buildTreeWithTests([
            makeTest('NS', 'Cls', 'Divide'),
        ]);
        const methodNodes = provider.getAllMethodNodes();
        const summary: TrxSummary = {
            total: 1,
            passed: 1,
            failed: 0,
            skipped: 0,
            duration: 50,
            results: [
                { testName: 'Divide(10,2,5)', outcome: 'Passed', duration: 50 },
            ],
        };

        matchAndApplyResults(summary, methodNodes, provider, mockLogger);

        expect(mockLogger.log).not.toHaveBeenCalledWith(
            expect.stringContaining('Unmatched result'),
        );
    });
});

describe('matchAndApplyResults — TestCase duplicate prevention', () => {
    let mockLogger: Logger;

    beforeEach(() => {
        mockLogger = createMockLogger();
        vi.clearAllMocks();
    });

    it('should not duplicate discovered parameterized cases when TRX strips whitespace', () => {
        const provider = buildTreeWithTests([
            makeTest('NS', 'Cls', 'Add', {
                fullyQualifiedName: 'NS.Cls.Add(1, 2)',
                displayName: 'Add(1, 2)',
                parameters: '1, 2',
            }),
            makeTest('NS', 'Cls', 'Add', {
                fullyQualifiedName: 'NS.Cls.Add(3, 4)',
                displayName: 'Add(3, 4)',
                parameters: '3, 4',
            }),
        ]);
        const methodNodes = provider.getAllMethodNodes();
        const summary: TrxSummary = {
            total: 2,
            passed: 2,
            failed: 0,
            skipped: 0,
            duration: 100,
            results: [
                { testName: 'Add(1,2)', outcome: 'Passed', duration: 50 },
                { testName: 'Add(3,4)', outcome: 'Passed', duration: 50 },
            ],
        };

        matchAndApplyResults(summary, methodNodes, provider, mockLogger);

        const methodNode = provider.getNodeByFqn('NS.Cls.Add');
        expect(methodNode).toBeDefined();
        expect(methodNode!.children).toHaveLength(2);
        expect(methodNode!.children[0].state).toBe('passed');
        expect(methodNode!.children[1].state).toBe('passed');
    });

    it('should not duplicate cases when TRX uses FQN without spaces and source has spaces', () => {
        const provider = buildTreeWithTests([
            makeTest('NS', 'Cls', 'Calc', {
                fullyQualifiedName: 'NS.Cls.Calc(1, 2, 3)',
                displayName: 'Calc(1, 2, 3)',
                parameters: '1, 2, 3',
            }),
        ]);
        const methodNodes = provider.getAllMethodNodes();
        const summary: TrxSummary = {
            total: 1,
            passed: 1,
            failed: 0,
            skipped: 0,
            duration: 50,
            results: [
                { testName: 'NS.Cls.Calc(1,2,3)', outcome: 'Passed', duration: 50 },
            ],
        };

        matchAndApplyResults(summary, methodNodes, provider, mockLogger);

        const methodNode = provider.getNodeByFqn('NS.Cls.Calc');
        expect(methodNode).toBeDefined();
        expect(methodNode!.children).toHaveLength(1);
        expect(methodNode!.children[0].state).toBe('passed');
    });

    it('should apply results to existing case nodes without creating duplicates (short TRX names)', () => {
        const provider = buildTreeWithTests([
            makeTest('App.Tests', 'MathTests', 'Add', {
                fullyQualifiedName: 'App.Tests.MathTests.Add(1, 2)',
                displayName: 'Add(1, 2)',
                parameters: '1, 2',
            }),
            makeTest('App.Tests', 'MathTests', 'Add', {
                fullyQualifiedName: 'App.Tests.MathTests.Add(3, 4)',
                displayName: 'Add(3, 4)',
                parameters: '3, 4',
            }),
        ]);

        const caseNodes = provider.getAllMethodNodes().filter(
            (n) => n.nodeType === 'parameterizedCase',
        );
        const summary: TrxSummary = {
            total: 2,
            passed: 1,
            failed: 1,
            skipped: 0,
            duration: 200,
            results: [
                { testName: 'Add(1,2)', outcome: 'Passed', duration: 100 },
                { testName: 'Add(3,4)', outcome: 'Failed', errorMessage: 'bad', duration: 100 },
            ],
        };

        matchAndApplyResults(summary, caseNodes, provider, mockLogger);

        const methodNode = provider.getNodeByFqn('App.Tests.MathTests.Add');
        expect(methodNode).toBeDefined();
        expect(methodNode!.children).toHaveLength(2);
        expect(methodNode!.children[0].state).toBe('passed');
        expect(methodNode!.children[1].state).toBe('failed');
    });

    it('should not duplicate when running from class level with mixed test types', () => {
        const provider = buildTreeWithTests([
            makeTest('NS', 'Cls', 'Add', {
                fullyQualifiedName: 'NS.Cls.Add(1, 2)',
                displayName: 'Add(1, 2)',
                parameters: '1, 2',
            }),
            makeTest('NS', 'Cls', 'Add', {
                fullyQualifiedName: 'NS.Cls.Add(3, 4)',
                displayName: 'Add(3, 4)',
                parameters: '3, 4',
            }),
            makeTest('NS', 'Cls', 'SimpleTest'),
        ]);

        const allLeafNodes = provider.getLeafTestNodes();
        const summary: TrxSummary = {
            total: 3,
            passed: 3,
            failed: 0,
            skipped: 0,
            duration: 150,
            results: [
                { testName: 'Add(1,2)', outcome: 'Passed', duration: 50 },
                { testName: 'Add(3,4)', outcome: 'Passed', duration: 50 },
                { testName: 'NS.Cls.SimpleTest', outcome: 'Passed', duration: 50 },
            ],
        };

        matchAndApplyResults(summary, allLeafNodes, provider, mockLogger);

        const methodNode = provider.getNodeByFqn('NS.Cls.Add');
        expect(methodNode!.children).toHaveLength(2);

        const simpleNode = provider.getNodeByFqn('NS.Cls.SimpleTest');
        expect(simpleNode!.state).toBe('passed');
    });
});
