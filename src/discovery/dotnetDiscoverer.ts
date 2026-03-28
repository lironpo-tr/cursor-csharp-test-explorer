import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { log, logError } from '../utils/outputChannel';
import { TestProject } from './projectDetector';

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
}

const TEST_ATTR_REGEX =
    /\[\s*(?:NUnit\.Framework\.|Xunit\.|Microsoft\.VisualStudio\.TestTools\.UnitTesting\.)?(Test|TestCase|TestCaseSource|Fact|Theory|TestMethod|DataTestMethod)\b/;
const PARAMETERIZED_ATTR_REGEX =
    /\[\s*(?:NUnit\.Framework\.|Xunit\.|Microsoft\.VisualStudio\.TestTools\.UnitTesting\.)?(TestCase|InlineData|DataRow)\s*\(/;
const CLASS_REGEX =
    /(?:public|internal)\s+(?:sealed\s+|abstract\s+|static\s+|partial\s+)*class\s+(\w+)/;
const METHOD_REGEX =
    /(?:public|internal|protected)\s+(?:static\s+|async\s+|virtual\s+|override\s+)*\S+\s+(\w+)\s*(?:<[^>]+>\s*)?\(/;
const NAMESPACE_REGEX = /^\s*namespace\s+([\w.]+)/;

export async function discoverTests(
    project: TestProject,
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
            if (!TEST_ATTR_REGEX.test(content)) {
                continue;
            }

            const fileMethods = parseTestMethods(content, fileUri, project);
            tests.push(...fileMethods);
        } catch (err) {
            logError(`Failed to parse ${fileUri.fsPath}`, err);
        }
    }

    log(`Found ${tests.length} test(s) in ${project.projectName}`);
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

        if (TEST_ATTR_REGEX.test(trimmed)) {
            nextMethodIsTest = true;
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
                    for (const params of pendingParams) {
                        results.push({
                            ...shared,
                            fullyQualifiedName: `${baseFqn}(${params})`,
                            displayName: `${methodName}(${params})`,
                            parameters: params,
                        });
                    }
                } else {
                    results.push({
                        ...shared,
                        fullyQualifiedName: baseFqn,
                        displayName: methodName,
                    });
                }

                nextMethodIsTest = false;
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

/** Extracts the argument string from a parameterized test attribute, or undefined if not a match. */
export function extractParameterArgs(line: string): string | undefined {
    if (!PARAMETERIZED_ATTR_REGEX.test(line)) {
        return undefined;
    }

    const openParen = line.indexOf('(', line.search(PARAMETERIZED_ATTR_REGEX));
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
