import * as vscode from 'vscode';
import { TestTreeNode } from './testTreeProvider';

export class StatusBarManager implements vscode.Disposable {
    private readonly statusBar: vscode.StatusBarItem;

    constructor() {
        this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.statusBar.command = 'csharpTestExplorer.runAll';
        this.statusBar.text = '$(beaker) C# Tests';
        this.statusBar.show();
    }

    showDiscovering(): void {
        this.statusBar.text = '$(loading~spin) Discovering C# tests...';
    }

    showNoProjects(): void {
        this.statusBar.text = '$(beaker) No test projects';
    }

    showDiscovered(count: number): void {
        this.statusBar.text = `$(beaker) ${count} C# test(s)`;
    }

    showDiscoveryFailed(): void {
        this.statusBar.text = '$(error) Discovery failed';
    }

    showRunning(): void {
        this.statusBar.text = '$(loading~spin) Running tests...';
    }

    showDebugging(): void {
        this.statusBar.text = '$(debug) Debugging...';
    }

    updateResults(methods: TestTreeNode[]): void {
        const passed = methods.filter((m) => m.state === 'passed').length;
        const failed = methods.filter((m) => m.state === 'failed').length;
        const total = methods.length;

        if (failed > 0) {
            this.statusBar.text = `$(error) ${passed}/${total} passed, ${failed} failed`;
            this.statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        } else if (passed === total && total > 0) {
            this.statusBar.text = `$(pass) ${total}/${total} passed`;
            this.statusBar.backgroundColor = undefined;
        } else {
            this.statusBar.text = `$(beaker) ${total} C# test(s)`;
            this.statusBar.backgroundColor = undefined;
        }
    }

    dispose(): void {
        this.statusBar.dispose();
    }
}
