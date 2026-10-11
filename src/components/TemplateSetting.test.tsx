// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { fakeBrowser } from '@webext-core/fake-browser';
import { GlobalSettingContext } from '@/context/GlobalSetting';
import { initialState } from '@/reducer/setting';
import { DEFAULT_CHZZK_TEMPLATES } from '@/render/chzzk-render';
import '@/translate/i18n';
import { EditorView } from '@uiw/react-codemirror';

// fake-browser엔 i18n과 일부 runtime API가 없다 — 하단 SocialFooter가 쓴다.
vi.stubGlobal('browser', {
    ...fakeBrowser,
    i18n: { getMessage: () => '' },
    runtime: { ...fakeBrowser.runtime, getURL: (p: string) => p, getManifest: () => ({ version: '0.0.0' }) },
});
const { default: TemplateSetting } = await import('./TemplateSetting');

function renderPage(custom: 'on' | 'off' = 'off') {
    const dispatch = vi.fn();
    render(
        <GlobalSettingContext.Provider value={{ globalSetting: { ...initialState, chzzkCustomTemplate: custom }, dispatchGlobalSetting: dispatch }}>
            <TemplateSetting />
        </GlobalSettingContext.Provider>,
    );
    return { dispatch };
}

// CodeMirror 편집기는 textarea가 아니라 contenteditable이다 — EditorView로 직접 읽고 쓴다.
const view = () => EditorView.findFromDOM(document.querySelector('.cm-editor') as HTMLElement)!;
const editorValue = () => view().state.doc.toString();
const typeTemplate = (value: string) => act(() => {
    view().dispatch({ changes: { from: 0, to: view().state.doc.length, insert: value } });
});

describe('TemplateSetting', () => {
    beforeEach(() => fakeBrowser.reset());
    afterEach(cleanup);

    it('기본 템플릿으로 시작하고 샘플 채팅을 미리보기에 그린다', async () => {
        renderPage();
        await waitFor(() => expect(editorValue()).toBe(DEFAULT_CHZZK_TEMPLATES.chat));
        expect(document.querySelectorAll('.tbc-chat').length).toBeGreaterThan(0);
        expect(document.querySelector('details.tbc-chat-cleanbot')).not.toBeNull();
    });

    it('토글을 켜면 설정을 dispatch', async () => {
        const { dispatch } = renderPage('off');
        fireEvent.click(screen.getByRole('switch'));
        expect(dispatch).toHaveBeenCalledWith({ type: 'SET_CHZZK_CUSTOM_TEMPLATE', payload: 'on' });
    });

    it('편집하면 미리보기가 바뀌고, 저장하면 기본값과 다른 종류만 저장한다', async () => {
        renderPage();
        await waitFor(() => expect(editorValue()).toBe(DEFAULT_CHZZK_TEMPLATES.chat));
        typeTemplate('<b class="mine">{{nickname}}</b>');
        expect(document.querySelector('.mine')).not.toBeNull();
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: /저장|Save/ })); });
        const stored = await fakeBrowser.storage.local.get('chzzkTemplates');
        expect(stored.chzzkTemplates).toEqual({ chat: '<b class="mine">{{nickname}}</b>' });
    });

    it('문법 오류면 줄·칸과 함께 알리고 저장을 막는다', async () => {
        renderPage();
        await waitFor(() => expect(editorValue()).toBe(DEFAULT_CHZZK_TEMPLATES.chat));
        typeTemplate('a\nbc{{#badges}}');
        expect(screen.getByRole('alert').textContent).toMatch(/2.*3/);
        expect((screen.getByRole('button', { name: /저장|Save/ }) as HTMLButtonElement).disabled).toBe(true);
    });
});
