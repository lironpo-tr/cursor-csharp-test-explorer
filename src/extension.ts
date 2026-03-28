import * as vscode from 'vscode';
import { CSharpTestController } from './testController';
import { TestTreeNode } from './ui/testTreeProvider';
import { createLogger, OutputChannelLogger } from './utils/outputChannel';

let controller: CSharpTestController | undefined;
let logger: OutputChannelLogger | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    logger = createLogger();
    logger.log('C# Test Explorer activating...');

    controller = new CSharpTestController(context, logger);
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
            logger?.showOutput();
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

        vscode.commands.registerCommand('csharpTestExplorer.filterTests', async () => {
            const query = await vscode.window.showInputBox({
                prompt: 'Filter tests by name',
                placeHolder: 'Type to filter (case-insensitive substring match)',
                value: controller?.treeProvider.activeFilter ?? '',
            });
            if (query === undefined) {
                return;
            }
            if (query === '') {
                controller?.clearFilter();
            } else {
                controller?.applyFilter(query);
            }
        }),

        vscode.commands.registerCommand('csharpTestExplorer.clearFilter', () => {
            controller?.clearFilter();
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
            logger?.log('File change detected, re-discovering tests...');
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

    logger.log('C# Test Explorer activated.');
}

export function deactivate(): void {
    controller?.dispose();
    controller = undefined;
    logger?.dispose();
    logger = undefined;
}
