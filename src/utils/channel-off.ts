/**
 * 채널별로 확장 끄기 — 팝업의 "이 채널에서 사용" 스위치. 꺼진 채널에선 모아보기 창·원본 채팅 수집 표시·
 * 화면 조정(채팅창 좌우)·포인트 자동 받기를 하지 않는다. 라이브 페이지의 채널 ID 기준.
 * content-scripts/base/channel-off.ts(적용) · popup(스위치) · background(아이콘 흑백)가 같이 쓴다.
 */
export const CHANNEL_OFF_KEY = 'disabledChannels';
/** popup → 탭: 지금 채널 정보 */
export const CHANNEL_INFO_MESSAGE = 'tbc-channel-info';
/** 탭 → background: 이 탭 아이콘을 흑백으로 */
export const CHANNEL_OFF_BADGE_MESSAGE = 'tbc-channel-off-badge';

export type Platform = 'twitch' | 'chzzk';
/** key: `${platform}:${channelId}`. name·image는 꺼진 채널 목록(팝업 일반 설정)에 쓴다. */
export type OffChannels = Record<string, { name?: string; image?: string; at: number }>;
export interface ChannelInfo { platform: Platform; channelId: string | null; off: boolean }

export const channelKey = (platform: Platform, id: string) => `${platform}:${id}`;
export function parseChannelKey(key: string): { platform: Platform; id: string } {
    const i = key.indexOf(':');
    return { platform: key.slice(0, i) as Platform, id: key.slice(i + 1) };
}

export async function getOffChannels(): Promise<OffChannels> {
    const r = await browser.storage.local.get(CHANNEL_OFF_KEY);
    const v = r[CHANNEL_OFF_KEY];
    return v && typeof v === 'object' ? v as OffChannels : {};
}

export async function setChannelOff(platform: Platform, id: string, off: boolean, name?: string, image?: string) {
    const map = { ...await getOffChannels() };
    const key = channelKey(platform, id);
    if (off) map[key] = { name, image, at: Date.now() };
    else delete map[key];
    await browser.storage.local.set({ [CHANNEL_OFF_KEY]: map });
}
