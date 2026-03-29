export interface CommentState {
    inBlockComment: boolean;
}

/**
 * Strips C-style comments from a source line while tracking multi-line
 * block comment state across calls.  Handles line and block comments.
 */
export function stripComments(line: string, state: CommentState): string {
    let result = '';
    let i = 0;

    while (i < line.length) {
        if (state.inBlockComment) {
            const endIdx = line.indexOf('*/', i);
            if (endIdx === -1) {
                return result;
            }
            i = endIdx + 2;
            state.inBlockComment = false;
            continue;
        }

        if (i + 1 < line.length && line[i] === '/' && line[i + 1] === '/') {
            return result;
        }

        if (i + 1 < line.length && line[i] === '/' && line[i + 1] === '*') {
            state.inBlockComment = true;
            i += 2;
            continue;
        }

        result += line[i];
        i++;
    }

    return result;
}

export const TEST_ATTRIBUTE_REGEX =
    /\[\s*(?:NUnit\.Framework\.|Xunit\.|Microsoft\.VisualStudio\.TestTools\.UnitTesting\.)?(Test|TestCase|TestCaseSource|Fact|Theory|TestMethod|DataTestMethod)\b/;

export const PARAMETERIZED_ATTRIBUTE_REGEX =
    /\[\s*(?:NUnit\.Framework\.|Xunit\.|Microsoft\.VisualStudio\.TestTools\.UnitTesting\.)?(TestCase|InlineData|DataRow)\s*\(/;

export const CLASS_REGEX =
    /(?:public|internal)\s+(?:sealed\s+|abstract\s+|static\s+|partial\s+)*class\s+(\w+)/;

export const METHOD_REGEX =
    /(?:public|internal|protected)\s+(?:static\s+|async\s+|virtual\s+|override\s+)*\S+\s+(\w+)\s*(?:<[^>]+>\s*)?\(/;

export const DYNAMIC_SOURCE_ATTRIBUTE_REGEX =
    /\[\s*(?:NUnit\.Framework\.)?TestCaseSource\b/;

export const NAMESPACE_REGEX = /^\s*namespace\s+([\w.]+)/;
