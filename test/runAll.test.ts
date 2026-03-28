import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => {
    const EventEmitter = class {
        private listeners: ((...args: unknown[]) => void)[] = [];
        event = (listener: (...args: unknown[]) => void) => {
            this.listeners.push(listener);
            return { dispose: vi.fn() };
        };
        fire = vi.fn();
        dispose = vi.fn();
    };

    return {
        window: {
            createTreeView: () => ({ dispose: vi.fn() }),
            createStatusBarItem: () => ({
                text: '',
                command: '',
                show: vi.fn(),
                dispose: vi.fn(),
                backgroundColor: undefined,
            }),
            createOutputChannel: () => ({
                appendLine: vi.fn(),
                show: vi.fn(),
                dispose: vi.fn(),
            }),
        },
        commands: {
            executeCommand: vi.fn(),
        },
        CancellationTokenSource: class {
            token = {
                isCancellationRequested: false,
                onCancellationRequested: vi.fn(),
            };
            cancel() {
                this.token.isCancellationRequested = true;
            }
            dispose = vi.fn();
        },
        StatusBarAlignment: { Left: 1, Right: 2 },
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
                public color?: any,
            ) {}
        },
        ThemeColor: class {
            constructor(public id: string) {}
        },
        EventEmitter,
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
    };
});

const mockRunDotnet = vi.fn();
const mockGetExtraArgs = vi.fn().mockReturnValue([]);

vi.mock('../src/utils/dotnetCli', () => ({
    runDotnet: (...args: unknown[]) => mockRunDotnet(...args),
    getExtraArgs: () => mockGetExtraArgs(),
}));

const mockParseTrxFile = vi.fn();

vi.mock('../src/execution/trxParser', () => ({
    parseTrxFile: (...args: unknown[]) => mockParseTrxFile(...args),
}));

vi.mock('fs/promises', () => ({
    mkdir: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
}));

import { CSharpTestController } from '../src/testController';
import type { TestProject } from '../src/discovery/projectDetector';
import type { DiscoveredTest } from '../src/discovery/dotnetDiscoverer';
import type { Logger } from '../src/utils/logger';

function createMockLogger(): Logger {
    return { log: vi.fn(), logError: vi.fn(), showOutput: vi.fn() };
}

function createFakeContext() {
    return { subscriptions: [] } as any;
}

function buildControllerWithProjects(
    projects: TestProject[],
    testsByProject: Map<string, DiscoveredTest[]>,
): CSharpTestController {
    const controller = new CSharpTestController(createFakeContext(), createMockLogger());
    controller.treeProvider.buildTree(projects, testsByProject);
    return controller;
}

function makeProject(name: string, csprojPath: string): TestProject {
    return { projectName: name, csprojPath, projectDir: csprojPath.replace(/[/\\][^/\\]+$/, '') };
}

function makeTest(ns: string, cls: string, method: string): DiscoveredTest {
    return {
        fullyQualifiedName: `${ns}.${cls}.${method}`,
        namespace: ns,
        className: cls,
        methodName: method,
        displayName: method,
        sourceFile: `${cls}.cs`,
    } as DiscoveredTest;
}

interface ProjectSpec {
    project: TestProject;
    tests: DiscoveredTest[];
}

function buildScenario(...specs: ProjectSpec[]): CSharpTestController {
    const projects = specs.map((s) => s.project);
    const testsByProject = new Map<string, DiscoveredTest[]>();
    for (const s of specs) {
        testsByProject.set(s.project.csprojPath, s.tests);
    }
    return buildControllerWithProjects(projects, testsByProject);
}

function projectWithTest(name: string, ns: string, cls: string, method: string): ProjectSpec {
    return {
        project: makeProject(name, `/repo/${name}/${name}.csproj`),
        tests: [makeTest(ns, cls, method)],
    };
}

function failOnNthCall(n: number, errorMessage: string) {
    return () => {
        const callIndex = mockRunDotnet.mock.calls.length;
        if (callIndex === n) {
            return Promise.reject(new Error(errorMessage));
        }
        return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
    };
}

function trxResult(testName: string, outcome: string) {
    return {
        results: [{ testName, outcome }],
        passed: outcome === 'Passed' ? 1 : 0,
        failed: outcome === 'Failed' ? 1 : 0,
        skipped: 0,
    };
}

describe('runAll — per-project error isolation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should continue running remaining projects when one project fails', async () => {
        const controller = buildScenario(
            projectWithTest('ProjectA', 'NsA', 'ClassA', 'Test1'),
            projectWithTest('ProjectB', 'NsB', 'ClassB', 'Test2'),
        );

        mockRunDotnet.mockImplementation(failOnNthCall(1, 'dotnet not found'));
        mockParseTrxFile.mockResolvedValue(trxResult('NsB.ClassB.Test2', 'Passed'));

        await controller.runAll();

        expect(mockRunDotnet).toHaveBeenCalledTimes(2);
    });

    it('should mark failed project nodes as failed and successful project nodes as passed', async () => {
        const controller = buildScenario(
            projectWithTest('ProjectA', 'NsA', 'ClassA', 'Test1'),
            projectWithTest('ProjectB', 'NsB', 'ClassB', 'Test2'),
        );

        mockRunDotnet.mockImplementation(failOnNthCall(1, 'Build failed'));
        mockParseTrxFile.mockResolvedValue(trxResult('NsB.ClassB.Test2', 'Passed'));

        await controller.runAll();

        const allMethods = controller.treeProvider.getAllMethodNodes();
        const testA = allMethods.find((m) => m.fqn === 'NsA.ClassA.Test1');
        const testB = allMethods.find((m) => m.fqn === 'NsB.ClassB.Test2');

        expect(testA?.state).toBe('failed');
        expect(testA?.errorMessage).toBe('Build failed');
        expect(testB?.state).toBe('passed');
    });

    it('should run all three projects even when the middle one fails', async () => {
        const controller = buildScenario(
            projectWithTest('ProjectA', 'NsA', 'ClassA', 'Test1'),
            projectWithTest('ProjectB', 'NsB', 'ClassB', 'Test2'),
            projectWithTest('ProjectC', 'NsC', 'ClassC', 'Test3'),
        );

        mockRunDotnet.mockImplementation(failOnNthCall(2, 'ProjectB build error'));

        mockParseTrxFile.mockImplementation(() => {
            const callIndex = mockParseTrxFile.mock.calls.length;
            if (callIndex === 1) {
                return Promise.resolve(trxResult('NsA.ClassA.Test1', 'Passed'));
            }
            return Promise.resolve(trxResult('NsC.ClassC.Test3', 'Passed'));
        });

        await controller.runAll();

        expect(mockRunDotnet).toHaveBeenCalledTimes(3);

        const allMethods = controller.treeProvider.getAllMethodNodes();
        const testA = allMethods.find((m) => m.fqn === 'NsA.ClassA.Test1');
        const testB = allMethods.find((m) => m.fqn === 'NsB.ClassB.Test2');
        const testC = allMethods.find((m) => m.fqn === 'NsC.ClassC.Test3');

        expect(testA?.state).toBe('passed');
        expect(testB?.state).toBe('failed');
        expect(testC?.state).toBe('passed');
    });

    it('should stop all projects when cancellation error occurs', async () => {
        const controller = buildScenario(
            projectWithTest('ProjectA', 'NsA', 'ClassA', 'Test1'),
            projectWithTest('ProjectB', 'NsB', 'ClassB', 'Test2'),
        );

        mockRunDotnet.mockRejectedValue(new Error('Cancelled'));

        await controller.runAll();

        expect(mockRunDotnet).toHaveBeenCalledTimes(1);
    });

    it('should skip remaining projects when token is already cancelled', async () => {
        const controller = buildScenario(
            projectWithTest('ProjectA', 'NsA', 'ClassA', 'Test1'),
            projectWithTest('ProjectB', 'NsB', 'ClassB', 'Test2'),
        );

        mockRunDotnet.mockImplementation(() => {
            // Simulate cancellation triggered during the first project's run
            (controller as any).activeCts.cancel();
            return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
        });

        mockParseTrxFile.mockResolvedValue(trxResult('NsA.ClassA.Test1', 'Passed'));

        await controller.runAll();

        expect(mockRunDotnet).toHaveBeenCalledTimes(1);
    });

    it('should succeed when all projects pass without errors', async () => {
        const controller = buildScenario(
            projectWithTest('ProjectA', 'NsA', 'ClassA', 'Test1'),
            projectWithTest('ProjectB', 'NsB', 'ClassB', 'Test2'),
        );

        mockRunDotnet.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });

        mockParseTrxFile.mockImplementation(() => {
            const callIndex = mockParseTrxFile.mock.calls.length;
            const testName = callIndex === 1 ? 'NsA.ClassA.Test1' : 'NsB.ClassB.Test2';
            return Promise.resolve(trxResult(testName, 'Passed'));
        });

        await controller.runAll();

        expect(mockRunDotnet).toHaveBeenCalledTimes(2);

        const allMethods = controller.treeProvider.getAllMethodNodes();
        expect(allMethods.every((m) => m.state === 'passed')).toBe(true);
    });

    it('should not leave nodes in running state after completion', async () => {
        const controller = buildScenario(projectWithTest('ProjectA', 'NsA', 'ClassA', 'Test1'));

        mockRunDotnet.mockRejectedValue(new Error('Spawn failed'));

        await controller.runAll();

        const allMethods = controller.treeProvider.getAllMethodNodes();
        const runningNodes = allMethods.filter((m) => m.state === 'running');
        expect(runningNodes).toHaveLength(0);
    });
});
