// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react';
import { fakeBrowser } from '@webext-core/fake-browser';
import i18n from '@/translate/i18n';
import type { CompositeFilterElement } from '@/interfaces/filter';
import type { PlatformAdapter } from '@/platform';

vi.stubGlobal('browser', fakeBrowser);
const { FilterList } = await import('./FilterList');

const adapter = { getBadgeImageUrl: (v: string) => `https://img/${v}` } as unknown as PlatformAdapter;

function rows(n: number): CompositeFilterElement[] {
    return Array.from({ length: n }, (_, i) => ({
        id: `f${i}`, platform: 'chzzk', filterType: 'include', filterNote: '',
        filters: [{ id: `a${i}`, category: 'keyword', type: 'include', value: `키워드${i}` }],
    }));
}

function actions() {
    return {
        editAtom: vi.fn(), addAtom: vi.fn(), removeAtom: vi.fn(), editChannel: vi.fn(), removeChannel: vi.fn(),
        editNote: vi.fn(), removeNote: vi.fn(), rotateType: vi.fn(), setColor: vi.fn(), deleteMany: vi.fn(),
    };
}

const rowCheckboxes = () => screen.getAllByRole('checkbox', { name: /^선택$|^Select$/ });

describe('FilterList', () => {
    beforeEach(() => fakeBrowser.reset());
    afterEach(cleanup);

    it('기본은 한 페이지에 10개, 넘으면 페이지 이동이 생긴다', async () => {
        render(<FilterList rows={rows(25)} adapter={adapter} actions={actions()} />);
        expect(rowCheckboxes()).toHaveLength(10);
        expect(screen.getByText('1–10 / 25')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: '3' }));
        expect(rowCheckboxes()).toHaveLength(5);
    });

    it('10개 이하면 페이지당·페이지 이동을 숨긴다', () => {
        render(<FilterList rows={rows(7)} adapter={adapter} actions={actions()} />);
        expect(screen.queryByText(i18n.t('filter_list.per_page'))).toBeNull();
    });

    it('페이지당 개수를 바꾸면 기억한다', async () => {
        render(<FilterList rows={rows(25)} adapter={adapter} actions={actions()} />);
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: '20' })); });
        expect(rowCheckboxes()).toHaveLength(20);
        expect((await fakeBrowser.storage.local.get('filterListPageSize')).filterListPageSize).toBe(20);
    });

    it('전체 선택은 이 페이지를 고르고, 페이지가 더 있으면 모두 선택을 제안한다', () => {
        const a = actions();
        render(<FilterList rows={rows(25)} adapter={adapter} actions={a} />);
        fireEvent.click(screen.getByRole('checkbox', { name: /전체 선택|Select all/ }));
        // 문구는 실행 환경 언어를 따르므로 i18n에서 같은 문장을 만들어 비교한다.
        expect(screen.getByText(i18n.t('filter_list.selected', { count: 10 }))).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: i18n.t('filter_list.select_every', { count: 25 }) }));
        expect(screen.getByText(i18n.t('filter_list.selected', { count: 25 }))).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: i18n.t('common.delete_selected') }));
        expect(a.deleteMany).toHaveBeenCalledWith(new Set(rows(25).map(r => r.id)));
    });

    it('상태 태그를 누르면 회전, 칩을 누르면 편집', () => {
        const a = actions();
        const data = rows(1);
        render(<FilterList rows={data} adapter={adapter} actions={a} />);
        fireEvent.click(screen.getByRole('button', { name: /^포함$|^Include$/ }));
        expect(a.rotateType).toHaveBeenCalledWith(data[0]);
        fireEvent.click(screen.getByText('“키워드0”'));
        expect(a.editAtom).toHaveBeenCalledWith(data[0], 'a0');
    });

    it('포함 필터만 색 칸이 있고, 팔레트에서 고르면 저장한다', () => {
        const a = actions();
        const data = [...rows(1), { ...rows(2)[1], filterType: 'exclude' as const }];
        render(<FilterList rows={data} adapter={adapter} actions={a} />);
        const swatches = screen.getAllByRole('button', { name: /수집 표시 색|Marker color/ });
        expect(swatches).toHaveLength(1);
        fireEvent.click(swatches[0]);
        const palette = screen.getByRole('dialog');
        fireEvent.click(within(palette).getByRole('button', { name: '#4C8DFF' }));
        expect(a.setColor).toHaveBeenCalledWith(data[0], '#4C8DFF');
    });
});
