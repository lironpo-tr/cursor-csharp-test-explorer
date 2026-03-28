import * as vscode from 'vscode';

/**
 * Builds a `dotnet test --filter` expression from a set of TestItems.
 *
 * VS Code's Testing API provides TestItems in a hierarchy:
 *   Project > Namespace > Class > Method
 *
 * We store the FQN in the TestItem's `id` field, so we can reconstruct
 * the filter expression from the selected items.
 *
 * Filter syntax: https://learn.microsoft.com/en-us/dotnet/core/testing/selective-unit-tests
 */

export interface FilterResult {
    filter: string | undefined;
    projectPath: string | undefined;
}

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

export function buildFilter(items: readonly vscode.TestItem[]): FilterResult {
    if (items.length === 0) {
        return { filter: undefined, projectPath: undefined };
    }

    const projectPath = findProjectPath(items[0]);
    const expressions: string[] = [];

    for (const item of items) {
        const nodeType = getNodeType(item);
        const fqn = getFqn(item);

        if (!fqn) {
            continue;
        }

        switch (nodeType) {
            case 'parameterizedCase':
            case 'method':
                expressions.push(`FullyQualifiedName=${escapeFilter(fqn)}`);
                break;
            case 'class':
                expressions.push(`FullyQualifiedName~${escapeFilter(fqn)}`);
                break;
            case 'namespace':
                expressions.push(`FullyQualifiedName~${escapeFilter(fqn)}`);
                break;
            case 'project':
                return { filter: undefined, projectPath };
            default:
                if (fqn) {
                    expressions.push(`FullyQualifiedName~${escapeFilter(fqn)}`);
                }
        }
    }

    if (expressions.length === 0) {
        return { filter: undefined, projectPath };
    }

    const filter =
        expressions.length === 1 ? expressions[0] : expressions.map((e) => `(${e})`).join(' | ');

    return { filter, projectPath };
}

function findProjectPath(item: vscode.TestItem): string | undefined {
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

function escapeFilter(value: string): string {
    // Escape characters that are special in the filter expression
    return value.replace(/[\\!"&|()~=]/g, '\\$&');
}
