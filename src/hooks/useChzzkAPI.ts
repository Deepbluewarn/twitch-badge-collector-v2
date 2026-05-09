import { useMemo } from "react";
import { createChzzkAPI, ChzzkAPI } from "@/api/chzzk";

/** 후방 호환을 위한 별칭. 기존 Context는 이 이름으로 import 함. */
export type ChzzkAPIHooks = ChzzkAPI;

export default function useChzzkAPI(): ChzzkAPI {
    return useMemo(() => createChzzkAPI(), []);
}
