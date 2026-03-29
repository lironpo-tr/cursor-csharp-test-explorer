import { describe, it, expect } from 'vitest';
import {
    extractParameterArgs,
    parseMethodParamTypes,
    formatParamValue,
} from '../../src/discovery/dotnetDiscoverer';
import { DYNAMIC_SOURCE_ATTRIBUTE_REGEX } from '../../src/discovery/patterns';

describe('extractParameterArgs', () => {
    it('should extract args from NUnit [TestCase(...)]', () => {
        const result = extractParameterArgs('[TestCase(1, 2, 3)]');

        expect(result).toBe('1, 2, 3');
    });

    it('should extract args from xUnit [InlineData(...)]', () => {
        const result = extractParameterArgs('[InlineData("hello", 42)]');

        expect(result).toBe('"hello", 42');
    });

    it('should extract args from MSTest [DataRow(...)]', () => {
        const result = extractParameterArgs('[DataRow(true, "test")]');

        expect(result).toBe('true, "test"');
    });

    it('should handle fully qualified NUnit attribute', () => {
        const result = extractParameterArgs('[NUnit.Framework.TestCase(1, 2)]');

        expect(result).toBe('1, 2');
    });

    it('should handle fully qualified xUnit attribute', () => {
        const result = extractParameterArgs('[Xunit.InlineData("a", "b")]');

        expect(result).toBe('"a", "b"');
    });

    it('should handle fully qualified MSTest attribute', () => {
        const result = extractParameterArgs(
            '[Microsoft.VisualStudio.TestTools.UnitTesting.DataRow(1)]',
        );

        expect(result).toBe('1');
    });

    it('should handle nested parentheses in parameters', () => {
        const result = extractParameterArgs('[TestCase(typeof(int), "value")]');

        expect(result).toBe('typeof(int), "value"');
    });

    it('should return undefined for non-parameterized [Test]', () => {
        const result = extractParameterArgs('[Test]');

        expect(result).toBeUndefined();
    });

    it('should return undefined for [Fact]', () => {
        const result = extractParameterArgs('[Fact]');

        expect(result).toBeUndefined();
    });

    it('should return undefined for [TestMethod]', () => {
        const result = extractParameterArgs('[TestMethod]');

        expect(result).toBeUndefined();
    });

    it('should return undefined for [TestCaseSource(...)]', () => {
        const result = extractParameterArgs('[TestCaseSource(nameof(Cases))]');

        expect(result).toBeUndefined();
    });

    it('should return undefined for plain code lines', () => {
        const result = extractParameterArgs('var x = 42;');

        expect(result).toBeUndefined();
    });

    it('should handle single parameter', () => {
        const result = extractParameterArgs('[TestCase(42)]');

        expect(result).toBe('42');
    });

    it('should handle string with special characters', () => {
        const result = extractParameterArgs('[InlineData("hello, world", 1)]');

        expect(result).toBe('"hello, world", 1');
    });

    it('should handle whitespace around attribute', () => {
        const result = extractParameterArgs('    [TestCase( 1, 2 )]');

        expect(result).toBe('1, 2');
    });

    it('should handle negative numbers', () => {
        const result = extractParameterArgs('[TestCase(-1, -2, 0)]');

        expect(result).toBe('-1, -2, 0');
    });

    it('should handle null parameter', () => {
        const result = extractParameterArgs('[TestCase(null, "test")]');

        expect(result).toBe('null, "test"');
    });

    it('should handle decimal and float parameters', () => {
        const result = extractParameterArgs('[TestCase(1.5, 2.0f, 3.14d)]');

        expect(result).toBe('1.5, 2.0f, 3.14d');
    });

    it('should return undefined for empty line', () => {
        const result = extractParameterArgs('');

        expect(result).toBeUndefined();
    });
});

describe('DYNAMIC_SOURCE_ATTRIBUTE_REGEX', () => {
    it('should match [TestCaseSource(...)]', () => {
        expect(DYNAMIC_SOURCE_ATTRIBUTE_REGEX.test('[TestCaseSource(nameof(Cases))]')).toBe(true);
    });

    it('should match with NUnit.Framework prefix', () => {
        expect(
            DYNAMIC_SOURCE_ATTRIBUTE_REGEX.test('[NUnit.Framework.TestCaseSource(typeof(MySource))]'),
        ).toBe(true);
    });

    it('should match with leading whitespace', () => {
        expect(
            DYNAMIC_SOURCE_ATTRIBUTE_REGEX.test('    [TestCaseSource(nameof(GetData))]'),
        ).toBe(true);
    });

    it('should match with whitespace inside brackets', () => {
        expect(
            DYNAMIC_SOURCE_ATTRIBUTE_REGEX.test('[  TestCaseSource(nameof(Cases))]'),
        ).toBe(true);
    });

    it('should not match [TestCase(...)]', () => {
        expect(DYNAMIC_SOURCE_ATTRIBUTE_REGEX.test('[TestCase(1, 2)]')).toBe(false);
    });

    it('should not match [Test]', () => {
        expect(DYNAMIC_SOURCE_ATTRIBUTE_REGEX.test('[Test]')).toBe(false);
    });

    it('should not match plain code', () => {
        expect(DYNAMIC_SOURCE_ATTRIBUTE_REGEX.test('var x = TestCaseSource;')).toBe(false);
    });
});

describe('parseMethodParamTypes', () => {
    it('should extract types from a single-line method signature', () => {
        const line =
            'public void MyTest(decimal stopLossValue, bool isBuy, decimal closeEtoroPrice, int precision)';

        expect(parseMethodParamTypes(line)).toEqual(['decimal', 'bool', 'decimal', 'int']);
    });

    it('should handle async Task return type', () => {
        const line = 'public async Task MyTest(decimal value, bool flag)';

        expect(parseMethodParamTypes(line)).toEqual(['decimal', 'bool']);
    });

    it('should strip nullable suffix from types', () => {
        const line = 'public void MyTest(decimal? value, int? count)';

        expect(parseMethodParamTypes(line)).toEqual(['decimal', 'int']);
    });

    it('should skip ref/out/in/params modifiers', () => {
        const line = 'public void MyTest(ref decimal value, out bool flag, in int count)';

        expect(parseMethodParamTypes(line)).toEqual(['decimal', 'bool', 'int']);
    });

    it('should return empty array for no parameters', () => {
        const line = 'public void MyTest()';

        expect(parseMethodParamTypes(line)).toEqual([]);
    });

    it('should return empty array when closing paren is missing (multi-line)', () => {
        const line = 'public void MyTest(decimal value,';

        expect(parseMethodParamTypes(line)).toEqual([]);
    });

    it('should return empty array for lines without parens', () => {
        const line = 'private string _field;';

        expect(parseMethodParamTypes(line)).toEqual([]);
    });

    it('should handle single parameter', () => {
        const line = 'public void MyTest(decimal value)';

        expect(parseMethodParamTypes(line)).toEqual(['decimal']);
    });

    it('should handle float and long types', () => {
        const line = 'public void MyTest(float rate, long count, double ratio)';

        expect(parseMethodParamTypes(line)).toEqual(['float', 'long', 'double']);
    });
});

describe('formatParamValue', () => {
    it('should add d suffix for decimal type', () => {
        expect(formatParamValue('10.5258', 'decimal')).toBe('10.5258d');
    });

    it('should add d suffix for integer value with decimal type', () => {
        expect(formatParamValue('10', 'decimal')).toBe('10d');
    });

    it('should add d suffix for negative decimal', () => {
        expect(formatParamValue('-3.14', 'decimal')).toBe('-3.14d');
    });

    it('should strip C# m suffix and add NUnit d suffix for decimal', () => {
        expect(formatParamValue('10.5258m', 'decimal')).toBe('10.5258d');
    });

    it('should add f suffix for float type', () => {
        expect(formatParamValue('3.14', 'float')).toBe('3.14f');
    });

    it('should add f suffix for Single type', () => {
        expect(formatParamValue('1.5', 'Single')).toBe('1.5f');
    });

    it('should strip C# f suffix and re-add for float', () => {
        expect(formatParamValue('3.14f', 'float')).toBe('3.14f');
    });

    it('should not add suffix for int type', () => {
        expect(formatParamValue('42', 'int')).toBe('42');
    });

    it('should not add suffix for double type', () => {
        expect(formatParamValue('3.14', 'double')).toBe('3.14');
    });

    it('should capitalize true for bool type', () => {
        expect(formatParamValue('true', 'bool')).toBe('True');
    });

    it('should capitalize false for bool type', () => {
        expect(formatParamValue('false', 'bool')).toBe('False');
    });

    it('should preserve already-capitalized booleans', () => {
        expect(formatParamValue('True', 'bool')).toBe('True');
        expect(formatParamValue('False', 'bool')).toBe('False');
    });

    it('should not modify string literals', () => {
        expect(formatParamValue('"hello"', 'string')).toBe('"hello"');
    });

    it('should not modify char literals', () => {
        expect(formatParamValue("'a'", 'char')).toBe("'a'");
    });

    it('should not modify null', () => {
        expect(formatParamValue('null', 'string')).toBe('null');
    });

    it('should handle whitespace around values', () => {
        expect(formatParamValue('  10.5  ', 'decimal')).toBe('10.5d');
    });

    it('should handle nullable decimal type', () => {
        expect(formatParamValue('10.5', 'decimal')).toBe('10.5d');
    });

    it('should strip enum type prefix to match NUnit ToString()', () => {
        expect(formatParamValue('MyEnum.Value', 'MyEnum')).toBe('Value');
    });

    it('should strip deeply qualified enum prefix', () => {
        expect(formatParamValue('My.Namespace.EnumType.Active', 'EnumType')).toBe('Active');
    });

    it('should not strip prefix from typeof expressions', () => {
        expect(formatParamValue('typeof(System.String)', 'Type')).toBe('typeof(System.String)');
    });

    it('should leave null unchanged for nullable decimal', () => {
        expect(formatParamValue('null', 'decimal')).toBe('null');
    });

    it('should leave null unchanged for nullable string', () => {
        expect(formatParamValue('null', 'string')).toBe('null');
    });

    it('should leave null unchanged for nullable bool', () => {
        expect(formatParamValue('null', 'bool')).toBe('null');
    });

    it('should leave simple enum member without prefix unchanged', () => {
        expect(formatParamValue('Active', 'MyEnum')).toBe('Active');
    });
});
