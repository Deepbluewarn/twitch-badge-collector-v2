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
        const listener = (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>) => {
            setGlobalSetting(prev => {
                let next = prev;
                for (const [key, change] of Object.entries(changes)) {
                    if (key in prev && (prev as any)[key] !== change.newValue) {
                        if (next === prev) next = { ...prev };
                        (next as any)[key] = change.newValue;
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
