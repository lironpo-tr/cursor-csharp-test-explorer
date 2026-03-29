import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { Logger } from '../utils/logger';
import { splitParams } from '../utils/testNameUtils';
import { TestProject } from './projectDetector';
import {
    TEST_ATTRIBUTE_REGEX,
    PARAMETERIZED_ATTRIBUTE_REGEX,
    DYNAMIC_SOURCE_ATTRIBUTE_REGEX,
    CLASS_REGEX,
    METHOD_REGEX,
    NAMESPACE_REGEX,
} from './patterns';

export interface DiscoveredTest {
    fullyQualifiedName: string;
    namespace: string;
    className: string;
    methodName: string;
    displayName: string;
    projectName: string;
    projectDir: string;
    sourceUri: vscode.Uri;
    sourceLine: number;
    parameters?: string;
    hasDynamicSource?: boolean;
}

export async function discoverTests(
    project: TestProject,
    logger: Logger,
    token?: vscode.CancellationToken,
): Promise<DiscoveredTest[]> {
    const tests: DiscoveredTest[] = [];

    const csFiles = await vscode.workspace.findFiles(
        new vscode.RelativePattern(project.projectDir, '**/*.cs'),
        '{**/bin/**,**/obj/**}',
    );

    for (const fileUri of csFiles) {
        if (token?.isCancellationRequested) {
            return [];
        }

        try {
            const content = await fs.readFile(fileUri.fsPath, 'utf-8');
            if (!TEST_ATTRIBUTE_REGEX.test(content)) {
                continue;
            }

            const fileMethods = parseTestMethods(content, fileUri, project);
            tests.push(...fileMethods);
        } catch (err) {
            logger.logError(`Failed to parse ${fileUri.fsPath}`, err);
        }
    }

    logger.log(`Found ${tests.length} test(s) in ${project.projectName}`);
    return tests;
}

function parseTestMethods(
    content: string,
    fileUri: vscode.Uri,
    project: TestProject,
): DiscoveredTest[] {
    const results: DiscoveredTest[] = [];
    const lines = content.split(/\r?\n/);

    let currentNamespace = '';
    let currentClass = '';
    let nextMethodIsTest = false;
    let nextMethodIsDynamicSource = false;
    const pendingParams: string[] = [];
    let braceDepth = 0;
    const classStack: { name: string; depth: number }[] = [];

    const fileScopedNs = content.match(/^\s*namespace\s+([\w.]+)\s*;/m);
    if (fileScopedNs) {
        currentNamespace = fileScopedNs[1];
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (!fileScopedNs) {
            const nsMatch = trimmed.match(NAMESPACE_REGEX);
            if (nsMatch) {
                currentNamespace = nsMatch[1];
            }
        }

        const classMatch = trimmed.match(CLASS_REGEX);
        if (classMatch) {
            currentClass = classMatch[1];
            classStack.push({ name: currentClass, depth: braceDepth });
        }

        if (TEST_ATTRIBUTE_REGEX.test(trimmed)) {
            nextMethodIsTest = true;
        }

        if (DYNAMIC_SOURCE_ATTRIBUTE_REGEX.test(trimmed)) {
            nextMethodIsDynamicSource = true;
        }

        const paramArgs = extractParameterArgs(trimmed);
        if (paramArgs !== undefined) {
            pendingParams.push(paramArgs);
        }

        if (nextMethodIsTest) {
            const methodMatch = trimmed.match(METHOD_REGEX);
            if (methodMatch && currentClass) {
                const methodName = methodMatch[1];
                const baseFqn = currentNamespace
                    ? `${currentNamespace}.${currentClass}.${methodName}`
                    : `${currentClass}.${methodName}`;

                const shared = {
                    namespace: currentNamespace || currentClass,
                    className: currentClass,
                    methodName,
                    projectName: project.projectName,
                    projectDir: project.projectDir,
                    sourceUri: fileUri,
                    sourceLine: i,
                };

                if (pendingParams.length > 0) {
                    const paramTypes = parseMethodParamTypes(trimmed);
                    for (const params of pendingParams) {
                        const formatted = formatTestCaseParams(params, paramTypes);
                        results.push({
                            ...shared,
                            fullyQualifiedName: `${baseFqn}(${formatted})`,
                            displayName: `${methodName}(${formatted})`,
                            parameters: formatted,
                        });
                    }
                } else {
                    results.push({
                        ...shared,
                        fullyQualifiedName: baseFqn,
                        displayName: methodName,
                        hasDynamicSource: nextMethodIsDynamicSource || undefined,
                    });
                }

                nextMethodIsTest = false;
                nextMethodIsDynamicSource = false;
                pendingParams.length = 0;
            }
        }

        for (const ch of trimmed) {
            if (ch === '{') {
                braceDepth++;
            }
            if (ch === '}') {
                braceDepth--;
                if (
                    classStack.length > 0 &&
                    braceDepth <= classStack[classStack.length - 1].depth
                ) {
                    classStack.pop();
                    currentClass =
                        classStack.length > 0 ? classStack[classStack.length - 1].name : '';
                }
            }
        }
    }

    return results;
}

/**
 * Extracts C# parameter types from a method signature line.
 * Returns an empty array if the closing paren is not on the same line (multi-line signature).
 */
export function parseMethodParamTypes(line: string): string[] {
    const openParen = line.indexOf('(');
    if (openParen === -1) {
        return [];
    }

    let depth = 0;
    let closeParen = -1;
    for (let i = openParen; i < line.length; i++) {
        if (line[i] === '(') {
            depth++;
        }
        if (line[i] === ')') {
            depth--;
            if (depth === 0) {
                closeParen = i;
                break;
            }
        }
    }

    if (closeParen === -1) {
        return [];
    }

    const paramStr = line.substring(openParen + 1, closeParen).trim();
    if (!paramStr) {
        return [];
    }

    return paramStr.split(',').map((p) => {
        const tokens = p.trim().split(/\s+/);
        let idx = 0;
        while (idx < tokens.length - 1 && /^(out|ref|in|params|this)$/.test(tokens[idx])) {
            idx++;
        }
        return tokens[idx]?.replace(/\?$/, '') || '';
    });
}

const NUMERIC_LITERAL = /^(-?\d+(?:\.\d+)?)([dDfFmMuUlL]{0,2})$/;

/**
 * Formats a single parameter value based on its declared C# type,
 * replicating NUnit's canonical test-name formatting.
 *
 * NUnit's suffix logic is driven by the runtime type of the TestCase argument:
 *   - int literal (10)       → no suffix, even if param is decimal
 *   - double literal (10.5)  → 'd' if param is decimal, 'f' if param is float
 *   - explicit C# 'm' (10m) → 'd' (decimal literal)
 *   - explicit C# 'f' (3f)  → 'f' (float literal)
 */
export function formatParamValue(value: string, type: string): string {
    const v = value.trim();

    if (v.startsWith('"') || v.startsWith("'")) {
        return v;
    }

    const lower = type.toLowerCase();
    const numMatch = v.match(NUMERIC_LITERAL);

    if (numMatch) {
        const numPart = numMatch[1];
        const sourceSuffix = numMatch[2].toLowerCase();

        if (sourceSuffix === 'm') {
            return numPart + 'd';
        }
        if (sourceSuffix === 'f') {
            return numPart + 'f';
        }

        if (numPart.includes('.')) {
            if (lower === 'decimal') {
                return numPart + 'd';
            }
            if (lower === 'float' || lower === 'single') {
                return numPart + 'f';
            }
        }

        return numPart;
    }

    if (lower === 'bool' || lower === 'boolean') {
        if (v.toLowerCase() === 'true') {
            return 'True';
        }
        if (v.toLowerCase() === 'false') {
            return 'False';
        }
    }

    if (/^[A-Za-z_]/.test(v) && !v.includes('(')) {
        const dotIdx = v.lastIndexOf('.');
        if (dotIdx !== -1) {
            return v.substring(dotIdx + 1);
        }
    }

    return v;
}

/**
 * Formats all TestCase parameter values based on method parameter types
 * to produce the NUnit-canonical test name.
 * Falls back to raw whitespace-stripped params when types are unavailable.
 */
function formatTestCaseParams(rawParams: string, paramTypes: string[]): string {
    const values = splitParams(rawParams);

    if (paramTypes.length === 0) {
        return values.map((v) => v.trim()).join(',');
    }

    return values
        .map((val, i) => {
            const type = i < paramTypes.length ? paramTypes[i] : '';
            return formatParamValue(val, type);
        })
        .join(',');
}

/** Extracts the argument string from a parameterized test attribute, or undefined if not a match. */
export function extractParameterArgs(line: string): string | undefined {
    if (!PARAMETERIZED_ATTRIBUTE_REGEX.test(line)) {
        return undefined;
    }

    const openParen = line.indexOf('(', line.search(PARAMETERIZED_ATTRIBUTE_REGEX));
    if (openParen === -1) {
        return undefined;
    }

    let depth = 0;
    const start = openParen + 1;
    for (let i = openParen; i < line.length; i++) {
        const ch = line[i];
        if (ch === '(') {
            depth++;
        }
        if (ch === ')') {
            depth--;
            if (depth === 0) {
                return line.substring(start, i).trim();
            }
        }
    }

    return undefined;
}
