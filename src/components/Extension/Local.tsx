import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGlobalSettingContext } from "@/context/GlobalSetting";
import useFilterGroup from "@/hooks/useFilterGroup";
import useChatStream from "@/hooks/useChatStream";
import useFilteredChatBuffer from "@/hooks/useFilteredChatBuffer";
import { findElement } from "@/utils/utils-common";
import { styled } from "@mui/material/styles";
import { addStorageUpdateListener } from "@/utils/utils-browser";
import { SettingInterface } from "@/interfaces/setting";
import { PlatformAdapter } from "@/platform";
import { Logger } from "@/utils/logger";
import { captureChats } from "@/utils/captureChat";
import { CHAT_ATTR } from "@/interfaces/chat-attributes";

const Wrapper = styled('div')({
    height: '100%',
})

// Container 안의 채팅 흐름:
//   useChatStream         — host page DOM 감시 + Adapter extract + filter + clone prep
//   useFilteredChatBuffer — 통과한 채팅을 정렬·트림된 JSX 배열로 보유
//   Local 본체            — 두 hook 조립 + 자동 스크롤 + chatTime CSS 토글 + VOD seek 클리어
export default function Local({
    type, videoSelector, adapter,
}: {
    type: SettingInterface['platform'],
    videoSelector?: string,
    adapter: PlatformAdapter,
}) {
    const { globalSetting } = useGlobalSettingContext();
    const { checkFilter } = useFilterGroup(type, true);
    const containerRef = useRef<HTMLDivElement>(null);
    const currentTimeRef = useRef<number>(0);
    const maxNumChats = globalSetting.maximumNumberChats
        ?? (import.meta.env.VITE_MAXNUMCHATS_DEFAULT as unknown as number);

    const channelId = adapter.getCurrentChannelId();

    // 채팅 유지: Adapter가 지원하고 라이브 모드인 경우만. 채널 단위 scope.
    const persistenceKey = (
        adapter.supportsChatPersistence
        && channelId
        && adapter.getPageMode() === 'live'
    )
        ? `chatHistory:${type}:${channelId}:live`
        : undefined;

    // 캡쳐 모드: 사용자가 채팅을 클릭으로 선택 → 한 번에 PNG 다운로드.
    const [captureMode, setCaptureMode] = useState(false);
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
    const [capturing, setCapturing] = useState(false);
    const captureView = useMemo(() => ({ captureMode, selectedKeys }), [captureMode, selectedKeys]);

    const { chats, addChat, clear, savedChats } = useFilteredChatBuffer(
        adapter, maxNumChats, persistenceKey, captureView,
    );

    // savedChats 트림으로 사라진 키를 selectedKeys에서 제거 — 카운트가 실제 선택된
    // 가시 채팅 수와 일치하도록.
    useEffect(() => {
        if (selectedKeys.size === 0) return;
        const aliveKeys = new Set(savedChats.map(c => c.key));
        let changed = false;
        const next = new Set<string>();
        selectedKeys.forEach(k => {
            if (aliveKeys.has(k)) next.add(k);
            else changed = true;
        });
        if (changed) setSelectedKeys(next);
    }, [savedChats]);

    // 캡쳐 중엔 새 채팅 추가를 pause. 이유: 새 채팅 → savedChats 변경 → React 재렌더 →
    // inlineImages가 setattr한 img.src(data URL)이 새 DOM으로 교체되며 사라짐 →
    // html-to-image가 clone 시점에 원본 URL을 보고 페이지 컨텍스트에서 fetch 시도 → CORS.
    const capturingRef = useRef(false);
    const guardedAddChat = useCallback((chat: Parameters<typeof addChat>[0]) => {
        if (capturingRef.current) return;
        addChat(chat);
    }, [addChat]);

    useChatStream(adapter, chat => checkFilter(chat, channelId), guardedAddChat);

    // 캡쳐 모드 OFF로 전환되면 선택 초기화.
    useEffect(() => {
        if (!captureMode && selectedKeys.size > 0) setSelectedKeys(new Set());
    }, [captureMode]);

    // 채팅 클릭 → 선택 토글. 캡쳐 모드일 때만 활성, 그 외엔 host page link 동작 보존.
    const onChatClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!captureMode) return;
        const target = e.target as HTMLElement;
        const node = target.closest(`[${CHAT_ATTR.KEY}]`) as HTMLElement | null;
        if (!node) return;
        const key = node.getAttribute(CHAT_ATTR.KEY);
        if (!key) return;
        e.preventDefault();
        e.stopPropagation();
        setSelectedKeys(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }, [captureMode]);

    const onSelectAllClick = useCallback(() => {
        const allKeys = savedChats.map(c => c.key);
        const allSelected = allKeys.length > 0 && allKeys.every(k => selectedKeys.has(k));
        setSelectedKeys(allSelected ? new Set() : new Set(allKeys));
    }, [savedChats, selectedKeys]);

    const onCaptureClick = useCallback(async () => {
        if (selectedKeys.size === 0 || capturing) return;
        const visibleContainer = containerRef.current?.querySelector<HTMLDivElement>(
            `#tbc-clone__${type}ui`
        );
        if (!visibleContainer) return;

        setCapturing(true);
        capturingRef.current = true;
        try {
            await captureChats({
                container: visibleContainer,
                selectedKeys,
                keyAttr: CHAT_ATTR.KEY,
                filename: `tbcv2-chats-${type}-${Date.now()}.png`,
            });
            setCaptureMode(false);
        } catch (err) {
            Logger('Local', `capture failed: ${err}`);
        } finally {
            capturingRef.current = false;
            setCapturing(false);
        }
    }, [selectedKeys, capturing, type]);

    /**
     * 실제로 overflow:auto/scroll이 걸린 가장 가까운 조상.
     * `#tbc-clone__${type}ui`가 시작점이지만 그 자체가 스크롤되지 않을 수 있어
     * 부모 사슬을 타고 올라가며 스크롤 가능 요소를 찾는다.
     */
    const findScrollableAncestor = (start: Element | null): HTMLElement | null => {
        let el = start as HTMLElement | null;
        while (el) {
            const overflowY = window.getComputedStyle(el).overflowY;
            if (overflowY === 'auto' || overflowY === 'scroll') return el;
            el = el.parentElement;
        }
        return null;
    };

    const getScrollArea = (): HTMLElement | null => {
        const start = containerRef.current?.querySelector(`#tbc-clone__${type}ui`) ?? containerRef.current;
        return findScrollableAncestor(start);
    };

    // 스크롤 추적: 사용자가 "따라가는 위치(visual 바닥)"에서 벗어나면 자동 스크롤
    // 멈춤. Chzzk는 CSS의 flex-direction: column-reverse 덕분에 chats[0](newest)가
    // visual 바닥에 렌더됨 → scrollHeight가 두 platform 모두에서 newest 위치.
    const SCROLL_FOLLOW_TOLERANCE = 5;
    const isAtFollowPositionRef = useRef(true);

    useEffect(() => {
        const scrollArea = getScrollArea();
        if (!scrollArea) return;

        const onScroll = () => {
            const distFromBottom =
                scrollArea.scrollHeight - scrollArea.scrollTop - scrollArea.clientHeight;
            isAtFollowPositionRef.current = distFromBottom <= SCROLL_FOLLOW_TOLERANCE;
        };
        scrollArea.addEventListener("scroll", onScroll, false);
        return () => scrollArea.removeEventListener("scroll", onScroll);
    }, []);

    useEffect(() => {
        const scrollArea = getScrollArea();
        if (!scrollArea) return;
        if (!isAtFollowPositionRef.current) return;
        scrollArea.scrollTop = scrollArea.scrollHeight;
    }, [chats]);

    // chatTime 설정 토글 시 CSS 클래스 swap (rerender 없이 직접 DOM mutate).
    useEffect(() => {
        addStorageUpdateListener((key, newValue) => {
            if (key !== 'chatTime' || !containerRef.current) return;
            if (newValue === 'on') {
                containerRef.current.classList.remove('tbcv2_chatTime_off');
                containerRef.current.classList.add('tbcv2_chatTime_on');
            } else if (newValue === 'off') {
                containerRef.current.classList.remove('tbcv2_chatTime_on');
                containerRef.current.classList.add('tbcv2_chatTime_off');
            }
        });
    }, []);

    // VOD seek 시 누적 채팅 비움 (뒤로 감기면 미래 채팅을 표시하면 안 됨).
    useEffect(() => {
        if (!videoSelector) return;
        findElement(videoSelector, (elem) => {
            if (!elem) return;
            elem.addEventListener('seeked', e => {
                const time = (e.target as HTMLMediaElement).currentTime;
                if (currentTimeRef.current - time > 0) {
                    clear();
                    Logger('Local', 'All clone chats removed');
                }
                currentTimeRef.current = time;
            });
        });
    }, []);

    // 캡쳐 toolbar 표시 정책: 평소엔 숨김(컨테이너 영역 0 점유), Wrapper hover 시
    // 또는 캡쳐 모드 ON일 때만 표시. 표시 시엔 채팅 영역 위로 overlay (absolute) →
    // 채팅 layout은 그대로 유지, 일시적으로 위쪽 일부 가려질 뿐.
    const toolbarVisible = captureMode;

    return (
        <Wrapper ref={containerRef} className={globalSetting.chatTime === 'on' ? 'tbcv2_chatTime_on' : 'tbcv2_chatTime_off'}>
            {/* 복원 채팅 시각 구분 — useFilteredChatBuffer가 복원 채팅 root에 tbcv2-restored-chat 클래스를 부여 */}
            <style>{`
                .tbcv2-restored-chat { background-color: rgba(128, 128, 128, 0.15); }
                .tbcv2-capture-mode { cursor: pointer; }
                .tbcv2-capture-mode:hover { outline: 1px dashed rgba(255,193,7,0.6); outline-offset: -1px; }
                .tbcv2-capture-selected { background-color: rgba(255,193,7,0.18) !important; outline: 2px solid #FFC107; outline-offset: -2px; }
                .tbcv2-capture-toolbar-host { position: relative; height: 100%; }
                .tbcv2-capture-toolbar-host > .tbcv2-capture-toolbar {
                    position: absolute; top: 0; left: 0; right: 0;
                    opacity: 0; pointer-events: none;
                    transition: opacity 0.15s ease;
                    z-index: 10;
                    background: rgba(20, 20, 22, 0.92);
                    backdrop-filter: blur(4px);
                }
                .tbcv2-capture-toolbar-host:hover > .tbcv2-capture-toolbar,
                .tbcv2-capture-toolbar-host > .tbcv2-capture-toolbar.tbcv2-visible {
                    opacity: 1; pointer-events: auto;
                }
            `}</style>
            <div className="tbcv2-capture-toolbar-host">
                <CaptureToolbar
                    captureMode={captureMode}
                    onToggle={() => setCaptureMode(v => !v)}
                    selectedCount={selectedKeys.size}
                    totalCount={savedChats.length}
                    onSelectAll={onSelectAllClick}
                    onCapture={onCaptureClick}
                    capturing={capturing}
                    forceVisible={toolbarVisible}
                />
                <div
                    id={`tbc-clone__${type}ui`}
                    onClick={onChatClick}
                    style={{
                        marginTop: 0,
                        paddingTop: 0,
                        height: '100%',
                    }}
                >
                    {chats}
                </div>
            </div>
        </Wrapper>
    );
}

const Toolbar = styled('div')({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '4px 8px',
    height: 36,
    boxSizing: 'border-box',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
    fontSize: 12,
});

const ToolbarButton = styled('button')({
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.2)',
    color: 'inherit',
    padding: '2px 8px',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 12,
    '&:hover': { background: 'rgba(255,255,255,0.08)' },
    '&:disabled': { opacity: 0.5, cursor: 'default' },
});

function CaptureToolbar({
    captureMode, onToggle, selectedCount, totalCount, onSelectAll, onCapture, capturing, forceVisible,
}: {
    captureMode: boolean;
    onToggle: () => void;
    selectedCount: number;
    totalCount: number;
    onSelectAll: () => void;
    onCapture: () => void;
    capturing: boolean;
    forceVisible: boolean;
}) {
    const allSelected = totalCount > 0 && selectedCount === totalCount;
    return (
        <Toolbar className={`tbcv2-capture-toolbar${forceVisible ? ' tbcv2-visible' : ''}`}>
            <ToolbarButton onClick={onToggle} disabled={capturing}>
                {captureMode ? '캡쳐 취소' : '캡쳐'}
            </ToolbarButton>
            {captureMode && (
                <>
                    <ToolbarButton onClick={onSelectAll} disabled={capturing || totalCount === 0}>
                        {allSelected ? '전체 해제' : '전체 선택'}
                    </ToolbarButton>
                    <span>{selectedCount}개 선택됨</span>
                    <ToolbarButton
                        onClick={onCapture}
                        disabled={selectedCount === 0 || capturing}
                        style={{ marginLeft: 'auto' }}
                    >
                        {capturing ? '캡쳐 중...' : 'PNG 다운로드'}
                    </ToolbarButton>
                </>
            )}
        </Toolbar>
    );
}
