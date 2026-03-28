import { describe, it, expect } from 'vitest';
import { extractParameterArgs } from '../../src/discovery/dotnetDiscoverer';

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
