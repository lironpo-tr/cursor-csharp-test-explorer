import { describe, it, expect, vi } from 'vitest';

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
    };
});

import { TestTreeProvider, TestTreeNode } from '../../src/ui/testTreeProvider';
import type { TestProject } from '../../src/discovery/projectDetector';
import type { DiscoveredTest } from '../../src/discovery/dotnetDiscoverer';

function makeProject(name: string, csprojPath: string): TestProject {
    return {
        projectName: name,
        csprojPath,
        projectDir: csprojPath.replace(/[/\\][^/\\]+$/, ''),
    };
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

function buildSingleProjectTree(
    projectName: string,
    tests: DiscoveredTest[],
): TestTreeProvider {
    const provider = new TestTreeProvider();
    const project = makeProject(projectName, `/repo/${projectName}/${projectName}.csproj`);
    const testsByProject = new Map<string, DiscoveredTest[]>();
    testsByProject.set(project.csprojPath, tests);
    provider.buildTree([project], testsByProject);
    return provider;
}

describe('TestTreeNode', () => {
    it('should produce contextValue from nodeType and state', () => {
        const node = new TestTreeNode('id-1', 'MyTest', 'method', 'NS.Class.MyTest');

        expect(node.contextValue).toBe('testNode.method.none');
    });

    it('should update contextValue when state changes', () => {
        const node = new TestTreeNode('id-1', 'MyTest', 'method', 'NS.Class.MyTest');

        node.state = 'passed';

        expect(node.contextValue).toBe('testNode.method.passed');
    });

    it('should default state to none and children to empty', () => {
        const node = new TestTreeNode('id-1', 'MyTest', 'method', 'NS.Class.MyTest');

        expect(node.state).toBe('none');
        expect(node.children).toEqual([]);
    });
});

describe('TestTreeProvider.buildTree', () => {
    it('should create project root node', () => {
        const provider = buildSingleProjectTree('MyProject', [
            makeTest('NS', 'Class1', 'Test1'),
        ]);

        const roots = provider.getRoots();

        expect(roots).toHaveLength(1);
        expect(roots[0].nodeType).toBe('project');
        expect(roots[0].label).toContain('MyProject');
    });

    it('should create namespace node under project', () => {
        const provider = buildSingleProjectTree('MyProject', [
            makeTest('MyNamespace', 'Class1', 'Test1'),
        ]);

        const roots = provider.getRoots();
        const nsNode = roots[0].children[0];

        expect(nsNode.nodeType).toBe('namespace');
        expect(nsNode.label).toBe('MyNamespace');
    });

    it('should create class node under namespace', () => {
        const provider = buildSingleProjectTree('MyProject', [
            makeTest('NS', 'MyClass', 'Test1'),
        ]);

        const classNode = provider.getRoots()[0].children[0].children[0];

        expect(classNode.nodeType).toBe('class');
        expect(classNode.label).toContain('MyClass');
    });

    it('should create method node under class', () => {
        const provider = buildSingleProjectTree('MyProject', [
            makeTest('NS', 'MyClass', 'Test1'),
        ]);

        const methodNode = provider.getRoots()[0].children[0].children[0].children[0];

        expect(methodNode.nodeType).toBe('method');
        expect(methodNode.displayName ?? methodNode.label).toBe('Test1');
    });

    it('should group tests by namespace', () => {
        const provider = buildSingleProjectTree('MyProject', [
            makeTest('NS1', 'Class1', 'Test1'),
            makeTest('NS2', 'Class2', 'Test2'),
        ]);

        const nsNodes = provider.getRoots()[0].children;

        expect(nsNodes).toHaveLength(2);
        expect(nsNodes.map((n) => n.label).sort()).toEqual(['NS1', 'NS2']);
    });

    it('should group tests by class within namespace', () => {
        const provider = buildSingleProjectTree('MyProject', [
            makeTest('NS', 'ClassA', 'Test1'),
            makeTest('NS', 'ClassB', 'Test2'),
        ]);

        const classNodes = provider.getRoots()[0].children[0].children;

        expect(classNodes).toHaveLength(2);
    });

    it('should group parameterized cases under a method node', () => {
        const provider = buildSingleProjectTree('MyProject', [
            makeTest('NS', 'Cls', 'Add', {
                fullyQualifiedName: 'NS.Cls.Add(1,2)',
                displayName: 'Add(1,2)',
                parameters: '1,2',
            }),
            makeTest('NS', 'Cls', 'Add', {
                fullyQualifiedName: 'NS.Cls.Add(3,4)',
                displayName: 'Add(3,4)',
                parameters: '3,4',
            }),
        ]);

        const classNode = provider.getRoots()[0].children[0].children[0];
        const methodNode = classNode.children[0];

        expect(methodNode.nodeType).toBe('method');
        expect(methodNode.children).toHaveLength(2);
        expect(methodNode.children[0].nodeType).toBe('parameterizedCase');
        expect(methodNode.children[1].nodeType).toBe('parameterizedCase');
    });

    it('should skip projects with no tests', () => {
        const provider = new TestTreeProvider();
        const project1 = makeProject('Empty', '/repo/Empty/Empty.csproj');
        const project2 = makeProject('HasTests', '/repo/HasTests/HasTests.csproj');
        const testsByProject = new Map<string, DiscoveredTest[]>();
        testsByProject.set(project1.csprojPath, []);
        testsByProject.set(project2.csprojPath, [makeTest('NS', 'Cls', 'Test1')]);

        provider.buildTree([project1, project2], testsByProject);

        expect(provider.getRoots()).toHaveLength(1);
        expect(provider.getRoots()[0].label).toContain('HasTests');
    });

    it('should set projectPath on all nodes', () => {
        const provider = buildSingleProjectTree('MyProject', [
            makeTest('NS', 'Cls', 'Test1'),
        ]);

        const root = provider.getRoots()[0];
        const ns = root.children[0];
        const cls = ns.children[0];
        const method = cls.children[0];

        const expectedPath = '/repo/MyProject/MyProject.csproj';
        expect(root.projectPath).toBe(expectedPath);
        expect(ns.projectPath).toBe(expectedPath);
        expect(cls.projectPath).toBe(expectedPath);
        expect(method.projectPath).toBe(expectedPath);
    });

    it('should show method count in class label', () => {
        const provider = buildSingleProjectTree('MyProject', [
            makeTest('NS', 'Cls', 'Test1'),
            makeTest('NS', 'Cls', 'Test2'),
        ]);

        const classNode = provider.getRoots()[0].children[0].children[0];

        expect(classNode.label).toBe('Cls (2)');
    });
});

describe('TestTreeProvider.getChildren', () => {
    it('should return roots when called without element', () => {
        const provider = buildSingleProjectTree('Proj', [makeTest('NS', 'Cls', 'T1')]);

        const children = provider.getChildren();

        expect(children).toEqual(provider.getRoots());
    });

    it('should return children of the given element', () => {
        const provider = buildSingleProjectTree('Proj', [makeTest('NS', 'Cls', 'T1')]);
        const root = provider.getRoots()[0];

        const children = provider.getChildren(root);

        expect(children).toEqual(root.children);
    });
});

describe('TestTreeProvider.getParent', () => {
    it('should return the parent of a child node', () => {
        const provider = buildSingleProjectTree('Proj', [makeTest('NS', 'Cls', 'T1')]);
        const root = provider.getRoots()[0];
        const nsNode = root.children[0];

        const parent = provider.getParent(nsNode);

        expect(parent).toBe(root);
    });

    it('should return undefined for root nodes', () => {
        const provider = buildSingleProjectTree('Proj', [makeTest('NS', 'Cls', 'T1')]);
        const root = provider.getRoots()[0];

        const parent = provider.getParent(root);

        expect(parent).toBeUndefined();
    });
});

describe('TestTreeProvider.getNodeByFqn', () => {
    it('should find a node by its exact FQN', () => {
        const provider = buildSingleProjectTree('Proj', [makeTest('NS', 'Cls', 'Test1')]);

        const node = provider.getNodeByFqn('NS.Cls.Test1');

        expect(node).toBeDefined();
        expect(node?.fqn).toBe('NS.Cls.Test1');
    });

    it('should return undefined for non-existent FQN', () => {
        const provider = buildSingleProjectTree('Proj', [makeTest('NS', 'Cls', 'Test1')]);

        const node = provider.getNodeByFqn('NS.Cls.NonExistent');

        expect(node).toBeUndefined();
    });
});

describe('TestTreeProvider.getAllMethodNodes', () => {
    it('should return all method and parameterizedCase nodes', () => {
        const provider = buildSingleProjectTree('Proj', [
            makeTest('NS', 'Cls', 'Test1'),
            makeTest('NS', 'Cls', 'Test2'),
        ]);

        const methods = provider.getAllMethodNodes();

        expect(methods).toHaveLength(2);
        expect(methods.every((m) => m.nodeType === 'method')).toBe(true);
    });

    it('should include parameterized cases', () => {
        const provider = buildSingleProjectTree('Proj', [
            makeTest('NS', 'Cls', 'Add', {
                fullyQualifiedName: 'NS.Cls.Add(1)',
                displayName: 'Add(1)',
                parameters: '1',
            }),
            makeTest('NS', 'Cls', 'Add', {
                fullyQualifiedName: 'NS.Cls.Add(2)',
                displayName: 'Add(2)',
                parameters: '2',
            }),
        ]);

        const methods = provider.getAllMethodNodes();
        const cases = methods.filter((m) => m.nodeType === 'parameterizedCase');

        expect(cases).toHaveLength(2);
    });
});

describe('TestTreeProvider.getLeafTestNodes', () => {
    it('should return methods without children', () => {
        const provider = buildSingleProjectTree('Proj', [
            makeTest('NS', 'Cls', 'SimpleTest'),
        ]);

        const leaves = provider.getLeafTestNodes();

        expect(leaves).toHaveLength(1);
        expect(leaves[0].nodeType).toBe('method');
    });

    it('should return parameterized cases but not their parent method', () => {
        const provider = buildSingleProjectTree('Proj', [
            makeTest('NS', 'Cls', 'Add', {
                fullyQualifiedName: 'NS.Cls.Add(1)',
                displayName: 'Add(1)',
                parameters: '1',
            }),
            makeTest('NS', 'Cls', 'Add', {
                fullyQualifiedName: 'NS.Cls.Add(2)',
                displayName: 'Add(2)',
                parameters: '2',
            }),
        ]);

        const leaves = provider.getLeafTestNodes();

        expect(leaves).toHaveLength(2);
        expect(leaves.every((l) => l.nodeType === 'parameterizedCase')).toBe(true);
    });
});

describe('TestTreeProvider.clearRunningStates', () => {
    it('should reset running nodes to none', () => {
        const provider = buildSingleProjectTree('Proj', [makeTest('NS', 'Cls', 'T1')]);
        const method = provider.getAllMethodNodes()[0];
        method.state = 'running';

        provider.clearRunningStates();

        expect(method.state).toBe('none');
    });

    it('should not affect non-running nodes', () => {
        const provider = buildSingleProjectTree('Proj', [
            makeTest('NS', 'Cls', 'T1'),
            makeTest('NS', 'Cls', 'T2'),
        ]);
        const [m1, m2] = provider.getAllMethodNodes();
        m1.state = 'passed';
        m2.state = 'running';

        provider.clearRunningStates();

        expect(m1.state).toBe('passed');
        expect(m2.state).toBe('none');
    });
});

describe('TestTreeProvider.resetAllStates', () => {
    it('should reset all nodes to none and clear error data', () => {
        const provider = buildSingleProjectTree('Proj', [makeTest('NS', 'Cls', 'T1')]);
        const method = provider.getAllMethodNodes()[0];
        method.state = 'failed';
        method.errorMessage = 'some error';
        method.stackTrace = 'some trace';
        method.duration = 500;

        provider.resetAllStates();

        expect(method.state).toBe('none');
        expect(method.errorMessage).toBeUndefined();
        expect(method.stackTrace).toBeUndefined();
        expect(method.duration).toBeUndefined();
    });
});

describe('TestTreeProvider.addDynamicCaseNode', () => {
    it('should add a new parameterized case under an existing method', () => {
        const provider = buildSingleProjectTree('Proj', [
            makeTest('NS', 'Cls', 'Add', {
                fullyQualifiedName: 'NS.Cls.Add(1)',
                displayName: 'Add(1)',
                parameters: '1',
            }),
        ]);

        const added = provider.addDynamicCaseNode('NS.Cls.Add', 'NS.Cls.Add(99)', 'Add(99)');

        expect(added).toBeDefined();
        expect(added?.nodeType).toBe('parameterizedCase');
        expect(added?.fqn).toBe('NS.Cls.Add(99)');
    });

    it('should return existing node when FQN already exists', () => {
        const provider = buildSingleProjectTree('Proj', [
            makeTest('NS', 'Cls', 'Add', {
                fullyQualifiedName: 'NS.Cls.Add(1)',
                displayName: 'Add(1)',
                parameters: '1',
            }),
        ]);

        const existing = provider.addDynamicCaseNode('NS.Cls.Add', 'NS.Cls.Add(1)', 'Add(1)');

        expect(existing).toBeDefined();
        expect(existing?.fqn).toBe('NS.Cls.Add(1)');
    });

    it('should return undefined when parent FQN does not exist', () => {
        const provider = buildSingleProjectTree('Proj', [makeTest('NS', 'Cls', 'Test1')]);

        const result = provider.addDynamicCaseNode('NS.Cls.NonExistent', 'NS.Cls.NonExistent(1)', 'NonExistent(1)');

        expect(result).toBeUndefined();
    });

    it('should return existing node when FQN differs only in parameter whitespace', () => {
        const provider = buildSingleProjectTree('Proj', [
            makeTest('NS', 'Cls', 'Add', {
                fullyQualifiedName: 'NS.Cls.Add(1, 2)',
                displayName: 'Add(1, 2)',
                parameters: '1, 2',
            }),
        ]);

        const result = provider.addDynamicCaseNode('NS.Cls.Add', 'NS.Cls.Add(1,2)', 'Add(1,2)');

        expect(result).toBeDefined();
        expect(result?.fqn).toBe('NS.Cls.Add(1, 2)');
    });

    it('should return existing node when caseFqn is short name and existing has full FQN', () => {
        const provider = buildSingleProjectTree('Proj', [
            makeTest('NS', 'Cls', 'Add', {
                fullyQualifiedName: 'NS.Cls.Add(1, 2)',
                displayName: 'Add(1, 2)',
                parameters: '1, 2',
            }),
        ]);

        const result = provider.addDynamicCaseNode('NS.Cls.Add', 'Add(1,2)', 'Add(1,2)');

        expect(result).toBeDefined();
        expect(result?.fqn).toBe('NS.Cls.Add(1, 2)');
    });

    it('should not create duplicates for multiple params with whitespace differences', () => {
        const provider = buildSingleProjectTree('Proj', [
            makeTest('NS', 'Cls', 'Calc', {
                fullyQualifiedName: 'NS.Cls.Calc(1, 2, 3)',
                displayName: 'Calc(1, 2, 3)',
                parameters: '1, 2, 3',
            }),
            makeTest('NS', 'Cls', 'Calc', {
                fullyQualifiedName: 'NS.Cls.Calc(4, 5, 6)',
                displayName: 'Calc(4, 5, 6)',
                parameters: '4, 5, 6',
            }),
        ]);

        const result1 = provider.addDynamicCaseNode('NS.Cls.Calc', 'NS.Cls.Calc(1,2,3)', 'Calc(1,2,3)');
        const result2 = provider.addDynamicCaseNode('NS.Cls.Calc', 'NS.Cls.Calc(4,5,6)', 'Calc(4,5,6)');

        expect(result1?.fqn).toBe('NS.Cls.Calc(1, 2, 3)');
        expect(result2?.fqn).toBe('NS.Cls.Calc(4, 5, 6)');

        const methodNode = provider.getNodeByFqn('NS.Cls.Calc');
        expect(methodNode!.children).toHaveLength(2);
    });
});

describe('TestTreeProvider.getNodeById', () => {
    it('should return the node matching the given id', () => {
        const provider = buildSingleProjectTree('Proj', [makeTest('NS', 'Cls', 'Test1')]);
        const root = provider.getRoots()[0];

        const found = provider.getNodeById(root.id);

        expect(found).toBe(root);
    });

    it('should return undefined for a non-existent id', () => {
        const provider = buildSingleProjectTree('Proj', [makeTest('NS', 'Cls', 'Test1')]);

        const found = provider.getNodeById('non-existent-id');

        expect(found).toBeUndefined();
    });
});

describe('TestTreeProvider filtering', () => {
    it('should return only matching methods when filter is set', () => {
        const provider = buildSingleProjectTree('Proj', [
            makeTest('NS', 'Cls', 'LoginTest'),
            makeTest('NS', 'Cls', 'LogoutTest'),
            makeTest('NS', 'Cls', 'SignUpTest'),
        ]);

        provider.setFilter('login');

        const roots = provider.getChildren();
        expect(roots).toHaveLength(1);
        const ns = provider.getChildren(roots[0]);
        const cls = provider.getChildren(ns[0]);
        const methods = provider.getChildren(cls[0]);
        expect(methods).toHaveLength(1);
        expect(methods[0].fqn).toBe('NS.Cls.LoginTest');
    });

    it('should be case-insensitive', () => {
        const provider = buildSingleProjectTree('Proj', [
            makeTest('NS', 'Cls', 'LoginTest'),
            makeTest('NS', 'Cls', 'OtherTest'),
        ]);

        provider.setFilter('LOGIN');

        const roots = provider.getChildren();
        const ns = provider.getChildren(roots[0]);
        const cls = provider.getChildren(ns[0]);
        const methods = provider.getChildren(cls[0]);
        expect(methods).toHaveLength(1);
        expect(methods[0].fqn).toBe('NS.Cls.LoginTest');
    });

    it('should match on partial name (substring)', () => {
        const provider = buildSingleProjectTree('Proj', [
            makeTest('NS', 'Cls', 'CalculateTotal'),
            makeTest('NS', 'Cls', 'CalculateDiscount'),
            makeTest('NS', 'Cls', 'ValidateInput'),
        ]);

        provider.setFilter('calc');

        const roots = provider.getChildren();
        const ns = provider.getChildren(roots[0]);
        const cls = provider.getChildren(ns[0]);
        const methods = provider.getChildren(cls[0]);
        expect(methods).toHaveLength(2);
    });

    it('should match on fully qualified name', () => {
        const provider = buildSingleProjectTree('Proj', [
            makeTest('App.Services', 'OrderService', 'PlaceOrder'),
            makeTest('App.Utils', 'Helper', 'DoStuff'),
        ]);

        provider.setFilter('services');

        const roots = provider.getChildren();
        const namespaces = provider.getChildren(roots[0]);
        expect(namespaces).toHaveLength(1);
        expect(namespaces[0].fqn).toBe('App.Services');
    });

    it('should show ancestor chain for matching leaf nodes', () => {
        const provider = buildSingleProjectTree('Proj', [
            makeTest('Deep.Namespace', 'SomeClass', 'TargetTest'),
            makeTest('Other', 'OtherClass', 'OtherTest'),
        ]);

        provider.setFilter('target');

        const roots = provider.getChildren();
        expect(roots).toHaveLength(1);
        const ns = provider.getChildren(roots[0]);
        expect(ns).toHaveLength(1);
        expect(ns[0].fqn).toBe('Deep.Namespace');
    });

    it('should restore full tree when filter is cleared', () => {
        const provider = buildSingleProjectTree('Proj', [
            makeTest('NS', 'Cls', 'Test1'),
            makeTest('NS', 'Cls', 'Test2'),
            makeTest('NS', 'Cls', 'Test3'),
        ]);

        provider.setFilter('Test1');
        provider.clearFilter();

        const roots = provider.getChildren();
        const ns = provider.getChildren(roots[0]);
        const cls = provider.getChildren(ns[0]);
        const methods = provider.getChildren(cls[0]);
        expect(methods).toHaveLength(3);
    });

    it('should return empty tree when no tests match', () => {
        const provider = buildSingleProjectTree('Proj', [
            makeTest('NS', 'Cls', 'Test1'),
        ]);

        provider.setFilter('nonexistent');

        const roots = provider.getChildren();
        expect(roots).toHaveLength(0);
    });

    it('should expose the active filter via activeFilter getter', () => {
        const provider = new TestTreeProvider();

        expect(provider.activeFilter).toBe('');

        provider.setFilter('Hello');
        expect(provider.activeFilter).toBe('hello');

        provider.clearFilter();
        expect(provider.activeFilter).toBe('');
    });

    it('should filter parameterized cases by their display name', () => {
        const provider = buildSingleProjectTree('Proj', [
            makeTest('NS', 'Cls', 'Add', {
                fullyQualifiedName: 'NS.Cls.Add(1,2)',
                displayName: 'Add(1,2)',
                parameters: '1,2',
            }),
            makeTest('NS', 'Cls', 'Add', {
                fullyQualifiedName: 'NS.Cls.Add(3,4)',
                displayName: 'Add(3,4)',
                parameters: '3,4',
            }),
            makeTest('NS', 'Cls', 'Subtract', {
                fullyQualifiedName: 'NS.Cls.Subtract(5,3)',
                displayName: 'Subtract(5,3)',
                parameters: '5,3',
            }),
        ]);

        provider.setFilter('add');

        const roots = provider.getChildren();
        const ns = provider.getChildren(roots[0]);
        const cls = provider.getChildren(ns[0]);
        expect(cls[0].children.length).toBeGreaterThanOrEqual(1);
    });

    it('should expand filtered nodes instead of collapsing them', () => {
        const provider = buildSingleProjectTree('Proj', [
            makeTest('NS', 'Cls', 'Test1'),
        ]);

        provider.setFilter('test1');
        const root = provider.getChildren()[0];
        const treeItem = provider.getTreeItem(root);

        expect(treeItem.collapsibleState).toBe(2); // Expanded
    });

    it('should keep Collapsed state when no filter is active', () => {
        const provider = buildSingleProjectTree('Proj', [
            makeTest('NS', 'Cls', 'Test1'),
        ]);

        const root = provider.getChildren()[0];
        const treeItem = provider.getTreeItem(root);

        expect(treeItem.collapsibleState).toBe(1); // Collapsed
    });
});

describe('TestTreeProvider.getTreeItem', () => {
    it('should return Collapsed state for nodes with children', () => {
        const provider = buildSingleProjectTree('Proj', [makeTest('NS', 'Cls', 'Test1')]);
        const root = provider.getRoots()[0];

        const treeItem = provider.getTreeItem(root);

        expect(treeItem.collapsibleState).toBe(1); // Collapsed
    });

    it('should return None state for leaf nodes', () => {
        const provider = buildSingleProjectTree('Proj', [makeTest('NS', 'Cls', 'Test1')]);
        const method = provider.getAllMethodNodes()[0];

        const treeItem = provider.getTreeItem(method);

        expect(treeItem.collapsibleState).toBe(0); // None
    });

    it('should set Collapsed state at every non-leaf level', () => {
        const provider = buildSingleProjectTree('Proj', [makeTest('NS', 'Cls', 'Test1')]);
        const root = provider.getRoots()[0];
        const nsNode = root.children[0];
        const classNode = nsNode.children[0];

        expect(provider.getTreeItem(root).collapsibleState).toBe(1); // Collapsed
        expect(provider.getTreeItem(nsNode).collapsibleState).toBe(1); // Collapsed
        expect(provider.getTreeItem(classNode).collapsibleState).toBe(1); // Collapsed
    });

    it('should set id on the tree item', () => {
        const provider = buildSingleProjectTree('Proj', [makeTest('NS', 'Cls', 'Test1')]);
        const root = provider.getRoots()[0];

        const treeItem = provider.getTreeItem(root);

        expect(treeItem.id).toBe(root.id);
    });

    it('should show duration in description for method nodes', () => {
        const provider = buildSingleProjectTree('Proj', [makeTest('NS', 'Cls', 'Test1')]);
        const method = provider.getAllMethodNodes()[0];
        method.duration = 42;

        const treeItem = provider.getTreeItem(method);

        expect(treeItem.description).toBe('42ms');
    });
});
