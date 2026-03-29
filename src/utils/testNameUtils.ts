/**
 * Normalizes a test name (with optional parameters) for comparison between
 * source-discovered names and .NET runtime/TRX names.
 *
 * Handles three categories of formatting differences:
 * 1. Whitespace after commas: "Method(1, 2)" → "Method(1,2)"
 * 2. Enum type prefixes:      "FeeTypes.OverWeekend" → "OverWeekend"
 * 3. Boolean casing:          "false" → "False", "true" → "True"
 */
export function normalizeTestName(name: string): string {
    const parenIdx = name.indexOf('(');
    if (parenIdx === -1) {
        return name;
    }

    const closeParen = name.lastIndexOf(')');
    if (closeParen === -1) {
        return name;
    }

    const methodPart = name.substring(0, parenIdx);
    const paramContent = name.substring(parenIdx + 1, closeParen);
    const trailing = name.substring(closeParen);

    const params = splitParams(paramContent);
    const normalized = params.map(normalizeParam).join(',');

    return methodPart + '(' + normalized + trailing;
}

function normalizeParam(raw: string): string {
    let param = raw.trim();

    if (param.startsWith('"') || param.startsWith("'")) {
        return param;
    }

    const lower = param.toLowerCase();
    if (lower === 'true') {
        return 'True';
    }
    if (lower === 'false') {
        return 'False';
    }

    if (/^[A-Za-z_]/.test(param) && !param.includes('(')) {
        const dotIdx = param.lastIndexOf('.');
        if (dotIdx !== -1) {
            param = param.substring(dotIdx + 1);
        }
    }

    return param;
}

function splitParams(params: string): string[] {
    const result: string[] = [];
    let current = '';
    let inString = false;
    let stringChar = '';
    let depth = 0;

    for (let i = 0; i < params.length; i++) {
        const ch = params[i];

        if (inString) {
            current += ch;
            if (ch === stringChar && params[i - 1] !== '\\') {
                inString = false;
            }
            continue;
        }

        if (ch === '"' || ch === "'") {
            inString = true;
            stringChar = ch;
            current += ch;
        } else if (ch === '(') {
            depth++;
            current += ch;
        } else if (ch === ')') {
            depth--;
            current += ch;
        } else if (ch === ',' && depth === 0) {
            result.push(current);
            current = '';
        } else {
            current += ch;
        }
    }

    if (current.length > 0) {
        result.push(current);
    }

    return result;
}
