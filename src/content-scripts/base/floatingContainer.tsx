import React, { useEffect, useRef, useState } from "react";
import { createRoot, Root } from "react-dom/client";
import "./floatingContainer.css";
import App from "@/components/Extension/App";
import { PlatformAdapter } from "@/platform";
import { SettingInterface } from "@/interfaces/setting";
import { Observer } from "./observer";

// FloatingShell(parent) useEffect는 useChatStream(child)의 Phase 1 스캔 뒤에 실행 →
// 그 사이 dispatch된 tbc-filtered-chat 유실 (bar preview 첫 신규 채팅까지 null).
// Module load 시점에 window listener 부착 + latest snapshot 보관 → mount 시 useState
// 초기값으로 소비. Phase 2 이후는 여기 latest도 갱신되고 React 구독자에게도 전달.
interface FilteredChatDetail { nickname: string; text: string; time?: number }
let latestFilteredChat: FilteredChatDetail | null = null;
const latestListeners = new Set<(c: FilteredChatDetail | null) => void>();
if (typeof window !== 'undefined') {
    window.addEventListener('tbc-filtered-chat', (e: Event) => {
        const d = (e as CustomEvent).detail as FilteredChatDetail | undefined;
        if (!d) return;
        latestFilteredChat = d;
        latestListeners.forEach(fn => fn(d));
    });
    window.addEventListener('tbc-chats-cleared', () => {
        latestFilteredChat = null;
        latestListeners.forEach(fn => fn(null));
    });
}

/**
 * Floating mode — inline 합치는 대신 별도 아이콘 + 팝오버로 표시.
 *
 * - 아이콘은 anchor element(예: aside#aside-chatting) 좌상단에 absolute 위치.
 * - 클릭 → 팝오버 열림, 외부 클릭으로 닫힘.
 * - 새 채팅 도착 시(TBC_CHAT_PASSED_ACTION postMessage 감지) 아이콘에 dot 표시.
 *   팝오버 열면 reset.
 * - 팝오버 내부에 App을 mount — Local 컴포넌트가 그대로 동작. 채팅 stream/
 *   필터/필터/캡쳐 등 inline과 동일 구현 재사용.
 */
export class FloatingContainer {
    adapter: PlatformAdapter;
    type: SettingInterface['platform'];
    anchorSelector: string;
    private observer: Observer;
    private rootEl: HTMLDivElement | null = null;
    private reactRoot: Root | null = null;
    private parentObserver: MutationObserver | null = null;

    /**
     * @param anchorSelector mount 대상 부모 (chzzk: aside#aside-chatting)
     * @param readinessSelector chzzk가 chat 패널 렌더 완료했음을 알리는 selector.
     *   채널 이동 직후 anchor만 있고 children 미렌더 상태일 수 있어 이 selector
     *   매칭이 chat ready 신호. Observer가 초기 match + subsequent mutation 모두에서
     *   callback 발화 — readiness 대기 + 후속 reconcile 복구 동시 수행.
     */
    constructor(adapter: PlatformAdapter, anchorSelector: string, readinessSelector: string) {
        this.adapter = adapter;
        this.type = adapter.type;
        this.anchorSelector = anchorSelector;
        // temporal=false — readiness selector 매칭 후 chzzk가 후속 reconcile해도
        // 계속 callback 발화 → 위치 재정렬 가능.
        this.observer = new Observer(readinessSelector, false);
    }

    create() {
        this.observer.observe(() => {
            const anchor = document.querySelector(this.anchorSelector) as HTMLElement | null;
            if (!anchor) return;
            if (this.rootEl && anchor.contains(this.rootEl)) return;

            if (this.rootEl) {
                // 채널 이동으로 aside 교체됨 → React tree 살리고 DOM만 이동.
                this.parentObserver?.disconnect();
                this.insertIntoAnchor(anchor, this.rootEl);
                this.attachParentObserver(anchor);
            } else {
                this.mount(anchor);
            }
        });
    }

    private attachParentObserver(anchor: HTMLElement) {
        this.parentObserver = new MutationObserver(() => {
            if (this.rootEl && !this.rootEl.isConnected) {
                this.insertIntoAnchor(anchor, this.rootEl);
            }
        });
        this.parentObserver.observe(anchor, { childList: true });
    }

    private insertIntoAnchor(anchor: HTMLElement, el: HTMLElement) {
        // 헤더(첫 자식) 다음에 위치 — 헤더와 랭킹/채팅 사이.
        const header = anchor.firstElementChild;
        if (header && header.nextSibling) {
            anchor.insertBefore(el, header.nextSibling);
        } else {
            anchor.appendChild(el);
        }
    }

    private mount(anchor: HTMLElement) {
        const root = document.createElement('div');
        root.id = `tbc-floating-${this.type}`;
        // 우리 element 식별용 data attribute — MO에서 복구할 때 사용.
        root.dataset.tbcFloatingRoot = '1';
        this.insertIntoAnchor(anchor, root);
        this.rootEl = root;
        this.reactRoot = createRoot(root);
        this.reactRoot.render(
            <FloatingShell adapter={this.adapter} type={this.type} anchor={anchor} />,
        );

        // chzzk React가 reconcile로 우리 root를 떼어내면 다시 끼워 넣음.
        this.attachParentObserver(anchor);
    }

    destroy() {
        this.parentObserver?.disconnect();
        this.parentObserver = null;
        this.reactRoot?.unmount();
        this.rootEl?.remove();
        this.rootEl = null;
        this.reactRoot = null;
    }
}

interface ShellProps {
    adapter: PlatformAdapter;
    type: SettingInterface['platform'];
    anchor: HTMLElement;
}

// POPOVER_WIDTH는 anchor(aside)의 실제 width로 동적 결정 — bar/popover가 패널 가득.
const POPOVER_HEIGHT = 480;

function FloatingShell({ adapter, type, anchor }: ShellProps) {
    const [open, setOpen] = useState(false);
    // 팝오버 닫힌 동안 들어온 미확인 채팅 개수. 열리면 0으로 reset.
    const [unreadCount, setUnreadCount] = useState(0);
    // 가장 최근 *필터 통과한* 채팅 preview — bar에 표시.
    // 초기값 = module snapshot. useChatStream Phase 1이 mount 전 dispatch한 EVT도 캐치됨.
    const [latestChat, setLatestChat] = useState<FilteredChatDetail | null>(() => latestFilteredChat);
    const barRef = useRef<HTMLDivElement>(null);
    const popRef = useRef<HTMLDivElement>(null);

    // chzzk 다크/라이트 테마 자동 감지 — anchor(aside-chatting) 조상 거슬러 올라가며
    // 첫 non-transparent 배경색 찾아 luminance로 판정. jump FAB과 같은 패턴.
    const [colors, setColors] = useState({
        barBg: 'rgba(255,255,255,0.06)',
        barHover: 'rgba(255,255,255,0.12)',
        barText: 'rgba(255,255,255,0.85)',
        popBg: '#2a2a30',
        popBorder: 'rgba(255,255,255,0.12)',
    });
    useEffect(() => {
        // 사용자 설정 floatingBgColor 우선 — 비어 있으면 자동 감지.
        browser.storage.local.get('floatingBgColor').then((r) => {
            const userBg = (r.floatingBgColor as string) || '';

            let detected: typeof colors | null = null;
            let el: HTMLElement | null = anchor;
            while (el) {
                const c = window.getComputedStyle(el).backgroundColor;
                const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
                if (m && c !== 'rgba(0, 0, 0, 0)') {
                    const rr = +m[1], gg = +m[2], bb = +m[3];
                    const lum = 0.299 * rr + 0.587 * gg + 0.114 * bb;
                    const dark = lum < 128;
                    detected = dark ? {
                        barBg: 'rgba(255,255,255,0.06)',
                        barHover: 'rgba(255,255,255,0.12)',
                        barText: 'rgba(255,255,255,0.85)',
                        popBg: '#2a2a30',
                        popBorder: 'rgba(255,255,255,0.12)',
                    } : {
                        barBg: 'rgba(0,0,0,0.05)',
                        barHover: 'rgba(0,0,0,0.1)',
                        barText: 'rgba(0,0,0,0.75)',
                        popBg: '#f0f0f4',
                        popBorder: 'rgba(0,0,0,0.12)',
                    };
                    break;
                }
                el = el.parentElement;
            }
            if (!detected) return;
            // 사용자 지정 색 있으면 popBg만 override (text/bar 톤은 자동 감지 결과 유지).
            setColors(userBg ? { ...detected, popBg: userBg } : detected);
        });
    }, [anchor]);

    // Module snapshot 구독. window listener는 module load 시점 이미 부착 →
    // buffer/persistence 어느 시점에 emit해도 module엔 항상 최신 반영.
    // fanout listener는 이 컴포넌트가 mount된 뒤에 붙으므로, 그 사이 emit된 값은
    // module엔 있어도 React state 초기값(null)엔 없음 → 부착 직후 catch-up.
    useEffect(() => {
        const listener = (detail: FilteredChatDetail | null) => {
            if (detail === null) {
                setLatestChat(null);
                setUnreadCount(0);
                return;
            }
            setLatestChat(detail);
            if (!open) setUnreadCount(n => n + 1);
        };
        latestListeners.add(listener);
        if (latestFilteredChat) setLatestChat(latestFilteredChat);
        return () => { latestListeners.delete(listener); };
    }, [open]);

    // 외부 클릭으로 닫기. setTimeout으로 같은 click 이벤트 사이클은 건너뜀.
    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            const t = e.target as Node;
            if (popRef.current?.contains(t)) return;
            if (barRef.current?.contains(t)) return;
            setOpen(false);
        };
        const id = window.setTimeout(() => document.addEventListener('mousedown', onDoc), 0);
        return () => {
            window.clearTimeout(id);
            document.removeEventListener('mousedown', onDoc);
        };
    }, [open]);

    const toggle = () => {
        setOpen(o => !o);
        setUnreadCount(0);
    };

    return (
        <div
            className="tbcv2-float"
            style={{
                '--tbcv2-bar-bg': colors.barBg, '--tbcv2-bar-text': colors.barText, '--tbcv2-bar-hover': colors.barHover,
                '--tbcv2-pop-bg': colors.popBg, '--tbcv2-pop-border': colors.popBorder,
            } as React.CSSProperties}
        >
            {/* Bar — in-flow. aside 자식이라 chzzk 콘텐츠가 자연스럽게 아래로 밀림.
                  색상은 chzzk 테마(다크/라이트) luminance로 자동 감지.
                  수집된 chat이 한 건도 없을 땐 bar 자체를 숨김 — chzzk 콘텐츠 영역을 32px
                  덜 가져감. 첫 수집 시점에 등장. */}
            <div ref={barRef} className="tbcv2-float-bar" onClick={toggle} style={{ display: latestChat ? 'flex' : 'none' }}>
                <img src={browser.runtime.getURL('/assets/icon.png')} alt="" />
                <div className="tbcv2-float-latest">
                    {latestChat && (
                        <>
                            <span className="tbcv2-float-nick">{latestChat.nickname}</span>
                            {latestChat.text || <span className="tbcv2-float-muted">{browser.i18n.getMessage('emoticonOnly' as any)}</span>}
                        </>
                    )}
                </div>
                {unreadCount > 0 && <span className="tbcv2-float-unread">{unreadCount > 99 ? '99+' : unreadCount}</span>}
            </div>

            {/* popover는 항상 mount 유지 — App 안의 useChatStream listener가 살아 있어야
                  팝오버 닫힌 동안에도 채팅 수집/필터 동작. open 토글은 시각적 display로만. */}
            <div ref={popRef} className="tbcv2-float-pop" style={{ height: POPOVER_HEIGHT, display: open ? 'flex' : 'none' }}>
                {/* 헤더 — 닫기 버튼만 (타이틀 텍스트 제거). */}
                <div className="tbcv2-float-head">
                    <button type="button" className="tbcv2-float-close" onClick={() => setOpen(false)} aria-label={browser.i18n.getMessage('close' as any)}>
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor" /></svg>
                    </button>
                </div>
                {/* App 본체 — Local 컨테이너가 chats 렌더. */}
                <div className="tbcv2-float-body">
                    <App type={type} adapter={adapter} />
                </div>
            </div>
        </div>
    );
}
