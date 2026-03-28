import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => {
    const EventEmitter = class {
        private listeners: Function[] = [];
        event = (listener: Function) => {
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
            cancel() { this.token.isCancellationRequested = true; }
            dispose = vi.fn();
        },
        StatusBarAlignment: { Left: 1, Right: 2 },
        TreeItem: class {
            constructor(public label: string, public collapsibleState?: number) {}
        },
        TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
        ThemeIcon: class {
            constructor(public id: string, public color?: any) {}
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

vi.mock('../src/utils/outputChannel', () => ({
    log: vi.fn(),
    logError: vi.fn(),
    showOutput: vi.fn(),
}));

vi.mock('fs/promises', () => ({
    mkdir: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
}));

import { CSharpTestController } from '../src/testController';
import type { TestProject } from '../src/discovery/projectDetector';
import type { DiscoveredTest } from '../src/discovery/dotnetDiscoverer';

function createFakeContext() {
    return { subscriptions: [] } as any;
}

function buildControllerWithProjects(
    projects: TestProject[],
    testsByProject: Map<string, DiscoveredTest[]>,
): CSharpTestController {
    const controller = new CSharpTestController(createFakeContext());
    controller.treeProvider.buildTree(projects, testsByProject);
    return controller;
}

function makeProject(name: string, csprojPath: string): TestProject {
    return { projectName: name, csprojPath, projectDir: csprojPath.replace(/[/\\][^/\\]+$/, '') };
}

function makeTest(
    ns: string,
    cls: string,
    method: string,
    csprojPath: string,
): DiscoveredTest {
    return {
        fullyQualifiedName: `${ns}.${cls}.${method}`,
        namespace: ns,
        className: cls,
        methodName: method,
        displayName: method,
        sourceFile: `${cls}.cs`,
    } as DiscoveredTest;
}

describe('runAll — per-project error isolation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should continue running remaining projects when one project fails', async () => {
        const projectA = makeProject('ProjectA', '/repo/ProjectA/ProjectA.csproj');
        const projectB = makeProject('ProjectB', '/repo/ProjectB/ProjectB.csproj');

        const testsA: DiscoveredTest[] = [makeTest('NsA', 'ClassA', 'Test1', projectA.csprojPath)];
        const testsB: DiscoveredTest[] = [makeTest('NsB', 'ClassB', 'Test2', projectB.csprojPath)];

        const testsByProject = new Map<string, DiscoveredTest[]>();
        testsByProject.set(projectA.csprojPath, testsA);
        testsByProject.set(projectB.csprojPath, testsB);

        const controller = buildControllerWithProjects([projectA, projectB], testsByProject);

        let callCount = 0;
        mockRunDotnet.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
                return Promise.reject(new Error('dotnet not found'));
            }
            return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
        });

        mockParseTrxFile.mockResolvedValue({
            results: [{ testName: 'NsB.ClassB.Test2', outcome: 'Passed' }],
            passed: 1,
            failed: 0,
            skipped: 0,
        });

        await controller.runAll();

        expect(mockRunDotnet).toHaveBeenCalledTimes(2);
    });

    it('should mark failed project nodes as failed and successful project nodes as passed', async () => {
        const projectA = makeProject('ProjectA', '/repo/ProjectA/ProjectA.csproj');
        const projectB = makeProject('ProjectB', '/repo/ProjectB/ProjectB.csproj');

        const testsA: DiscoveredTest[] = [makeTest('NsA', 'ClassA', 'Test1', projectA.csprojPath)];
        const testsB: DiscoveredTest[] = [makeTest('NsB', 'ClassB', 'Test2', projectB.csprojPath)];

        const testsByProject = new Map<string, DiscoveredTest[]>();
        testsByProject.set(projectA.csprojPath, testsA);
        testsByProject.set(projectB.csprojPath, testsB);

        const controller = buildControllerWithProjects([projectA, projectB], testsByProject);

        let callCount = 0;
        mockRunDotnet.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
                return Promise.reject(new Error('Build failed'));
            }
            return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
        });

        mockParseTrxFile.mockResolvedValue({
            results: [{ testName: 'NsB.ClassB.Test2', outcome: 'Passed' }],
            passed: 1,
            failed: 0,
            skipped: 0,
        });

        await controller.runAll();

        const allMethods = controller.treeProvider.getAllMethodNodes();
        const testA = allMethods.find(m => m.fqn === 'NsA.ClassA.Test1');
        const testB = allMethods.find(m => m.fqn === 'NsB.ClassB.Test2');

        expect(testA?.state).toBe('failed');
        expect(testA?.errorMessage).toBe('Build failed');
        expect(testB?.state).toBe('passed');
    });

    it('should run all three projects even when the middle one fails', async () => {
        const projectA = makeProject('ProjectA', '/repo/ProjectA/ProjectA.csproj');
        const projectB = makeProject('ProjectB', '/repo/ProjectB/ProjectB.csproj');
        const projectC = makeProject('ProjectC', '/repo/ProjectC/ProjectC.csproj');

        const testsA: DiscoveredTest[] = [makeTest('NsA', 'ClassA', 'Test1', projectA.csprojPath)];
        const testsB: DiscoveredTest[] = [makeTest('NsB', 'ClassB', 'Test2', projectB.csprojPath)];
        const testsC: DiscoveredTest[] = [makeTest('NsC', 'ClassC', 'Test3', projectC.csprojPath)];

        const testsByProject = new Map<string, DiscoveredTest[]>();
        testsByProject.set(projectA.csprojPath, testsA);
        testsByProject.set(projectB.csprojPath, testsB);
        testsByProject.set(projectC.csprojPath, testsC);

        const controller = buildControllerWithProjects(
            [projectA, projectB, projectC],
            testsByProject,
        );

        let callCount = 0;
        mockRunDotnet.mockImplementation(() => {
            callCount++;
            if (callCount === 2) {
                return Promise.reject(new Error('ProjectB build error'));
            }
            return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
        });

        mockParseTrxFile.mockImplementation((trxPath: string) => {
            return Promise.resolve({
                results: callCount <= 1
                    ? [{ testName: 'NsA.ClassA.Test1', outcome: 'Passed' }]
                    : [{ testName: 'NsC.ClassC.Test3', outcome: 'Passed' }],
                passed: 1,
                failed: 0,
                skipped: 0,
            });
        });

        await controller.runAll();

        expect(mockRunDotnet).toHaveBeenCalledTimes(3);

        const allMethods = controller.treeProvider.getAllMethodNodes();
        const testA = allMethods.find(m => m.fqn === 'NsA.ClassA.Test1');
        const testB = allMethods.find(m => m.fqn === 'NsB.ClassB.Test2');
        const testC = allMethods.find(m => m.fqn === 'NsC.ClassC.Test3');

        expect(testA?.state).toBe('passed');
        expect(testB?.state).toBe('failed');
        expect(testC?.state).toBe('passed');
    });

    it('should stop all projects when cancellation occurs', async () => {
        const projectA = makeProject('ProjectA', '/repo/ProjectA/ProjectA.csproj');
        const projectB = makeProject('ProjectB', '/repo/ProjectB/ProjectB.csproj');

        const testsA: DiscoveredTest[] = [makeTest('NsA', 'ClassA', 'Test1', projectA.csprojPath)];
        const testsB: DiscoveredTest[] = [makeTest('NsB', 'ClassB', 'Test2', projectB.csprojPath)];

        const testsByProject = new Map<string, DiscoveredTest[]>();
        testsByProject.set(projectA.csprojPath, testsA);
        testsByProject.set(projectB.csprojPath, testsB);

        const controller = buildControllerWithProjects([projectA, projectB], testsByProject);

        mockRunDotnet.mockImplementation(() => {
            return Promise.reject(new Error('Cancelled'));
        });

        await controller.runAll();

        expect(mockRunDotnet).toHaveBeenCalledTimes(1);
    });

    it('should succeed when all projects pass without errors', async () => {
        const projectA = makeProject('ProjectA', '/repo/ProjectA/ProjectA.csproj');
        const projectB = makeProject('ProjectB', '/repo/ProjectB/ProjectB.csproj');

        const testsA: DiscoveredTest[] = [makeTest('NsA', 'ClassA', 'Test1', projectA.csprojPath)];
        const testsB: DiscoveredTest[] = [makeTest('NsB', 'ClassB', 'Test2', projectB.csprojPath)];

        const testsByProject = new Map<string, DiscoveredTest[]>();
        testsByProject.set(projectA.csprojPath, testsA);
        testsByProject.set(projectB.csprojPath, testsB);

        const controller = buildControllerWithProjects([projectA, projectB], testsByProject);

        mockRunDotnet.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });

        let parseTrxCallCount = 0;
        mockParseTrxFile.mockImplementation(() => {
            parseTrxCallCount++;
            const testName = parseTrxCallCount === 1 ? 'NsA.ClassA.Test1' : 'NsB.ClassB.Test2';
            return Promise.resolve({
                results: [{ testName, outcome: 'Passed' }],
                passed: 1,
                failed: 0,
                skipped: 0,
            });
        });

        await controller.runAll();

        expect(mockRunDotnet).toHaveBeenCalledTimes(2);

        const allMethods = controller.treeProvider.getAllMethodNodes();
        expect(allMethods.every(m => m.state === 'passed')).toBe(true);
    });

    it('should not leave nodes in running state after completion', async () => {
        const projectA = makeProject('ProjectA', '/repo/ProjectA/ProjectA.csproj');

        const testsA: DiscoveredTest[] = [makeTest('NsA', 'ClassA', 'Test1', projectA.csprojPath)];

        const testsByProject = new Map<string, DiscoveredTest[]>();
        testsByProject.set(projectA.csprojPath, testsA);

        const controller = buildControllerWithProjects([projectA], testsByProject);

        mockRunDotnet.mockRejectedValue(new Error('Spawn failed'));

        await controller.runAll();

        const allMethods = controller.treeProvider.getAllMethodNodes();
        const runningNodes = allMethods.filter(m => m.state === 'running');
        expect(runningNodes).toHaveLength(0);
    });
});
