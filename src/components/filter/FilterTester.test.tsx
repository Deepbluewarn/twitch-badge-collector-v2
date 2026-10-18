// @vitest-environment happy-dom
import React, { useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { fakeBrowser } from '@webext-core/fake-browser';
import i18n from '@/translate/i18n';
import type { CompositeFilterElement } from '@/interfaces/filter';
import type { PlatformAdapter } from '@/platform';

vi.stubGlobal('browser', fakeBrowser);
const { EMPTY_TEST, FilterTesterPanel, useFilterTest } = await import('./FilterTester');
const { FilterList } = await import('./FilterList');

const adapter = { getBadgeImageUrl: (v: string) => `https://img/${v}`, getBadgeIdentity: (u: string) => u } as unknown as PlatformAdapter;
const noop = () => {};
const actions = { editAtom: noop, addAtom: noop, removeAtom: noop, editChannel: noop, removeChannel: noop, editNote: noop, removeNote: noop, rotateType: noop, setColor: noop, deleteMany: noop };

const rules: CompositeFilterElement[] = [
    { id: 'inc', platform: 'chzzk', filterType: 'include', filterNote: '', filters: [{ id: 'a', category: 'name', type: 'include', value: 'abc' }] },
    { id: 'exc', platform: 'chzzk', filterType: 'exclude', filterNote: '', filters: [{ id: 'b', category: 'keyword', type: 'include', value: '광고' }] },
    // 조건 두 개(AND)
    { id: 'and', platform: 'chzzk', filterType: 'include', filterNote: '', filters: [
        { id: 'c1', category: 'name', type: 'include', value: 'zzz' },
        { id: 'c2', category: 'keyword', type: 'include', value: '공지' },
    ] },
];

function Harness() {
    const [input, setInput] = useState(EMPTY_TEST);
    const result = useFilterTest(input, rules, adapter);
    return (
        <>
            <FilterList rows={rules} adapter={adapter} actions={actions} test={result.rows} />
            <FilterTesterPanel input={input} onInput={setInput} result={result} rules={rules} adapter={adapter} onClose={noop} />
        </>
    );
}

const verdict = () => screen.getByRole('status').textContent ?? '';
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(i18n.t(label)), { target: { value } });

describe('필터 시험', () => {
    afterEach(cleanup);

    it('아무것도 안 넣으면 수집 안 됨', () => {
        render(<Harness />);
        expect(verdict()).toContain(i18n.t('filter_test.not_collected'));
    });

    it('포함 필터에 맞으면 수집됨', () => {
        render(<Harness />);
        type('filter_test.nickname', 'ABC');
        expect(verdict()).toContain(i18n.t('filter_test.collected'));
        expect(verdict()).toContain('@abc');
    });

    it('제외 필터에 걸리면 포함 필터에 맞아도 제외됨', () => {
        render(<Harness />);
        type('filter_test.nickname', 'abc');
        type('filter_test.message', '광고합니다');
        expect(verdict()).toContain(i18n.t('filter_test.excluded'));
    });

    it('조건 여러 개인 필터는 맞은 조건 ✓, 안 맞은 조건 ✕', () => {
        render(<Harness />);
        type('filter_test.message', '공지 확인');
        expect(screen.getAllByLabelText('✓')).toHaveLength(1);   // “공지” 맞음
        expect(screen.getAllByLabelText('✕')).toHaveLength(1);   // @zzz 안 맞음
        expect(verdict()).toContain(i18n.t('filter_test.not_collected'));
        type('filter_test.nickname', 'zzz');
        expect(verdict()).toContain(i18n.t('filter_test.collected'));
    });
});
