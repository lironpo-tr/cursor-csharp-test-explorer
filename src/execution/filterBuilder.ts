import * as vscode from 'vscode';
import {
    setTestItemData,
    getTagValue,
    getProjectPath,
    getNodeType,
    getFqn,
    findProjectPath,
} from '../utils/testItemUtils';
import { normalizeTestName } from '../utils/testNameUtils';

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

export { setTestItemData, getTagValue, getProjectPath, getNodeType, getFqn };

export interface FilterResult {
    filter: string | undefined;
    projectPath: string | undefined;
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
                expressions.push(`FullyQualifiedName=${escapeFilter(normalizeTestName(fqn))}`);
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

function escapeFilter(value: string): string {
    // Escape characters that are special in the filter expression
    return value.replace(/[\\!"&|()~=]/g, '\\$&');
}
