import * as vscode from 'vscode';
import { CSharpTestController } from './testController';
import { TestTreeNode } from './ui/testTreeProvider';
import { disposeChannel, log, showOutput } from './utils/outputChannel';

let controller: CSharpTestController | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    log('C# Test Explorer activating...');

    controller = new CSharpTestController(context);
    context.subscriptions.push(controller);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('csharpTestExplorer.refreshTests', () => {
            controller?.discoverAllTests();
        }),

        vscode.commands.registerCommand('csharpTestExplorer.runAll', () => {
            controller?.runAll();
        }),

        vscode.commands.registerCommand('csharpTestExplorer.runTest', (node: TestTreeNode) => {
            if (node) {
                controller?.runNode(node);
            }
        }),

        vscode.commands.registerCommand('csharpTestExplorer.debugTest', (node: TestTreeNode) => {
            if (node) {
                controller?.debugNode(node);
            }
        }),

        vscode.commands.registerCommand('csharpTestExplorer.showOutput', () => {
            showOutput();
        }),

        vscode.commands.registerCommand('csharpTestExplorer.goToTest', (node: TestTreeNode) => {
            if (node?.sourceUri) {
                const options: vscode.TextDocumentShowOptions =
                    node.sourceLine !== undefined
                        ? { selection: new vscode.Range(node.sourceLine, 0, node.sourceLine, 0) }
                        : {};
                vscode.window.showTextDocument(node.sourceUri, options);
            }
        }),

        vscode.commands.registerCommand('csharpTestExplorer.stopRun', () => {
            controller?.stopRun();
        }),
    );

    // File watcher: re-discover when .cs or .csproj files change
    const csWatcher = vscode.workspace.createFileSystemWatcher('**/*.cs');
    const csprojWatcher = vscode.workspace.createFileSystemWatcher('**/*.csproj');

    let debounceTimer: NodeJS.Timeout | undefined;
    const debouncedRediscover = () => {
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => {
            log('File change detected, re-discovering tests...');
            controller?.discoverAllTests();
        }, 3000);
    };

    csWatcher.onDidChange(debouncedRediscover);
    csWatcher.onDidCreate(debouncedRediscover);
    csWatcher.onDidDelete(debouncedRediscover);
    csprojWatcher.onDidChange(debouncedRediscover);

    context.subscriptions.push(csWatcher, csprojWatcher);

    // Auto-discover on open
    const autoDiscover = vscode.workspace
        .getConfiguration('csharpTestExplorer')
        .get<boolean>('autoDiscoverOnOpen', true);

    if (autoDiscover) {
        await controller.discoverAllTests();
    }

    log('C# Test Explorer activated.');
}

export function deactivate(): void {
    controller?.dispose();
    controller = undefined;
    disposeChannel();
}
