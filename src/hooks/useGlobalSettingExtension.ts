import { useEffect, useState } from "react";
import { initialState, settingsReducer } from "../reducer/setting";
import { SettingInterface, SettingReducerAction } from "@/interfaces/setting";

const SETTING_KEYS = [
    "position",
    "pointBoxAuto",
    "darkTheme",
    "chatTime",
    "maximumNumberChats",
    "advancedFilter",
    "platform",
    "collectedChatMarker",
    "jumpToBottomButton",
    "chatPersistence",
    "displayMode",
    "floatingBgColor",
    "chzzkChatSide",
    "chzzkProfileCopyId",
    "chzzkCustomTemplate",
    "anonymousStats",
] as const;

/**
 * 사용자의 globalSetting을 관리한다.
 *
 * Storage가 source of truth — 한 entrypoint(popup/setting/Container)에서
 * 변경하면 storage.onChanged를 통해 다른 entrypoint들의 state도 자동 갱신.
 *
 * 흐름:
 *   - 마운트: storage 1회 read → state 채움
 *   - dispatch: state 즉시 갱신 + storage.set (broadcast 역할)
 *   - listener: 외부 변경(다른 entrypoint의 dispatch)을 자기 state에 반영. 자기
 *     dispatch가 일으킨 echo는 비교 후 no-op이라 무한 루프 안 생김.
 */
export default function useExtensionGlobalSetting() {
    const [globalSetting, setGlobalSetting] = useState<SettingInterface>(initialState);

    const dispatchGlobalSetting = (action: SettingReducerAction) => {
        setGlobalSetting(prev => {
            const next = settingsReducer(prev, action);
            browser.storage.local.set(next);
            return next;
        });
    };

    useEffect(() => {
        // 마운트 시 1회 로드 (이 path는 storage write 안 함 — 자기 자신 echo 방지)
        browser.storage.local.get([...SETTING_KEYS]).then(res => {
            setGlobalSetting(prev => ({ ...prev, ...(res as Partial<SettingInterface>) }));
        });

        // 외부 변경 구독. 자기가 일으킨 변경도 같은 path로 들어오지만 prev와 비교해
        // 동일하면 같은 reference 반환 → React가 re-render 안 함.
        // 설정 키가 아닌 변경(모아보기 저장 chatHistory:* 등)은 setState를 아예 부르지 않는다. React는 바뀐 게 없어
        // 건너뛴 업데이트도 다음 렌더까지 대기열에 두는데, 이 컴포넌트는 거의 다시 그려지지 않아 대기열이 끝없이
        // 길어지고 업데이트마다 변경 내용(채팅 HTML 수백 KB)을 붙잡았다. 넓은 필터로 방송 여러 개를 띄우면 몇 분 만에 GB 단위.
        const listener = (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>) => {
            const updates: Partial<Record<string, unknown>> = {};
            let any = false;
            for (const key of SETTING_KEYS) {
                if (key in changes) { updates[key] = changes[key].newValue; any = true; }
            }
            if (!any) return;
            setGlobalSetting(prev => {
                let next = prev;
                for (const [key, value] of Object.entries(updates)) {
                    if ((prev as any)[key] !== value) {
                        if (next === prev) next = { ...prev };
                        (next as any)[key] = value;
                    }
                }
                return next;
            });
        };
        browser.storage.local.onChanged.addListener(listener);
        return () => browser.storage.local.onChanged.removeListener(listener);
    }, []);

    return { globalSetting, dispatchGlobalSetting };
}
