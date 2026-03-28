import * as vscode from 'vscode';

const TAG_PROJECT_PATH = 'projectPath';
const TAG_NODE_TYPE = 'nodeType';
const TAG_FQN = 'fqn';

export function setTestItemData(
    item: vscode.TestItem,
    data: { projectPath?: string; nodeType?: string; fqn?: string },
): void {
    if (!item.tags) {
        item.tags = [];
    }
    // We store metadata as prefixed tags since TestItem doesn't have a generic data slot
    const tags: vscode.TestTag[] = [...item.tags];
    if (data.projectPath) {
        tags.push(new vscode.TestTag(`${TAG_PROJECT_PATH}:${data.projectPath}`));
    }
    if (data.nodeType) {
        tags.push(new vscode.TestTag(`${TAG_NODE_TYPE}:${data.nodeType}`));
    }
    if (data.fqn) {
        tags.push(new vscode.TestTag(`${TAG_FQN}:${data.fqn}`));
    }
    item.tags = tags;
}

export function getTagValue(item: vscode.TestItem, prefix: string): string | undefined {
    for (const tag of item.tags) {
        if (tag.id.startsWith(`${prefix}:`)) {
            return tag.id.substring(prefix.length + 1);
        }
    }
    return undefined;
}

export function getProjectPath(item: vscode.TestItem): string | undefined {
    return getTagValue(item, TAG_PROJECT_PATH);
}

export function getNodeType(item: vscode.TestItem): string | undefined {
    return getTagValue(item, TAG_NODE_TYPE);
}

export function getFqn(item: vscode.TestItem): string | undefined {
    return getTagValue(item, TAG_FQN);
}

export function findProjectPath(item: vscode.TestItem): string | undefined {
    let current: vscode.TestItem | undefined = item;
    while (current) {
        const pp = getProjectPath(current);
        if (pp) {
            return pp;
        }
        current = current.parent;
    }
    return undefined;
}
