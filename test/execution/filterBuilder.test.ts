import { describe, it, expect } from 'vitest';
import { createMockTestItem } from '../__mocks__/vscode';
import {
    buildFilter,
    setTestItemData,
    getTagValue,
    getProjectPath,
    getNodeType,
    getFqn,
} from '../../src/execution/filterBuilder';

function makeTestItem(
    id: string,
    opts: { nodeType?: string; fqn?: string; projectPath?: string; parent?: any } = {},
) {
    const item = createMockTestItem(id, id, { parent: opts.parent });
    setTestItemData(item as any, {
        nodeType: opts.nodeType,
        fqn: opts.fqn,
        projectPath: opts.projectPath,
    });
    return item;
}

describe('setTestItemData / getTagValue', () => {
    it('should store and retrieve projectPath via tags', () => {
        const item = createMockTestItem('t1', 'Test1');

        setTestItemData(item as any, { projectPath: '/path/to/project.csproj' });

        expect(getProjectPath(item as any)).toBe('/path/to/project.csproj');
    });

    it('should store and retrieve nodeType via tags', () => {
        const item = createMockTestItem('t1', 'Test1');

        setTestItemData(item as any, { nodeType: 'method' });

        expect(getNodeType(item as any)).toBe('method');
    });

    it('should store and retrieve fqn via tags', () => {
        const item = createMockTestItem('t1', 'Test1');

        setTestItemData(item as any, { fqn: 'MyNamespace.MyClass.MyTest' });

        expect(getFqn(item as any)).toBe('MyNamespace.MyClass.MyTest');
    });

    it('should store multiple data fields at once', () => {
        const item = createMockTestItem('t1', 'Test1');

        setTestItemData(item as any, {
            projectPath: '/proj.csproj',
            nodeType: 'class',
            fqn: 'MyNamespace.MyClass',
        });

        expect(getProjectPath(item as any)).toBe('/proj.csproj');
        expect(getNodeType(item as any)).toBe('class');
        expect(getFqn(item as any)).toBe('MyNamespace.MyClass');
    });

    it('should return undefined for missing tag prefix', () => {
        const item = createMockTestItem('t1', 'Test1');

        expect(getTagValue(item as any, 'nonexistent')).toBeUndefined();
    });
});

describe('buildFilter', () => {
    it('should return undefined filter and projectPath for empty items', () => {
        const result = buildFilter([]);

        expect(result.filter).toBeUndefined();
        expect(result.projectPath).toBeUndefined();
    });

    it('should build exact match filter for a single method', () => {
        const item = makeTestItem('test1', {
            nodeType: 'method',
            fqn: 'MyNamespace.MyClass.MyTest',
            projectPath: '/proj.csproj',
        });

        const result = buildFilter([item as any]);

        expect(result.filter).toBe('FullyQualifiedName=MyNamespace.MyClass.MyTest');
        expect(result.projectPath).toBe('/proj.csproj');
    });

    it('should build contains filter for a class node', () => {
        const item = makeTestItem('class1', {
            nodeType: 'class',
            fqn: 'MyNamespace.MyClass',
            projectPath: '/proj.csproj',
        });

        const result = buildFilter([item as any]);

        expect(result.filter).toBe('FullyQualifiedName~MyNamespace.MyClass');
    });

    it('should build contains filter for a namespace node', () => {
        const item = makeTestItem('ns1', {
            nodeType: 'namespace',
            fqn: 'MyNamespace',
            projectPath: '/proj.csproj',
        });

        const result = buildFilter([item as any]);

        expect(result.filter).toBe('FullyQualifiedName~MyNamespace');
    });

    it('should return undefined filter for a project node (runs everything)', () => {
        const item = makeTestItem('proj1', {
            nodeType: 'project',
            fqn: 'MyProject',
            projectPath: '/proj.csproj',
        });

        const result = buildFilter([item as any]);

        expect(result.filter).toBeUndefined();
        expect(result.projectPath).toBe('/proj.csproj');
    });

    it('should join multiple method filters with OR operator', () => {
        const item1 = makeTestItem('test1', {
            nodeType: 'method',
            fqn: 'NS.Class.Test1',
            projectPath: '/proj.csproj',
        });
        const item2 = makeTestItem('test2', {
            nodeType: 'method',
            fqn: 'NS.Class.Test2',
            projectPath: '/proj.csproj',
        });

        const result = buildFilter([item1 as any, item2 as any]);

        expect(result.filter).toBe(
            '(FullyQualifiedName=NS.Class.Test1) | (FullyQualifiedName=NS.Class.Test2)',
        );
    });

    it('should mix method and class filters with OR operator', () => {
        const method = makeTestItem('test1', {
            nodeType: 'method',
            fqn: 'NS.ClassA.Test1',
            projectPath: '/proj.csproj',
        });
        const cls = makeTestItem('class1', {
            nodeType: 'class',
            fqn: 'NS.ClassB',
            projectPath: '/proj.csproj',
        });

        const result = buildFilter([method as any, cls as any]);

        expect(result.filter).toBe(
            '(FullyQualifiedName=NS.ClassA.Test1) | (FullyQualifiedName~NS.ClassB)',
        );
    });

    it('should skip items without fqn', () => {
        const withFqn = makeTestItem('test1', {
            nodeType: 'method',
            fqn: 'NS.Class.Test1',
            projectPath: '/proj.csproj',
        });
        const withoutFqn = makeTestItem('test2', {
            nodeType: 'method',
            projectPath: '/proj.csproj',
        });

        const result = buildFilter([withFqn as any, withoutFqn as any]);

        expect(result.filter).toBe('FullyQualifiedName=NS.Class.Test1');
    });

    it('should return undefined filter when all items lack fqn', () => {
        const item = makeTestItem('test1', {
            nodeType: 'method',
            projectPath: '/proj.csproj',
        });

        const result = buildFilter([item as any]);

        expect(result.filter).toBeUndefined();
    });

    it('should escape special characters in fqn', () => {
        const item = makeTestItem('test1', {
            nodeType: 'method',
            fqn: 'NS.Class.Test(a="b")',
            projectPath: '/proj.csproj',
        });

        const result = buildFilter([item as any]);

        expect(result.filter).toBe('FullyQualifiedName=NS.Class.Test\\(a\\=\\"b\\"\\)');
    });

    it('should use contains filter for unknown nodeType with fqn', () => {
        const item = makeTestItem('test1', {
            nodeType: 'unknown',
            fqn: 'NS.Something',
            projectPath: '/proj.csproj',
        });

        const result = buildFilter([item as any]);

        expect(result.filter).toBe('FullyQualifiedName~NS.Something');
    });

    it('should resolve projectPath from parent chain', () => {
        const project = makeTestItem('proj', {
            nodeType: 'project',
            projectPath: '/my/project.csproj',
        });
        const ns = makeTestItem('ns', {
            nodeType: 'namespace',
            fqn: 'MyNamespace',
            parent: project,
        });
        const cls = makeTestItem('cls', {
            nodeType: 'class',
            fqn: 'MyNamespace.MyClass',
            parent: ns,
        });
        const method = makeTestItem('m1', {
            nodeType: 'method',
            fqn: 'MyNamespace.MyClass.Test1',
            parent: cls,
        });

        const result = buildFilter([method as any]);

        expect(result.projectPath).toBe('/my/project.csproj');
    });

    it('should return undefined projectPath when no ancestor has one', () => {
        const item = makeTestItem('test1', {
            nodeType: 'method',
            fqn: 'NS.Class.Test1',
        });

        const result = buildFilter([item as any]);

        expect(result.projectPath).toBeUndefined();
    });

    it('should build exact match filter for a parameterizedCase node', () => {
        const item = makeTestItem('case1', {
            nodeType: 'parameterizedCase',
            fqn: 'NS.Class.Add(1, 2, 3)',
            projectPath: '/proj.csproj',
        });

        const result = buildFilter([item as any]);

        expect(result.filter).toBe('FullyQualifiedName=NS.Class.Add\\(1,2,3\\)');
    });

    it('should join parameterizedCase and method filters with OR', () => {
        const case1 = makeTestItem('case1', {
            nodeType: 'parameterizedCase',
            fqn: 'NS.Class.Add(1, 2)',
            projectPath: '/proj.csproj',
        });
        const method = makeTestItem('m1', {
            nodeType: 'method',
            fqn: 'NS.Class.OtherTest',
            projectPath: '/proj.csproj',
        });

        const result = buildFilter([case1 as any, method as any]);

        expect(result.filter).toBe(
            '(FullyQualifiedName=NS.Class.Add\\(1,2\\)) | (FullyQualifiedName=NS.Class.OtherTest)',
        );
    });

    it('should normalize boolean casing in parameterizedCase filter', () => {
        const item = makeTestItem('case1', {
            nodeType: 'parameterizedCase',
            fqn: 'NS.Class.Test(true, false)',
            projectPath: '/proj.csproj',
        });

        const result = buildFilter([item as any]);

        expect(result.filter).toBe('FullyQualifiedName=NS.Class.Test\\(True,False\\)');
    });

    it('should normalize enum prefixes in parameterizedCase filter', () => {
        const item = makeTestItem('case1', {
            nodeType: 'parameterizedCase',
            fqn: 'NS.Class.Test(FeeTypes.OverWeekend, 1)',
            projectPath: '/proj.csproj',
        });

        const result = buildFilter([item as any]);

        expect(result.filter).toBe('FullyQualifiedName=NS.Class.Test\\(OverWeekend,1\\)');
    });
});
