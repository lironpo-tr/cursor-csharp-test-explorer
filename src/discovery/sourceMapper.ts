import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { logError } from '../utils/outputChannel';

export interface SourceLocation {
    uri: vscode.Uri;
    line: number;
}

// Matches: [Test], [TestCase(...)], [Fact], [Theory], [TestMethod], and variants with namespaces
const TEST_ATTRIBUTE_PATTERN =
    /\[\s*(?:NUnit\.Framework\.|Xunit\.|Microsoft\.VisualStudio\.TestTools\.UnitTesting\.)?(Test|TestCase|TestCaseSource|Fact|Theory|TestMethod|DataTestMethod)\b/;

const CLASS_PATTERN = /(?:public|internal)\s+(?:sealed\s+|abstract\s+|static\s+)*class\s+(\w+)/;
const METHOD_PATTERN =
    /(?:public|internal|protected)\s+(?:static\s+|async\s+|virtual\s+|override\s+)*\S+\s+(\w+)\s*(?:<[^>]+>\s*)?\(/;
const NAMESPACE_PATTERN = /namespace\s+([\w.]+)/;

export async function buildSourceMap(projectDir: string): Promise<Map<string, SourceLocation>> {
    const testMap = new Map<string, SourceLocation>();

    const csFiles = await vscode.workspace.findFiles(
        new vscode.RelativePattern(projectDir, '**/*.cs'),
        '{**/bin/**,**/obj/**}',
    );

    for (const fileUri of csFiles) {
        try {
            const content = await fs.readFile(fileUri.fsPath, 'utf-8');
            if (!TEST_ATTRIBUTE_PATTERN.test(content)) {
                continue;
            }

            const locations = parseTestLocations(content, fileUri);
            for (const [key, loc] of locations) {
                testMap.set(key, loc);
            }
        } catch (err) {
            logError(`Failed to parse ${fileUri.fsPath}`, err);
        }
    }

    return testMap;
}

function parseTestLocations(content: string, fileUri: vscode.Uri): Map<string, SourceLocation> {
    const result = new Map<string, SourceLocation>();
    const lines = content.split(/\r?\n/);

    let currentNamespace = '';
    let currentClass = '';
    let nextMethodIsTest = false;
    let braceDepth = 0;
    const classStack: { name: string; depth: number }[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        const nsMatch = trimmed.match(NAMESPACE_PATTERN);
        if (nsMatch) {
            currentNamespace = nsMatch[1];
            continue;
        }

        const classMatch = trimmed.match(CLASS_PATTERN);
        if (classMatch) {
            currentClass = classMatch[1];
            classStack.push({ name: currentClass, depth: braceDepth });

            const classKey = currentNamespace
                ? `${currentNamespace}.${currentClass}`
                : currentClass;
            result.set(`class:${classKey}`, { uri: fileUri, line: i });
        }

        if (TEST_ATTRIBUTE_PATTERN.test(trimmed)) {
            nextMethodIsTest = true;
        }

        if (nextMethodIsTest) {
            const methodMatch = trimmed.match(METHOD_PATTERN);
            if (methodMatch) {
                const methodName = methodMatch[1];
                const fqn = currentNamespace
                    ? `${currentNamespace}.${currentClass}.${methodName}`
                    : `${currentClass}.${methodName}`;
                result.set(fqn, { uri: fileUri, line: i });
                nextMethodIsTest = false;
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

    return result;
}
