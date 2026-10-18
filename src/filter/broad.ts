import type { ChatInfo } from "@/interfaces/chat";
import type { CompositeFilterElement } from "@/interfaces/filter";
import { evaluateFilterGroup } from "./evaluate";

/**
 * 사실상 모든 채팅을 모으는 포함 필터인지 — 예: 조건이 전부 '아님'([포함] 채널 관리자(아님) = 관리자 빼고 전부),
 * 빈 키워드, 조건 없음. 대개 맞음/아님을 잘못 눌러서 생긴다.
 *
 * 판정은 실제와 같은 evaluateFilterGroup에 배지·이름·내용이 어떤 조건과도 겹치지 않는 채팅을 넣어 본다.
 * 그런 채팅까지 맞으면 거의 모든 채팅에 맞는다. 채널 범위는 보지 않는다(그 채널에선 똑같이 전부 모은다).
 */
const PROBE: ChatInfo = { badges: [], textContents: ['\u0000'], loginName: '\u0000', nickName: '\u0000' };

export function isBroadFilter(f: CompositeFilterElement): boolean {
    if (f.filterType !== 'include') return false;
    return evaluateFilterGroup(PROBE, [{ ...f, filterChannelId: undefined }]).pass;
}
