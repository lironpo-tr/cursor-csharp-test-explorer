import { describe, it, expect } from 'vitest';
import { stripComments, CommentState } from '../../src/discovery/patterns';

function freshState(): CommentState {
    return { inBlockComment: false };
}

describe('stripComments', () => {
    describe('single-line comments', () => {
        it('should strip a full-line comment', () => {
            const state = freshState();

            const result = stripComments('// this is a comment', state);

            expect(result).toBe('');
            expect(state.inBlockComment).toBe(false);
        });

        it('should strip a comment after code', () => {
            const state = freshState();

            const result = stripComments('[Test] // run this test', state);

            expect(result).toBe('[Test] ');
            expect(state.inBlockComment).toBe(false);
        });

        it('should strip a commented-out test attribute', () => {
            const state = freshState();

            const result = stripComments('// [Test]', state);

            expect(result).toBe('');
        });

        it('should strip a commented-out method signature', () => {
            const state = freshState();

            const result = stripComments('// public void OldTest()', state);

            expect(result).toBe('');
        });

        it('should strip indented line comment', () => {
            const state = freshState();

            const result = stripComments('    // [TestCase(1, 2)]', state);

            expect(result).toBe('    ');
        });
    });

    describe('block comments — single line', () => {
        it('should strip a block comment on a single line', () => {
            const state = freshState();

            const result = stripComments('/* [Test] */', state);

            expect(result).toBe('');
            expect(state.inBlockComment).toBe(false);
        });

        it('should preserve code around an inline block comment', () => {
            const state = freshState();

            const result = stripComments('code /* comment */ more', state);

            expect(result).toBe('code  more');
            expect(state.inBlockComment).toBe(false);
        });

        it('should handle multiple block comments on one line', () => {
            const state = freshState();

            const result = stripComments('a /* x */ b /* y */ c', state);

            expect(result).toBe('a  b  c');
            expect(state.inBlockComment).toBe(false);
        });
    });

    describe('block comments — multi-line', () => {
        it('should start a block comment that does not close on the same line', () => {
            const state = freshState();

            const result = stripComments('before /* [Test]', state);

            expect(result).toBe('before ');
            expect(state.inBlockComment).toBe(true);
        });

        it('should skip lines while inside a block comment', () => {
            const state: CommentState = { inBlockComment: true };

            const result = stripComments('[Test]', state);

            expect(result).toBe('');
            expect(state.inBlockComment).toBe(true);
        });

        it('should resume code after block comment closes', () => {
            const state: CommentState = { inBlockComment: true };

            const result = stripComments('*/ [Test]', state);

            expect(result).toBe(' [Test]');
            expect(state.inBlockComment).toBe(false);
        });

        it('should handle a full multi-line comment sequence', () => {
            const state = freshState();

            const line1 = stripComments('/* start of comment', state);
            expect(line1).toBe('');
            expect(state.inBlockComment).toBe(true);

            const line2 = stripComments('   [Test]', state);
            expect(line2).toBe('');
            expect(state.inBlockComment).toBe(true);

            const line3 = stripComments('   public void Foo() { }', state);
            expect(line3).toBe('');
            expect(state.inBlockComment).toBe(true);

            const line4 = stripComments('end of comment */', state);
            expect(line4).toBe('');
            expect(state.inBlockComment).toBe(false);
        });

        it('should handle block comment closing mid-line with code after', () => {
            const state: CommentState = { inBlockComment: true };

            const result = stripComments('  */ public void ActiveTest()', state);

            expect(result).toBe(' public void ActiveTest()');
            expect(state.inBlockComment).toBe(false);
        });
    });

    describe('lines without comments', () => {
        it('should return a plain code line unchanged', () => {
            const state = freshState();

            const result = stripComments('[Test]', state);

            expect(result).toBe('[Test]');
        });

        it('should return an empty string for an empty line', () => {
            const state = freshState();

            const result = stripComments('', state);

            expect(result).toBe('');
        });

        it('should return whitespace-only line unchanged', () => {
            const state = freshState();

            const result = stripComments('    ', state);

            expect(result).toBe('    ');
        });

        it('should preserve a method signature unchanged', () => {
            const state = freshState();

            const result = stripComments('public void MyTest(int a, int b)', state);

            expect(result).toBe('public void MyTest(int a, int b)');
        });

        it('should preserve a single slash that is not a comment', () => {
            const state = freshState();

            const result = stripComments('var x = a / b;', state);

            expect(result).toBe('var x = a / b;');
        });
    });

    describe('edge cases', () => {
        it('should handle a line with just //', () => {
            const state = freshState();

            const result = stripComments('//', state);

            expect(result).toBe('');
        });

        it('should handle a line with just /*', () => {
            const state = freshState();

            const result = stripComments('/*', state);

            expect(result).toBe('');
            expect(state.inBlockComment).toBe(true);
        });

        it('should handle a line with just */', () => {
            const state: CommentState = { inBlockComment: true };

            const result = stripComments('*/', state);

            expect(result).toBe('');
            expect(state.inBlockComment).toBe(false);
        });

        it('should handle block comment immediately followed by line comment', () => {
            const state = freshState();

            const result = stripComments('code /* block */ // line', state);

            expect(result).toBe('code  ');
            expect(state.inBlockComment).toBe(false);
        });

        it('should handle block comment open and close with no space', () => {
            const state = freshState();

            const result = stripComments('a/**/b', state);

            expect(result).toBe('ab');
            expect(state.inBlockComment).toBe(false);
        });
    });
});
