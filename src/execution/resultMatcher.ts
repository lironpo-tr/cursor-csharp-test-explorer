import { TestTreeProvider, TestTreeNode, TestState } from '../ui/testTreeProvider';
import { TrxSummary } from './trxParser';
import { Logger } from '../utils/logger';
import { normalizeTestName } from '../utils/testNameUtils';

export { normalizeTestName };

export interface ResultDetails {
    errorMessage?: string;
    stackTrace?: string;
    duration?: number;
}

export function applyResultState(
    node: TestTreeNode,
    state: TestState,
    details: ResultDetails | undefined,
    treeProvider: TestTreeProvider,
): void {
    node.state = state;
    if (details) {
        node.errorMessage = details.errorMessage;
        node.stackTrace = details.stackTrace;
        node.duration = details.duration;
    }
    treeProvider.refreshNode(node);
}

/**
 * Matches TRX results to tree nodes using a multi-pass strategy:
 * 1. Exact FQN match (normalized for whitespace differences)
 * 2. Dynamic parameterized case node creation for unmatched parameterized results
 * 3. Base name match (stripping parameters)
 * 4. Short name fallback (last segment of FQN)
 */
export function matchAndApplyResults(
    summary: TrxSummary,
    methodNodes: TestTreeNode[],
    treeProvider: TestTreeProvider,
    logger: Logger,
): void {
    const methodsByName = new Map<string, TestTreeNode[]>();
    for (const m of methodNodes) {
        const shortName =
            m.fqn
                .replace(/\(.*\)$/, '')
                .split('.')
                .pop() ?? m.fqn;
        const list = methodsByName.get(shortName) ?? [];
        list.push(m);
        methodsByName.set(shortName, list);
    }

    for (const tr of summary.results) {
        const state: TestState =
            tr.outcome === 'Passed'
                ? 'passed'
                : tr.outcome === 'Failed' ||
                    tr.outcome === 'Error' ||
                    tr.outcome === 'Timeout'
                  ? 'failed'
                  : 'skipped';

        const details: ResultDetails = {
            errorMessage: tr.errorMessage,
            stackTrace: tr.stackTrace,
            duration: tr.duration,
        };

        let matched = tryMatchResult(tr.testName, state, details, methodNodes, treeProvider);

        if (!matched) {
            const baseName = tr.testName.replace(/\(.*\)$/, '');
            const hasParams = baseName !== tr.testName;

            if (hasParams) {
                const paramPart = tr.testName.substring(baseName.length);
                const shortMethod = baseName.split('.').pop() ?? baseName;
                const displayName = shortMethod + paramPart;

                let dynamicNode = treeProvider.addDynamicCaseNode(
                    baseName,
                    tr.testName,
                    displayName,
                );

                if (!dynamicNode) {
                    const parent = findParentBySuffix(baseName, methodNodes);
                    if (parent) {
                        const parentBase = parent.fqn.replace(/\(.*\)$/, '');
                        const fullCaseFqn = parentBase + paramPart;
                        dynamicNode = treeProvider.addDynamicCaseNode(
                            parentBase,
                            fullCaseFqn,
                            displayName,
                        );
                    }
                }

                if (dynamicNode) {
                    applyResultState(dynamicNode, state, details, treeProvider);
                    matched = true;
                }
            }

            if (!matched) {
                matched = tryMatchResult(baseName, state, details, methodNodes, treeProvider);
            }
        }

        if (!matched) {
            const shortName =
                tr.testName
                    .replace(/\(.*\)$/, '')
                    .split('.')
                    .pop() ?? tr.testName;
            const candidates = methodsByName.get(shortName);
            if (candidates && candidates.length > 0) {
                for (const c of candidates) {
                    applyResultState(c, state, details, treeProvider);
                }
                matched = true;
            }
        }

        if (!matched) {
            logger.log(`Unmatched result: ${tr.testName} (${tr.outcome})`);
        }
    }

    logger.log(
        `Results: ${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped`,
    );
}

/**
 * Finds a parent method node whose base FQN (params stripped) matches the given
 * base name exactly or by suffix. Handles the case where TRX results use short
 * names (e.g., "MethodName") while tree nodes store full FQNs
 * (e.g., "Namespace.Class.MethodName").
 */
function findParentBySuffix(
    baseName: string,
    candidates: TestTreeNode[],
): TestTreeNode | undefined {
    for (const node of candidates) {
        const nodeBase = node.fqn.replace(/\(.*\)$/, '');
        if (nodeBase === baseName || nodeBase.endsWith(`.${baseName}`)) {
            return node;
        }
    }
    return undefined;
}

function tryMatchResult(
    name: string,
    state: TestState,
    details: ResultDetails,
    candidates: TestTreeNode[],
    treeProvider: TestTreeProvider,
): boolean {
    const normalized = normalizeTestName(name);
    for (const node of candidates) {
        const normalizedFqn = normalizeTestName(node.fqn);
        if (normalizedFqn === normalized || normalizedFqn.endsWith(`.${normalized}`)) {
            applyResultState(node, state, details, treeProvider);
            return true;
        }
    }
    return false;
}
