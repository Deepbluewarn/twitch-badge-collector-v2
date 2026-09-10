import { describe, it, expect } from 'vitest';
import { splitSelectorBranches, extractClassHashes } from './selector-syntax';

describe('splitSelectorBranches', () => {
    it('splits a plain selector list', () => {
        expect(splitSelectorBranches('a, b , c')).toEqual(['a', 'b', 'c']);
    });

    it('returns a single-branch selector unchanged', () => {
        expect(splitSelectorBranches('div > span')).toEqual(['div > span']);
    });

    it('does not split inside :has()', () => {
        // 단순 split(',')이면 `:has(> a` 와 `b)` 로 쪼개져 둘 다 invalid selector가 된다.
        const sel = 'aside:has(> a, > b), div';
        expect(splitSelectorBranches(sel)).toEqual(['aside:has(> a, > b)', 'div']);
    });

    it('does not split inside attribute selectors or quotes', () => {
        const sel = '[data-x="a,b"], [data-y=\'c,d\']';
        expect(splitSelectorBranches(sel)).toEqual(['[data-x="a,b"]', "[data-y='c,d']"]);
    });

    it('handles the real rev 14 chzzk selectors', () => {
        const displayName = 'button[aria-haspopup="true"] [class*="_text_"], [class*="_nickname_"] [class*="_text_"]';
        expect(splitSelectorBranches(displayName)).toEqual([
            'button[aria-haspopup="true"] [class*="_text_"]',
            '[class*="_nickname_"] [class*="_text_"]',
        ]);

        const badge = '[class*="_icon_"] > [class*="_container_"]:has(> img), [class*="_container_1nwpy_"]:has(> img)';
        expect(splitSelectorBranches(badge)).toEqual([
            '[class*="_icon_"] > [class*="_container_"]:has(> img)',
            '[class*="_container_1nwpy_"]:has(> img)',
        ]);
    });

    it('drops empty branches from trailing or doubled commas', () => {
        expect(splitSelectorBranches('a,,b,')).toEqual(['a', 'b']);
    });
});

describe('extractClassHashes', () => {
    it('pulls CSS-module hash tokens out of a selector', () => {
        expect(extractClassHashes('[class*="_container_zw6kq_"] [class*="_text_"]')).toEqual([
            { word: 'container', hash: 'zw6kq', token: '_container_zw6kq_' },
        ]);
    });

    it('finds nothing in a hash-free selector', () => {
        // rev 14 목표 상태 — 감시할 fragile 지점이 없다.
        expect(extractClassHashes('[class*="_nickname_"] [class*="_text_"]')).toEqual([]);
    });

    it('handles hashes starting with a digit', () => {
        // 실제 chzzk 해시 `1mc5x` 는 숫자로 시작한다.
        expect(extractClassHashes('[class*="_container_1mc5x_"]')).toEqual([
            { word: 'container', hash: '1mc5x', token: '_container_1mc5x_' },
        ]);
    });
});
