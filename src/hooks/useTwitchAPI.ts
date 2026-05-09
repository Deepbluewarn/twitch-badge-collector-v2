import { useMemo } from "react";
import { createTwitchAPI, TwitchAPI } from "@/api/twitch";

/** 후방 호환을 위한 별칭. 기존 Context는 이 이름으로 import 함. */
export type TwitchAPIHooks = TwitchAPI;

export default function useTwitchAPI(): TwitchAPI {
    return useMemo(() => createTwitchAPI(), []);
}
