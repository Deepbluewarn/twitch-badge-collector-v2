import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import IconButton from "@mui/material/IconButton";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
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

    // channelId를 React state로 관리 — SPA 채널 이동은 URL만 바꾸고 우리 트리를
    // remount 안 함. content-script가 tbc-channel-changed 발화 → 여기서 state
    // 갱신 → persistenceKey 변경 → useFilteredChatBuffer 재초기화 유도.
    const [channelId, setChannelId] = useState(adapter.getCurrentChannelId());
    useEffect(() => {
        const onNav = () => setChannelId(adapter.getCurrentChannelId());
        window.addEventListener('tbc-channel-changed', onNav);
        return () => window.removeEventListener('tbc-channel-changed', onNav);
    }, [adapter]);

    // 채팅 유지: Adapter가 지원하고 라이브 모드 + 사용자 설정 on일 때만. 채널 단위 scope.
    const persistenceKey = (
        adapter.supportsChatPersistence
        && channelId
        && adapter.getPageMode() === 'live'
        && globalSetting.chatPersistence !== 'off'
    )
        ? `chatHistory:${type}:${channelId}:live`
        : undefined;

    // 캡쳐 모드: 사용자가 채팅을 클릭으로 선택 → 한 번에 PNG 다운로드.
    const [captureMode, setCaptureMode] = useState(false);
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
    const [capturing, setCapturing] = useState(false);
    // shift+click 범위 선택용 anchor — 마지막 단일 클릭한 채팅 key. 캡쳐 모드 OFF 시 reset.
    const anchorKeyRef = useRef<string | null>(null);
    // 직전 shift+클릭으로 만든 range — 새 shift+클릭 시 이 범위만 재계산(축소/확장).
    // 단일 클릭으로 추가한 항목은 보존 (Explorer의 ctrl+click 보존 동작과 동일).
    const lastRangeKeysRef = useRef<Set<string>>(new Set());
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

    // marker 설정은 ref로 — useChatStream이 [] deps라 closure 동결되는 문제 회피.
    const markerEnabledRef = useRef(globalSetting.collectedChatMarker !== 'off');
    useEffect(() => {
        markerEnabledRef.current = globalSetting.collectedChatMarker !== 'off';
    }, [globalSetting.collectedChatMarker]);
    useChatStream(adapter, chat => {
        const r = checkFilter(chat, channelId);
        return {
            pass: r.pass,
            // marker 꺼져 있으면 undefined → highlight 스킵. 켜져 있고 그룹별 색 없으면
            // CSS 변수 미설정으로 기본 #FFC107 발동 → 빈 문자열로 신호.
            markerColor: !r.pass || !markerEnabledRef.current
                ? undefined
                : (r.markerColor ?? '#FFC107'),
        };
    }, guardedAddChat);

    // 캡쳐 모드 OFF로 전환되면 선택 + anchor + range 초기화.
    useEffect(() => {
        if (!captureMode) {
            anchorKeyRef.current = null;
            lastRangeKeysRef.current = new Set();
            if (selectedKeys.size > 0) setSelectedKeys(new Set());
        }
    }, [captureMode]);

    // popup → content script 메시지: 캡쳐 시작 / 저장된 채팅 초기화.
    // FAB 제거하면서 외부 트리거 path 필요 (popup에서 sendMessage).
    useEffect(() => {
        const listener = (msg: any) => {
            if (msg?.type === 'tbc-start-capture') {
                setCaptureMode(true);
                return Promise.resolve({ ok: true });
            }
            if (msg?.type === 'tbc-clear-chats') {
                clear();
                return Promise.resolve({ ok: true });
            }
        };
        browser.runtime.onMessage.addListener(listener);
        return () => browser.runtime.onMessage.removeListener(listener);
    }, [clear]);

    // 1분 inactivity 시 capture 모드 자동 해제.
    // 활동 = 채팅 선택 변경 (selectedKeys ref 변화). 진입 직후에도 1분 카운트 시작.
    // 자동 해제와 동시에 useFilteredChatBuffer가 누적된 초과분을 trim하므로 메모리 누수 없음.
    useEffect(() => {
        if (!captureMode) return;
        const timer = window.setTimeout(() => {
            setCaptureMode(false);
        }, 60_000);
        return () => window.clearTimeout(timer);
    }, [captureMode, selectedKeys]);

    // 채팅 클릭 → 선택 토글. 캡쳐 모드일 때만 활성, 그 외엔 host page link 동작 보존.
    // shift+클릭: anchor부터 현재까지 범위 add-select (해제 X). anchor 없으면 단일 클릭으로 처리.
    const onChatClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!captureMode) return;
        const target = e.target as HTMLElement;
        const node = target.closest(`[${CHAT_ATTR.KEY}]`) as HTMLElement | null;
        if (!node) return;
        const key = node.getAttribute(CHAT_ATTR.KEY);
        if (!key) return;
        e.preventDefault();
        e.stopPropagation();

        if (e.shiftKey && anchorKeyRef.current && anchorKeyRef.current !== key) {
            const allKeys = savedChats.map(c => c.key);
            const anchorIdx = allKeys.indexOf(anchorKeyRef.current);
            const currentIdx = allKeys.indexOf(key);
            if (anchorIdx === -1 || currentIdx === -1) {
                // anchor가 트림돼 사라진 경우 단일 클릭으로 fallback.
                anchorKeyRef.current = key;
                lastRangeKeysRef.current = new Set();
                setSelectedKeys(prev => {
                    const next = new Set(prev);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                });
                return;
            }
            const [from, to] = anchorIdx < currentIdx ? [anchorIdx, currentIdx] : [currentIdx, anchorIdx];
            const newRange = new Set(allKeys.slice(from, to + 1));
            const prevRange = lastRangeKeysRef.current;
            setSelectedKeys(prev => {
                const next = new Set(prev);
                // 이전 range 중 새 range에 없는 것 제거 (축소 처리)
                prevRange.forEach(k => { if (!newRange.has(k)) next.delete(k); });
                // 새 range 추가
                newRange.forEach(k => next.add(k));
                return next;
            });
            lastRangeKeysRef.current = newRange;
            // anchor는 갱신 X — 범위 재계산 반복 가능.
            return;
        }

        anchorKeyRef.current = key;
        lastRangeKeysRef.current = new Set();
        setSelectedKeys(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }, [captureMode, savedChats]);

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
            // host(chzzk)는 라이트/다크 테마 따라 배경색이 바뀜. 컨테이너 또는 조상
            // element의 첫 non-transparent bg를 캡쳐 배경으로 사용. 하드코딩된 dark
            // fallback은 라이트 테마에서 어색.
            let bgEl: HTMLElement | null = visibleContainer;
            let bg = '';
            while (bgEl) {
                const c = window.getComputedStyle(bgEl).backgroundColor;
                if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') {
                    bg = c;
                    break;
                }
                bgEl = bgEl.parentElement;
            }
            await captureChats({
                container: visibleContainer,
                selectedKeys,
                keyAttr: CHAT_ATTR.KEY,
                filename: `tbcv2-chats-${type}-${Date.now()}.png`,
                backgroundColor: bg || undefined,
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
     * 자동 스크롤 — Sentinel + IntersectionObserver + ResizeObserver 패턴.
     *
     * 동작:
     *  1. 채팅 visual 바닥에 invisible sentinel <div>를 둠
     *     - newest-top(chzzk, column-reverse): sentinel을 chats 앞에 → DOM 첫 자식 = 시각 바닥
     *     - newest-bottom(twitch, normal column): sentinel을 chats 뒤에 → DOM 마지막 자식 = 시각 바닥
     *  2. IntersectionObserver: sentinel 보이면 followingRef=true (사용자가 바닥 근처 보고 있음)
     *  3. ResizeObserver: 채팅 영역 크기 변할 때마다 (chat 추가 + 이미지 늦게 로드 둘 다 catch)
     *     followingRef true면 sentinel을 scrollIntoView로 다시 바닥에 고정
     *
     * 이미지 lazy load + React commit/paint timing race 모두 한번에 해결.
     */
    const sentinelRef = useRef<HTMLDivElement>(null);
    const followingRef = useRef(true);
    const [showJumpToBottom, setShowJumpToBottom] = useState(false);
    const [hovered, setHovered] = useState(false);
    // chzzk 라이트/다크 테마 자동 대응 — container 배경색 읽어 FAB 색 계산.
    // hover 시점에 한 번 읽으면 충분 (테마 자주 안 바뀜).
    const [jumpFabColors, setJumpFabColors] = useState({ bg: 'rgba(127,127,127,0.25)', fg: 'rgba(255,255,255,0.7)' });
    useEffect(() => {
        if (!hovered) return;
        let el: HTMLElement | null = containerRef.current;
        while (el) {
            const c = window.getComputedStyle(el).backgroundColor;
            const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            if (m && c !== 'rgba(0, 0, 0, 0)') {
                const r = +m[1], g = +m[2], b = +m[3];
                const lum = 0.299 * r + 0.587 * g + 0.114 * b; // perceived brightness
                const dark = lum < 128;
                // 다크 배경: 약간 밝게 (흰색 alpha 8%), 라이트 배경: 약간 어둡게 (검정 alpha 8%).
                setJumpFabColors({
                    bg: dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
                    fg: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)',
                });
                break;
            }
            el = el.parentElement;
        }
    }, [hovered]);

    const updateFollowingFromScroll = useCallback((scrollEl: HTMLElement) => {
        // 스크롤 위치 기반 fallback. column-reverse(chzzk)는 scrollTop이 음수/0 근처가 바닥이라
        // Math.abs로 처리. tolerance 5px.
        const distFromBottom = adapter.chatOrder === 'newest-top'
            ? Math.abs(scrollEl.scrollTop)  // column-reverse: 0이 바닥
            : scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
        const atBottom = distFromBottom <= 5;
        followingRef.current = atBottom;
        setShowJumpToBottom(!atBottom);
    }, [adapter.chatOrder]);

    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;
        const cloneEl = containerRef.current?.querySelector<HTMLElement>(`#tbc-clone__${type}ui`);
        if (!cloneEl) return;

        // 1차: IntersectionObserver — sentinel 가시성으로 follow 판정.
        const io = new IntersectionObserver(([entry]) => {
            followingRef.current = entry.isIntersecting;
            setShowJumpToBottom(!entry.isIntersecting);
        }, { root: cloneEl, threshold: 0 });
        io.observe(sentinel);

        // 2차 fallback: scroll listener — IO가 0px sentinel 등 edge case에서 못 잡을 때 보강.
        const onScroll = () => updateFollowingFromScroll(cloneEl);
        cloneEl.addEventListener('scroll', onScroll, { passive: true });

        // 채팅 영역 크기 변화 (chat 추가 / 이미지·폰트 늦은 로드 등) 감지.
        // 사용자가 바닥에 있었으면 다시 바닥으로 끌어당김.
        const ro = new ResizeObserver(() => {
            if (followingRef.current) {
                sentinel.scrollIntoView({ block: 'end', behavior: 'instant' as ScrollBehavior });
            }
        });
        ro.observe(cloneEl);

        return () => {
            io.disconnect();
            ro.disconnect();
            cloneEl.removeEventListener('scroll', onScroll);
        };
    }, [type, updateFollowingFromScroll]);

    const jumpToBottom = useCallback(() => {
        sentinelRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
    }, []);

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

    const allSelected = savedChats.length > 0 && selectedKeys.size === savedChats.length;

    return (
        <Wrapper
            ref={containerRef}
            className={globalSetting.chatTime === 'on' ? 'tbcv2_chatTime_on' : 'tbcv2_chatTime_off'}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            sx={{ position: 'relative' }}
        >
            <style>{`
                .tbcv2-capture-mode { cursor: pointer; user-select: none; -webkit-user-select: none; }
                .tbcv2-capture-mode:hover { outline: 1px dashed rgba(255,193,7,0.6); outline-offset: -1px; }
                .tbcv2-capture-selected { background-color: rgba(255,193,7,0.18) !important; outline: 2px solid #FFC107; outline-offset: -2px; }
            `}</style>

            <div
                id={`tbc-clone__${type}ui`}
                onClick={onChatClick}
                style={{
                    marginTop: 0,
                    paddingTop: 0,
                    // capture 모드의 하단 액션 바(약 52px)에 가려지지 않도록 채팅 영역 height 축소.
                    // ResizeObserver가 변화를 감지해서 sentinel을 다시 시각 바닥으로 snap.
                    height: captureMode ? 'calc(100% - 52px)' : '100%',
                }}
            >
                {/* sentinel 위치는 시각 바닥에 가도록 chatOrder 따라 결정.
                    chzzk(newest-top + column-reverse): DOM 첫 자식이 시각 바닥 → sentinel 먼저.
                    twitch(newest-bottom + normal column): DOM 마지막 자식이 시각 바닥 → sentinel 나중.
                    explicit 1px 높이 — 0px면 일부 브라우저에서 IntersectionObserver가 잘못 판정. */}
                {adapter.chatOrder === 'newest-top' && (
                    <div ref={sentinelRef} aria-hidden="true" style={{ height: 1, flexShrink: 0 }} />
                )}
                {chats}
                {adapter.chatOrder !== 'newest-top' && (
                    <div ref={sentinelRef} aria-hidden="true" style={{ height: 1, flexShrink: 0 }} />
                )}
            </div>

            {/* "맨 아래로" FAB — 위로 스크롤한 상태 + hover일 때만 표시.
                hover 없이 항상 떠 있던 게 거슬린다는 피드백. 스크롤 자체가 hover 동반이므로
                discoverability 손실 없음. */}
            {showJumpToBottom && globalSetting.jumpToBottomButton !== 'off' && (
                <IconButton
                    onClick={jumpToBottom}
                    aria-label="맨 아래로"
                    sx={{
                        position: 'absolute',
                        bottom: captureMode ? 64 : 12,
                        right: 12,
                        zIndex: 11,
                        width: 28,
                        height: 28,
                        bgcolor: jumpFabColors.bg,
                        color: jumpFabColors.fg,
                        opacity: hovered ? 1 : 0,
                        pointerEvents: hovered ? 'auto' : 'none',
                        transition: 'opacity 0.15s ease, background-color 0.15s ease',
                        backdropFilter: 'blur(4px)',
                        '&:hover': { bgcolor: jumpFabColors.bg, filter: 'brightness(1.3)' },
                        '& .MuiSvgIcon-root': { fontSize: 18 },
                    }}
                >
                    <KeyboardArrowDownIcon />
                </IconButton>
            )}

            {/* 캡쳐 진입은 popup 버튼 → runtime.sendMessage('tbc-start-capture')로 트리거.
                FAB는 작은 화면에서 채팅 가린다는 피드백으로 제거. */}

            {/* 캡쳐 모드 — 하단 full-width 액션 바. 채팅 layout 보존 (overlay). */}
            {captureMode && (
                <Box
                    sx={{
                        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10,
                        bgcolor: 'rgba(20,20,22,0.95)',
                        backdropFilter: 'blur(6px)',
                        borderTop: '1px solid rgba(255,255,255,0.1)',
                        p: 1, display: 'flex', gap: 1, alignItems: 'center',
                    }}
                >
                    <ToolbarButton onClick={() => setCaptureMode(false)} disabled={capturing}>취소</ToolbarButton>
                    <ToolbarButton onClick={onSelectAllClick} disabled={capturing || savedChats.length === 0}>
                        {allSelected ? '전체 해제' : '전체 선택'}
                    </ToolbarButton>
                    <Typography variant="caption" sx={{ flex: 1, textAlign: 'center', color: 'rgba(255,255,255,0.7)' }}>
                        {selectedKeys.size}개 선택됨
                    </Typography>
                    <ToolbarButton
                        onClick={onCaptureClick}
                        disabled={selectedKeys.size === 0 || capturing}
                        sx={{ bgcolor: 'rgba(124,138,239,0.6)', borderColor: 'rgba(124,138,239,0.8)', '&:hover': { bgcolor: 'rgba(124,138,239,0.8)' } }}
                    >
                        {capturing ? '캡쳐 중...' : 'PNG 다운로드'}
                    </ToolbarButton>
                </Box>
            )}
        </Wrapper>
    );
}

const ToolbarButton = styled('button')({
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.2)',
    color: 'white',
    padding: '4px 10px',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 12,
    '&:hover': { background: 'rgba(255,255,255,0.08)' },
    '&:disabled': { opacity: 0.5, cursor: 'default' },
});
