export class TestTag {
    constructor(public readonly id: string) {}
}

export interface TestItem {
    id: string;
    label: string;
    tags: TestTag[];
    parent?: TestItem;
    children: Map<string, TestItem>;
}

export function createMockTestItem(
    id: string,
    label: string,
    options?: { parent?: TestItem; tags?: TestTag[] }
): TestItem {
    return {
        id,
        label,
        tags: options?.tags ?? [],
        parent: options?.parent,
        children: new Map(),
    };
}

export const window = {
    createOutputChannel: () => ({
        appendLine: () => {},
        show: () => {},
        dispose: () => {},
    }),
};
