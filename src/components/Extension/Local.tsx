import { useEffect, useRef } from "react";
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

    const { chats, addChat, clear } = useFilteredChatBuffer(adapter, maxNumChats, persistenceKey);

    useChatStream(adapter, chat => checkFilter(chat, channelId), addChat);

    const getScrollArea = () =>
        containerRef.current?.querySelector(`#tbc-clone__${type}ui`) ?? null;

    // 스크롤 추적: 사용자가 바닥에 있으면 새 채팅 도착 시 자동으로 따라 내려감.
    const isAtBottomRef = useRef(true);
    useEffect(() => {
        const scrollArea = getScrollArea();
        if (!scrollArea) return;

        const onScroll = () => { isAtBottomRef.current = scrollArea.scrollTop >= 0; };
        scrollArea.addEventListener("scroll", onScroll, false);
        return () => scrollArea.removeEventListener("scroll", onScroll);
    }, []);

    useEffect(() => {
        const scrollArea = getScrollArea();
        if (!scrollArea) return;
        if (isAtBottomRef.current) scrollArea.scrollTop = scrollArea.scrollHeight;
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

    return (
        <Wrapper ref={containerRef} className={globalSetting.chatTime === 'on' ? 'tbcv2_chatTime_on' : 'tbcv2_chatTime_off'}>
            <div
                id={`tbc-clone__${type}ui`}
                style={{
                    marginTop: 0,
                    paddingTop: 0,
                    height: '100%'
                }}
            >
                {chats}
            </div>
        </Wrapper>
    );
}
