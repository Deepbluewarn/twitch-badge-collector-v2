// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { fakeBrowser } from '@webext-core/fake-browser';
import i18n from '@/translate/i18n';
import { GlobalSettingContext } from '@/context/GlobalSetting';
import { FilterGroupContext } from '@/context/FilterGroup';
import { initialState } from '@/reducer/setting';
import type { CompositeFilterElement } from '@/interfaces/filter';

vi.stubGlobal('browser', fakeBrowser);
const { default: FilterTester } = await import('./FilterTester');

const rules: CompositeFilterElement[] = [
    { id: 'inc', platform: 'chzzk', filterType: 'include', filterNote: '', filters: [{ id: 'a', category: 'name', type: 'include', value: 'abc' }] },
    { id: 'exc', platform: 'chzzk', filterType: 'exclude', filterNote: '', filters: [{ id: 'b', category: 'keyword', type: 'include', value: '광고' }] },
];

function renderTester() {
    render(
        <GlobalSettingContext.Provider value={{ globalSetting: { ...initialState, platform: 'chzzk' }, dispatchGlobalSetting: vi.fn() }}>
            <FilterGroupContext.Provider value={{ filterGroup: rules } as any}>
                <FilterTester open onClose={() => {}} />
            </FilterGroupContext.Provider>
        </GlobalSettingContext.Provider>,
    );
}
const verdict = () => screen.getByRole('status').textContent ?? '';
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(i18n.t(label)), { target: { value } });

describe('FilterTester', () => {
    afterEach(cleanup);

    it('아무것도 안 넣으면 수집 안 됨', () => {
        renderTester();
        expect(verdict()).toContain(i18n.t('filter_test.not_collected'));
    });

    it('포함 필터에 맞으면 수집됨, 걸린 필터를 보여 준다', () => {
        renderTester();
        type('filter_test.nickname', 'ABC');
        expect(verdict()).toContain(i18n.t('filter_test.collected'));
        expect(verdict()).toContain('@abc');
    });

    it('제외 필터에 걸리면 포함 필터에 맞아도 제외됨', () => {
        renderTester();
        type('filter_test.nickname', 'abc');
        type('filter_test.message', '광고합니다');
        expect(verdict()).toContain(i18n.t('filter_test.excluded'));
        expect(verdict()).toContain('“광고”');
    });
});
