import { channelKey, type Platform } from '@/utils/channel-off';

/**
 * 방송 소리 컴프레서 — 설정의 '소리' 메뉴에서 활성화하면 모든 방송에 걸리고, 팝업 채널 카드의 스위치로 채널마다 끈다.
 * content-scripts/base/audio-compressor.ts(적용) · popup(채널 스위치) · AudioSetting(값, 미터)이 같이 쓴다.
 */
export const AUDIO_KEY = 'audioCompressor';
/** 팝업·설정 화면 → 방송 탭: 지금 상태와 누르는 양(dB). 컴프레서를 걸어야 하는 탭만 답한다. */
export const AUDIO_STATUS_MESSAGE = 'tbc-audio-status';
/** 탭 → background: 이 탭 아이콘에 ↻ 배지 */
export const AUDIO_BADGE_MESSAGE = 'tbc-audio-badge';

/**
 * 걸어야 하는데 걸지 못한 이유. 영상 하나는 소리 처리에 한 번만 이어진다 —
 * update: 업데이트 전 스크립트가 이어 두었다(새로고침하면 걸린다). other: 다른 확장이 먼저 이었다.
 */
export type AudioStatus = 'ok' | 'update' | 'other';
export interface AudioStatusReply { status: AudioStatus; reduction: number | null }

export interface AudioParams {
    threshold: number; // dB
    ratio: number;
    knee: number; // dB
    attack: number; // ms
    release: number; // ms
    makeup: number; // dB
}

export interface AudioConfig {
    /** 기능 활성화 — 꺼져 있으면 팝업에 스위치가 없고 어느 채널에도 걸지 않는다 */
    enabled: boolean;
    params: AudioParams;
    /** key: `${platform}:${channelId}` — 끈 채널 */
    off: Record<string, { name?: string; image?: string; at: number }>;
}

export const DEFAULT_PARAMS: AudioParams = { threshold: -30, ratio: 4, knee: 10, attack: 10, release: 250, makeup: 0 };

/** 슬라이더 범위. Web Audio가 받는 범위보다 좁게 — 방송 말소리에 쓸 만한 곳만 */
export const PARAM_RANGE: Record<keyof AudioParams, { min: number; max: number; step: number; unit: string }> = {
    threshold: { min: -60, max: 0, step: 1, unit: ' dB' },
    ratio: { min: 1, max: 20, step: 0.5, unit: ':1' },
    knee: { min: 0, max: 40, step: 1, unit: ' dB' },
    attack: { min: 0, max: 200, step: 1, unit: ' ms' },
    release: { min: 10, max: 1000, step: 10, unit: ' ms' },
    makeup: { min: 0, max: 12, step: 0.5, unit: ' dB' },
};

export async function getAudioConfig(): Promise<AudioConfig> {
    const v = (await browser.storage.local.get(AUDIO_KEY))[AUDIO_KEY] as Partial<AudioConfig> | undefined;
    return {
        enabled: !!v?.enabled,
        params: { ...DEFAULT_PARAMS, ...v?.params },
        off: v?.off && typeof v.off === 'object' ? v.off : {},
    };
}

export async function updateAudioConfig(fn: (c: AudioConfig) => AudioConfig) {
    await browser.storage.local.set({ [AUDIO_KEY]: fn(await getAudioConfig()) });
}

export function setAudioChannel(platform: Platform, id: string, on: boolean, name?: string, image?: string) {
    return updateAudioConfig(c => {
        const off = { ...c.off };
        const key = channelKey(platform, id);
        if (on) delete off[key];
        else off[key] = { name, image, at: Date.now() };
        return { ...c, off };
    });
}
