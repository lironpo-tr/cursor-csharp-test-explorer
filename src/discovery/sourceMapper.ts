import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { Logger } from '../utils/logger';
import {
    TEST_ATTRIBUTE_REGEX,
    CLASS_REGEX,
    METHOD_REGEX,
    NAMESPACE_REGEX,
    stripComments,
} from './patterns';

export interface SourceLocation {
    uri: vscode.Uri;
    line: number;
}

export async function buildSourceMap(
    projectDir: string,
    logger: Logger,
): Promise<Map<string, SourceLocation>> {
    const testMap = new Map<string, SourceLocation>();

    const csFiles = await vscode.workspace.findFiles(
        new vscode.RelativePattern(projectDir, '**/*.cs'),
        '{**/bin/**,**/obj/**}',
    );

    for (const fileUri of csFiles) {
        try {
            const content = await fs.readFile(fileUri.fsPath, 'utf-8');
            if (!TEST_ATTRIBUTE_REGEX.test(content)) {
                continue;
            }

            const locations = parseTestLocations(content, fileUri);
            for (const [key, loc] of locations) {
                testMap.set(key, loc);
            }
        } catch (err) {
            logger.logError(`Failed to parse ${fileUri.fsPath}`, err);
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
    const commentState = { inBlockComment: false };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const code = stripComments(line, commentState).trim();

        if (!code) {
            continue;
        }

        const nsMatch = code.match(NAMESPACE_REGEX);
        if (nsMatch) {
            currentNamespace = nsMatch[1];
            continue;
        }

        const classMatch = code.match(CLASS_REGEX);
        if (classMatch) {
            currentClass = classMatch[1];
            classStack.push({ name: currentClass, depth: braceDepth });

            const classKey = currentNamespace
                ? `${currentNamespace}.${currentClass}`
                : currentClass;
            result.set(`class:${classKey}`, { uri: fileUri, line: i });
        }

        if (TEST_ATTRIBUTE_REGEX.test(code)) {
            nextMethodIsTest = true;
        }

        if (nextMethodIsTest) {
            const methodMatch = code.match(METHOD_REGEX);
            if (methodMatch) {
                const methodName = methodMatch[1];
                const fqn = currentNamespace
                    ? `${currentNamespace}.${currentClass}.${methodName}`
                    : `${currentClass}.${methodName}`;
                result.set(fqn, { uri: fileUri, line: i });
                nextMethodIsTest = false;
            }
        }

        for (const ch of code) {
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
