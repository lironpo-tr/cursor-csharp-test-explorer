import { describe, it, expect } from 'vitest';
import { normalizeTestName } from '../../src/utils/testNameUtils';

describe('normalizeTestName', () => {
    it('should return names without parameters unchanged', () => {
        expect(normalizeTestName('NS.Class.TestMethod')).toBe('NS.Class.TestMethod');
    });

    it('should strip whitespace after commas in parameters', () => {
        expect(normalizeTestName('Method(1, 2, 3)')).toBe('Method(1,2,3)');
    });

    it('should strip enum type prefixes from parameters', () => {
        expect(normalizeTestName('Method(FeeTypes.OverWeekend)')).toBe('Method(OverWeekend)');
    });

    it('should normalize boolean casing to PascalCase', () => {
        expect(normalizeTestName('Method(true, false)')).toBe('Method(True,False)');
    });

    it('should handle the exact case from the bug report', () => {
        const source = 'IsAllowedByCfdAsyncTestCases(3, 4, FeeTypes.OverWeekend, false)';
        const runtime = 'IsAllowedByCfdAsyncTestCases(3, 4, OverWeekend, False)';

        expect(normalizeTestName(source)).toBe(normalizeTestName(runtime));
    });

    it('should handle FQN with enum parameters', () => {
        const source = 'NS.Class.Method(3, 4, FeeTypes.OverWeekend, false)';
        const runtime = 'NS.Class.Method(3, 4, OverWeekend, False)';

        expect(normalizeTestName(source)).toBe(normalizeTestName(runtime));
    });

    it('should not strip prefixes from numeric values with dots', () => {
        expect(normalizeTestName('Method(3.14)')).toBe('Method(3.14)');
    });

    it('should not modify string literal parameters', () => {
        expect(normalizeTestName('Method("hello.world", "test")')).toBe(
            'Method("hello.world","test")',
        );
    });

    it('should handle null parameters', () => {
        expect(normalizeTestName('Method(null, 1)')).toBe('Method(null,1)');
    });

    it('should handle mixed parameter types', () => {
        const source = 'Test(3, "text", MyEnum.Value, true, null)';
        const expected = 'Test(3,"text",Value,True,null)';
        expect(normalizeTestName(source)).toBe(expected);
    });

    it('should handle deeply qualified enum names', () => {
        expect(normalizeTestName('Method(My.Namespace.EnumType.Value)')).toBe('Method(Value)');
    });

    it('should not strip dots inside parenthesized expressions', () => {
        expect(normalizeTestName('Method(typeof(System.String))')).toBe(
            'Method(typeof(System.String))',
        );
    });

    it('should handle single parameter with no commas', () => {
        expect(normalizeTestName('Method(Status.Active)')).toBe('Method(Active)');
    });

    it('should handle booleans with different casing', () => {
        expect(normalizeTestName('Method(True)')).toBe('Method(True)');
        expect(normalizeTestName('Method(FALSE)')).toBe('Method(False)');
        expect(normalizeTestName('Method(True)')).toBe(normalizeTestName('Method(true)'));
    });

    it('should preserve negative numbers', () => {
        expect(normalizeTestName('Method(-1, -3.5)')).toBe('Method(-1,-3.5)');
    });

    it('should handle string params containing commas', () => {
        expect(normalizeTestName('Method("a,b", 1)')).toBe('Method("a,b",1)');
    });
});
