import { describe, it, expect } from 'vitest';
import { normalizeTestName } from '../src/testController';

describe('normalizeTestName', () => {
    it('should return name unchanged when there are no parameters', () => {
        const result = normalizeTestName('Namespace.Class.Method');

        expect(result).toBe('Namespace.Class.Method');
    });

    it('should strip spaces after commas in parameter list', () => {
        const result = normalizeTestName('Namespace.Class.Method(1, 2, 3)');

        expect(result).toBe('Namespace.Class.Method(1,2,3)');
    });

    it('should leave name unchanged when parameters already have no spaces', () => {
        const result = normalizeTestName('Namespace.Class.Method(1,2,3)');

        expect(result).toBe('Namespace.Class.Method(1,2,3)');
    });

    it('should handle single parameter without change', () => {
        const result = normalizeTestName('Namespace.Class.Method(42)');

        expect(result).toBe('Namespace.Class.Method(42)');
    });

    it('should handle string parameters with spaces after commas', () => {
        const result = normalizeTestName('Method("hello", "world")');

        expect(result).toBe('Method("hello","world")');
    });

    it('should handle mixed types with spaces', () => {
        const result = normalizeTestName('NS.Cls.Add(1, "text", true)');

        expect(result).toBe('NS.Cls.Add(1,"text",true)');
    });

    it('should handle multiple spaces after commas', () => {
        const result = normalizeTestName('Method(1,  2,   3)');

        expect(result).toBe('Method(1,2,3)');
    });

    it('should not alter the base method name', () => {
        const result = normalizeTestName('Some.Long.Namespace.ClassName.MethodName(1, 2)');

        expect(result).toBe('Some.Long.Namespace.ClassName.MethodName(1,2)');
    });

    it('should handle short name without namespace', () => {
        const result = normalizeTestName('Add(1, 2)');

        expect(result).toBe('Add(1,2)');
    });

    it('should handle empty parameter list', () => {
        const result = normalizeTestName('Method()');

        expect(result).toBe('Method()');
    });

    it('should handle negative numbers as parameters', () => {
        const result = normalizeTestName('Method(-1, -2, 0)');

        expect(result).toBe('Method(-1,-2,0)');
    });

    it('should handle null parameter', () => {
        const result = normalizeTestName('Method(null, "test")');

        expect(result).toBe('Method(null,"test")');
    });

    it('should handle tab or mixed whitespace after commas', () => {
        const result = normalizeTestName('Method(1,\t2, 3)');

        expect(result).toBe('Method(1,2,3)');
    });

    it('should produce identical output for matching discovery and TRX formats', () => {
        const discoveryFqn = 'MyNamespace.MyClass.Add(1, 2, 3)';
        const trxTestName = 'MyNamespace.MyClass.Add(1,2,3)';

        expect(normalizeTestName(discoveryFqn)).toBe(normalizeTestName(trxTestName));
    });

    it('should produce matching suffix for short TRX name against full discovery FQN', () => {
        const discoveryFqn = normalizeTestName('MyNamespace.MyClass.Add(1, 2, 3)');
        const trxShortName = normalizeTestName('Add(1,2,3)');

        expect(discoveryFqn.endsWith(`.${trxShortName}`)).toBe(true);
    });
});
