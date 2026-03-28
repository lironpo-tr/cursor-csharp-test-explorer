import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
    findTrxFile,
    buildFilterForNode,
    buildFilterForNodes,
    collectAllMethodNodes,
    groupNodesByProject,
} from '../../src/execution/testRunner';
import { TestTreeNode } from '../../src/ui/testTreeProvider';

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

function makeNode(
    nodeType: 'project' | 'namespace' | 'class' | 'method' | 'parameterizedCase',
    fqn: string,
    projectPath?: string,
): TestTreeNode {
    const node = new TestTreeNode(`${nodeType}:${fqn}`, fqn.split('.').pop()!, nodeType, fqn);
    node.projectPath = projectPath;
    return node;
}

describe('buildFilterForNode', () => {
    it('should return FullyQualifiedName= for a method node', () => {
        const node = makeNode('method', 'NS.Class.TestMethod');

        const result = buildFilterForNode(node);

        expect(result).toBe('FullyQualifiedName~NS.Class.TestMethod');
    });

    it('should return FullyQualifiedName= for a parameterizedCase node', () => {
        const node = makeNode('parameterizedCase', 'NS.Class.Add(1,2)');

        const result = buildFilterForNode(node);

        expect(result).toBe('FullyQualifiedName=NS.Class.Add(1,2)');
    });

    it('should return FullyQualifiedName~ for a class node', () => {
        const node = makeNode('class', 'NS.CalculatorTests');

        const result = buildFilterForNode(node);

        expect(result).toBe('FullyQualifiedName~NS.CalculatorTests');
    });

    it('should return FullyQualifiedName~ for a namespace node', () => {
        const node = makeNode('namespace', 'MyApp.Tests');

        const result = buildFilterForNode(node);

        expect(result).toBe('FullyQualifiedName~MyApp.Tests');
    });

    it('should return undefined for a project node', () => {
        const node = makeNode('project', 'MyProject');

        const result = buildFilterForNode(node);

        expect(result).toBeUndefined();
    });
});

describe('buildFilterForNodes', () => {
    it('should return single filter expression for one node', () => {
        const nodes = [makeNode('method', 'NS.Class.TestA')];

        const result = buildFilterForNodes(nodes);

        expect(result).toBe('FullyQualifiedName~NS.Class.TestA');
    });

    it('should combine multiple method filters with OR logic', () => {
        const nodes = [
            makeNode('method', 'NS.Class.TestA'),
            makeNode('method', 'NS.Class.TestB'),
        ];

        const result = buildFilterForNodes(nodes);

        expect(result).toBe(
            '(FullyQualifiedName~NS.Class.TestA) | (FullyQualifiedName~NS.Class.TestB)',
        );
    });

    it('should combine mixed node types with OR logic', () => {
        const nodes = [
            makeNode('method', 'NS.Class.TestA'),
            makeNode('class', 'NS.OtherClass'),
        ];

        const result = buildFilterForNodes(nodes);

        expect(result).toBe(
            '(FullyQualifiedName~NS.Class.TestA) | (FullyQualifiedName~NS.OtherClass)',
        );
    });

    it('should return undefined if any node is a project', () => {
        const nodes = [
            makeNode('method', 'NS.Class.TestA'),
            makeNode('project', 'MyProject'),
        ];

        const result = buildFilterForNodes(nodes);

        expect(result).toBeUndefined();
    });

    it('should return undefined for an empty array', () => {
        const result = buildFilterForNodes([]);

        expect(result).toBeUndefined();
    });

    it('should combine three filters correctly', () => {
        const nodes = [
            makeNode('method', 'NS.A.Test1'),
            makeNode('method', 'NS.B.Test2'),
            makeNode('class', 'NS.C'),
        ];

        const result = buildFilterForNodes(nodes);

        expect(result).toBe(
            '(FullyQualifiedName~NS.A.Test1) | (FullyQualifiedName~NS.B.Test2) | (FullyQualifiedName~NS.C)',
        );
    });
});

describe('collectAllMethodNodes', () => {
    it('should collect method nodes from multiple top-level nodes', () => {
        const method1 = makeNode('method', 'NS.A.Test1');
        const method2 = makeNode('method', 'NS.B.Test2');

        const result = collectAllMethodNodes([method1, method2]);

        expect(result).toHaveLength(2);
        expect(result).toContain(method1);
        expect(result).toContain(method2);
    });

    it('should deduplicate method nodes that appear under multiple parents', () => {
        const method = makeNode('method', 'NS.A.Test1');
        const classNode = makeNode('class', 'NS.A');
        classNode.addChild(method);

        const result = collectAllMethodNodes([classNode, method]);

        expect(result).toHaveLength(1);
        expect(result[0]).toBe(method);
    });

    it('should collect nested method nodes from class and namespace nodes', () => {
        const method1 = makeNode('method', 'NS.A.Test1');
        const method2 = makeNode('method', 'NS.A.Test2');
        const classNode = makeNode('class', 'NS.A');
        classNode.addChild(method1);
        classNode.addChild(method2);

        const result = collectAllMethodNodes([classNode]);

        expect(result).toHaveLength(2);
    });

    it('should return empty array for empty input', () => {
        const result = collectAllMethodNodes([]);

        expect(result).toHaveLength(0);
    });

    it('should include parameterizedCase nodes', () => {
        const case1 = makeNode('parameterizedCase', 'NS.A.Add(1,2)');
        const case2 = makeNode('parameterizedCase', 'NS.A.Add(3,4)');
        const methodNode = makeNode('method', 'NS.A.Add');
        methodNode.addChild(case1);
        methodNode.addChild(case2);

        const result = collectAllMethodNodes([methodNode]);

        expect(result).toHaveLength(2);
        expect(result).toContain(case1);
        expect(result).toContain(case2);
    });
});

describe('groupNodesByProject', () => {
    it('should group nodes by project path', () => {
        const node1 = makeNode('method', 'NS.A.Test1', '/path/to/projectA.csproj');
        const node2 = makeNode('method', 'NS.B.Test2', '/path/to/projectB.csproj');
        const node3 = makeNode('method', 'NS.A.Test3', '/path/to/projectA.csproj');

        const result = groupNodesByProject([node1, node2, node3]);

        expect(result.size).toBe(2);
        expect(result.get('/path/to/projectA.csproj')).toHaveLength(2);
        expect(result.get('/path/to/projectB.csproj')).toHaveLength(1);
    });

    it('should skip nodes without project path', () => {
        const node1 = makeNode('method', 'NS.A.Test1', '/path/to/project.csproj');
        const node2 = makeNode('method', 'NS.B.Test2');

        const result = groupNodesByProject([node1, node2]);

        expect(result.size).toBe(1);
        expect(result.get('/path/to/project.csproj')).toHaveLength(1);
    });

    it('should return empty map for empty input', () => {
        const result = groupNodesByProject([]);

        expect(result.size).toBe(0);
    });

    it('should put all nodes in one group when they share the same project', () => {
        const projectPath = '/path/to/project.csproj';
        const nodes = [
            makeNode('method', 'NS.A.Test1', projectPath),
            makeNode('method', 'NS.A.Test2', projectPath),
            makeNode('class', 'NS.B', projectPath),
        ];

        const result = groupNodesByProject(nodes);

        expect(result.size).toBe(1);
        expect(result.get(projectPath)).toHaveLength(3);
    });
});
