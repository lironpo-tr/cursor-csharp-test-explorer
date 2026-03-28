import * as vscode from 'vscode';
import { DiscoveredTest } from '../discovery/dotnetDiscoverer';
import { TestProject } from '../discovery/projectDetector';

export type TestNodeType = 'project' | 'namespace' | 'class' | 'method' | 'parameterizedCase';
export type TestState = 'none' | 'running' | 'passed' | 'failed' | 'skipped';

export class TestTreeNode {
    private readonly _children: TestTreeNode[] = [];
    state: TestState = 'none';
    errorMessage?: string;
    stackTrace?: string;
    duration?: number;
    sourceUri?: vscode.Uri;
    sourceLine?: number;
    projectPath?: string;

    constructor(
        public readonly id: string,
        public readonly label: string,
        public readonly nodeType: TestNodeType,
        public readonly fqn: string,
    ) {}

    get children(): readonly TestTreeNode[] {
        return this._children;
    }

    addChild(child: TestTreeNode): void {
        this._children.push(child);
    }

    get contextValue(): string {
        return `testNode.${this.nodeType}.${this.state}`;
    }
}

export class TestTreeProvider implements vscode.TreeDataProvider<TestTreeNode> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<
        TestTreeNode | undefined | void
    >();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private roots: TestTreeNode[] = [];
    private allNodes = new Map<string, TestTreeNode>();

    getTreeItem(element: TestTreeNode): vscode.TreeItem {
        const collapsible =
            element.children.length > 0
                ? vscode.TreeItemCollapsibleState.Expanded
                : vscode.TreeItemCollapsibleState.None;

        const item = new vscode.TreeItem(element.label, collapsible);
        item.id = element.id;
        item.contextValue = element.contextValue;
        item.iconPath = this.getIcon(element);
        item.tooltip = this.getTooltip(element);

        if (element.sourceUri) {
            item.resourceUri = element.sourceUri;
            item.command = {
                command: 'vscode.open',
                title: 'Go to Test',
                arguments: [
                    element.sourceUri,
                    element.sourceLine !== undefined
                        ? {
                              selection: new vscode.Range(
                                  element.sourceLine,
                                  0,
                                  element.sourceLine,
                                  0,
                              ),
                          }
                        : undefined,
                ],
            };
        }

        if (
            (element.nodeType === 'method' || element.nodeType === 'parameterizedCase') &&
            element.duration !== undefined
        ) {
            item.description = `${element.duration}ms`;
        }

        return item;
    }

    getChildren(element?: TestTreeNode): TestTreeNode[] {
        if (!element) {
            return this.roots;
        }
        return [...element.children];
    }

    getParent(element: TestTreeNode): TestTreeNode | undefined {
        for (const [, node] of this.allNodes) {
            if (node.children.includes(element)) {
                return node;
            }
        }
        return undefined;
    }

    buildTree(projects: TestProject[], testsByProject: Map<string, DiscoveredTest[]>): void {
        this.roots = [];
        this.allNodes.clear();

        for (const project of projects) {
            const tests = testsByProject.get(project.csprojPath) ?? [];
            if (tests.length === 0) {
                continue;
            }

            const pid = project.csprojPath;
            const projectNode = new TestTreeNode(
                `project:${pid}`,
                `${project.projectName} (${tests.length})`,
                'project',
                project.projectName,
            );
            projectNode.projectPath = project.csprojPath;
            this.allNodes.set(projectNode.id, projectNode);

            // Group: namespace -> class -> methodName -> tests
            const nsMap = new Map<string, Map<string, Map<string, DiscoveredTest[]>>>();
            for (const t of tests) {
                let classMap = nsMap.get(t.namespace);
                if (!classMap) {
                    classMap = new Map();
                    nsMap.set(t.namespace, classMap);
                }
                let methodMap = classMap.get(t.className);
                if (!methodMap) {
                    methodMap = new Map();
                    classMap.set(t.className, methodMap);
                }
                let cases = methodMap.get(t.methodName);
                if (!cases) {
                    cases = [];
                    methodMap.set(t.methodName, cases);
                }
                cases.push(t);
            }

            for (const [ns, classMap] of nsMap) {
                const nsNode = new TestTreeNode(`ns:${pid}:${ns}`, ns, 'namespace', ns);
                nsNode.projectPath = project.csprojPath;
                this.allNodes.set(nsNode.id, nsNode);

                for (const [cls, methodMap] of classMap) {
                    const classFqn = ns ? `${ns}.${cls}` : cls;
                    const methodCount = methodMap.size;
                    const classNode = new TestTreeNode(
                        `class:${pid}:${classFqn}`,
                        `${cls} (${methodCount})`,
                        'class',
                        classFqn,
                    );
                    classNode.projectPath = project.csprojPath;

                    let firstTestInClass: DiscoveredTest | undefined;
                    for (const [, cases] of methodMap) {
                        if (cases[0] && !firstTestInClass) {
                            firstTestInClass = cases[0];
                        }
                    }
                    if (firstTestInClass) {
                        classNode.sourceUri = firstTestInClass.sourceUri;
                        classNode.sourceLine = firstTestInClass.sourceLine;
                    }
                    this.allNodes.set(classNode.id, classNode);

                    for (const [methodName, cases] of methodMap) {
                        const hasParameterizedCases = cases.some((c) => c.parameters !== undefined);

                        if (hasParameterizedCases) {
                            const baseFqn = classFqn + '.' + methodName;
                            const methodNode = new TestTreeNode(
                                `method:${pid}:${baseFqn}`,
                                `${methodName} (${cases.length})`,
                                'method',
                                baseFqn,
                            );
                            methodNode.projectPath = project.csprojPath;
                            methodNode.sourceUri = cases[0].sourceUri;
                            methodNode.sourceLine = cases[0].sourceLine;
                            this.allNodes.set(methodNode.id, methodNode);

                            for (const testCase of cases) {
                                const caseNode = new TestTreeNode(
                                    `case:${pid}:${testCase.fullyQualifiedName}`,
                                    testCase.displayName,
                                    'parameterizedCase',
                                    testCase.fullyQualifiedName,
                                );
                                caseNode.projectPath = project.csprojPath;
                                caseNode.sourceUri = testCase.sourceUri;
                                caseNode.sourceLine = testCase.sourceLine;
                                this.allNodes.set(caseNode.id, caseNode);
                                methodNode.addChild(caseNode);
                            }

                            classNode.addChild(methodNode);
                        } else {
                            const test = cases[0];
                            const methodNode = new TestTreeNode(
                                `method:${pid}:${test.fullyQualifiedName}`,
                                test.displayName,
                                'method',
                                test.fullyQualifiedName,
                            );
                            methodNode.projectPath = project.csprojPath;
                            methodNode.sourceUri = test.sourceUri;
                            methodNode.sourceLine = test.sourceLine;
                            this.allNodes.set(methodNode.id, methodNode);
                            classNode.addChild(methodNode);
                        }
                    }

                    nsNode.addChild(classNode);
                }

                projectNode.addChild(nsNode);
            }

            this.roots.push(projectNode);
        }

        this._onDidChangeTreeData.fire();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    refreshNode(node: TestTreeNode): void {
        this._onDidChangeTreeData.fire(node);
        this.propagateStateUp(node);
    }

    clearRunningStates(): void {
        let changed = false;
        for (const [, node] of this.allNodes) {
            if (node.state === 'running') {
                node.state = 'none';
                changed = true;
            }
        }
        if (changed) {
            this._onDidChangeTreeData.fire();
        }
    }

    resetAllStates(): void {
        for (const [, node] of this.allNodes) {
            node.state = 'none';
            node.errorMessage = undefined;
            node.stackTrace = undefined;
            node.duration = undefined;
        }
        this._onDidChangeTreeData.fire();
    }

    getNodeByFqn(fqn: string): TestTreeNode | undefined {
        for (const [, node] of this.allNodes) {
            if (node.fqn === fqn || node.id.endsWith(`:${fqn}`)) {
                return node;
            }
        }
        return undefined;
    }

    getAllMethodNodes(): TestTreeNode[] {
        const methods: TestTreeNode[] = [];
        for (const [, node] of this.allNodes) {
            if (node.nodeType === 'method' || node.nodeType === 'parameterizedCase') {
                methods.push(node);
            }
        }
        return methods;
    }

    /** Returns only leaf test nodes (methods without children + parameterized cases). */
    getLeafTestNodes(): TestTreeNode[] {
        const leaves: TestTreeNode[] = [];
        for (const [, node] of this.allNodes) {
            if (node.nodeType === 'parameterizedCase') {
                leaves.push(node);
            } else if (node.nodeType === 'method' && node.children.length === 0) {
                leaves.push(node);
            }
        }
        return leaves;
    }

    addDynamicCaseNode(
        parentFqn: string,
        caseFqn: string,
        displayName: string,
    ): TestTreeNode | undefined {
        const parentNode = this.getNodeByFqn(parentFqn);
        if (!parentNode) {
            return undefined;
        }

        const existingCase = this.getNodeByFqn(caseFqn);
        if (existingCase) {
            return existingCase;
        }

        const pid = parentNode.projectPath ?? '';
        const caseNode = new TestTreeNode(
            `case:${pid}:${caseFqn}`,
            displayName,
            'parameterizedCase',
            caseFqn,
        );
        caseNode.projectPath = parentNode.projectPath;
        caseNode.sourceUri = parentNode.sourceUri;
        caseNode.sourceLine = parentNode.sourceLine;

        this.allNodes.set(caseNode.id, caseNode);
        parentNode.addChild(caseNode);
        return caseNode;
    }

    getRoots(): TestTreeNode[] {
        return this.roots;
    }

    getNodeById(id: string): TestTreeNode | undefined {
        return this.allNodes.get(id);
    }

    private propagateStateUp(node: TestTreeNode): void {
        const parent = this.getParent(node);
        if (!parent) {
            return;
        }

        const childStates = parent.children.map((c) => c.state);
        if (childStates.some((s) => s === 'failed')) {
            parent.state = 'failed';
        } else if (childStates.some((s) => s === 'running')) {
            parent.state = 'running';
        } else if (childStates.every((s) => s === 'passed')) {
            parent.state = 'passed';
        } else if (childStates.every((s) => s === 'skipped')) {
            parent.state = 'skipped';
        } else if (
            childStates.some((s) => s === 'passed') ||
            childStates.some((s) => s === 'skipped')
        ) {
            parent.state = 'passed';
        } else {
            parent.state = 'none';
        }

        this._onDidChangeTreeData.fire(parent);
        this.propagateStateUp(parent);
    }

    private getIcon(node: TestTreeNode): vscode.ThemeIcon {
        switch (node.state) {
            case 'passed':
                return new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'));
            case 'failed':
                return new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
            case 'skipped':
                return new vscode.ThemeIcon(
                    'debug-step-over',
                    new vscode.ThemeColor('testing.iconSkipped'),
                );
            case 'running':
                return new vscode.ThemeIcon('loading~spin');
            case 'none':
            default:
                switch (node.nodeType) {
                    case 'project':
                        return new vscode.ThemeIcon('project');
                    case 'namespace':
                        return new vscode.ThemeIcon('symbol-namespace');
                    case 'class':
                        return new vscode.ThemeIcon('symbol-class');
                    case 'method':
                        return new vscode.ThemeIcon('circle-outline');
                    case 'parameterizedCase':
                        return new vscode.ThemeIcon('symbol-parameter');
                }
        }
    }

    private getTooltip(node: TestTreeNode): string {
        let tip = `${node.fqn}`;
        if (node.state !== 'none') {
            tip += `\nStatus: ${node.state}`;
        }
        if (node.duration !== undefined) {
            tip += `\nDuration: ${node.duration}ms`;
        }
        if (node.errorMessage) {
            tip += `\n\nError: ${node.errorMessage}`;
        }
        if (node.stackTrace) {
            tip += `\n\n${node.stackTrace}`;
        }
        return tip;
    }

    dispose(): void {
        this._onDidChangeTreeData.dispose();
    }
}
