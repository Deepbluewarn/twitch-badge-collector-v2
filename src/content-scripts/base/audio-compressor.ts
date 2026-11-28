/**
 * 방송 소리에 컴프레서를 건다 (src/utils/audio-compressor.ts). 맨 위 창의 방송 영상 하나만.
 *
 * 영상 → MediaElementSource → Gain(음량 되돌림) → Compressor → Gain(makeup × 음량) → 출력.
 * - 브라우저는 플레이어 음량을 MediaElementSource 앞에서 곱한다. 그대로 두면 음량을 줄일수록 Threshold가
 *   올라간 것과 같아진다. 컴프레서 앞에서 음량을 나누고 뒤에서 다시 곱해, 음량과 상관없이 같은 소리를 누른다.
 * - video 하나는 MediaElementSource에 평생 한 번만 붙는다. 붙은 뒤로는 소리가 반드시 이 그래프를 지난다.
 *   그래서 켤 때까지 붙이지 않고, 끌 때는 떼지 않고 source → 출력으로 바로 잇는다(우회).
 * - AudioContext가 사용자 동작 전이라 멈춰(suspended) 있으면 붙이지 않는다 — 붙이면 영상이 무음이 된다.
 *   첫 클릭·키 입력 때 다시 시도한다.
 * - 확장과 끊기면 우회로 돌려 두고 video에 넘겨줌 표시(HANDOFF_ATTR)를 남긴다. 새 스크립트는 같은 video에
 *   다시 붙지 못해(InvalidStateError) 영상이 바뀔 때(채널 이동, 새로고침)까지 소리를 건드리지 않는다.
 *   붙지 못했을 때 표시가 있으면 업데이트 탓(아이콘 ↻ 배지, 팝업 안내), 없으면 다른 확장이 먼저 붙인 것.
 */
import type { PlatformAdapter } from '@/platform';
import { addStorageUpdateListener } from '@/utils/utils-browser';
import { channelKey } from '@/utils/channel-off';
import { getPlatformConfig } from '@/platform/host-selectors';
import { AUDIO_BADGE_MESSAGE, AUDIO_KEY, AUDIO_STATUS_MESSAGE, getAudioConfig, type AudioParams, type AudioStatus, type AudioStatusReply } from '@/utils/audio-compressor';
import { onTeardown } from './lifecycle';

const POLL_MS = 2000;
/** 값을 바꿀 때 툭 튀지 않게 이 시간 상수로 옮겨 간다(초) */
const RAMP = 0.03;
/** 옛 스크립트가 물러나며 붙여 두는 video 속성 — DOM이라 새 스크립트도 본다 */
const HANDOFF_ATTR = 'data-tbc-audio-handoff';

export function setupAudioCompressor(adapter: PlatformAdapter, isChannelOff: () => boolean) {
    if (window !== window.top) return { evaluate: async () => {} };

    let ctx: AudioContext | null = null;
    let comp: DynamicsCompressorNode | null = null;
    let gain: GainNode | null = null;
    let pre: GainNode | null = null;
    let source: MediaElementAudioSourceNode | null = null;
    let video: HTMLVideoElement | null = null;
    /** 붙이지 못한 video와 그 이유 — 다시 시도하지 않는다 */
    const refused = new WeakMap<HTMLVideoElement, AudioStatus>();
    let status: AudioStatus = 'ok';
    let active = false;
    let params: AudioParams | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    /** 지금 source가 컴프레서로 이어져 있나 — 같은 연결을 다시 하면 소리가 한 번 끊긴다 */
    let routed = false;

    function setParams(p: AudioParams) {
        if (!ctx || !comp || !gain || !pre) return;
        const t = ctx.currentTime;
        // 음량 0이면 소리가 없으니 나눌 것도 없다 — 0으로 나누지 않게만
        const volume = Math.max(video?.volume ?? 1, 0.01);
        pre.gain.setTargetAtTime(1 / volume, t, RAMP);
        comp.threshold.setTargetAtTime(p.threshold, t, RAMP);
        comp.ratio.setTargetAtTime(p.ratio, t, RAMP);
        comp.knee.setTargetAtTime(p.knee, t, RAMP);
        comp.attack.setTargetAtTime(p.attack / 1000, t, RAMP);
        comp.release.setTargetAtTime(p.release / 1000, t, RAMP);
        gain.gain.setTargetAtTime(10 ** (p.makeup / 20) * volume, t, RAMP);
    }

    function route(on: boolean) {
        if (!ctx || !source || !comp || on === routed) return;
        source.disconnect();
        source.connect(on ? pre! : ctx.destination);
        routed = on;
    }

    const onVolume = () => { if (params) setParams(params); };

    /** 지금 video에 그래프를 붙인다. 붙어 있거나 새로 붙였으면 true */
    async function attach(): Promise<boolean> {
        // 치지직은 방송 앞 광고가 다른 video로 돈다 — 방송 영상 선택자로만 찾는다(광고 소리는 건드리지 않음)
        const v = document.querySelector<HTMLVideoElement>(getPlatformConfig(adapter.type).selectors.video ?? 'video');
        if (!v) return false;
        const why = refused.get(v);
        if (why) { setStatus(why); return false; }
        if (v === video && source) return true;
        if (!ctx) {
            ctx = new AudioContext();
            pre = ctx.createGain();
            comp = ctx.createDynamicsCompressor();
            gain = ctx.createGain();
            pre.connect(comp).connect(gain).connect(ctx.destination);
        }
        if (ctx.state !== 'running') await ctx.resume().catch(() => {});
        if (ctx.state !== 'running') return false;
        try {
            source?.disconnect();
            video?.removeEventListener('volumechange', onVolume);
            source = ctx.createMediaElementSource(v);
            v.addEventListener('volumechange', onVolume);
            source.connect(ctx.destination);
            routed = false;
            video = v;
        } catch {
            const why: AudioStatus = v.hasAttribute(HANDOFF_ATTR) ? 'update' : 'other';
            refused.set(v, why);
            setStatus(why);
            source = null;
            video = null;
            return false;
        }
        setStatus('ok');
        if (params) setParams(params);
        return true;
    }

    /** 바뀔 때만 아이콘 배지를 고친다 — 업데이트 탓으로 못 걸었을 때만 ↻ */
    function setStatus(next: AudioStatus) {
        if (next === status) return;
        status = next;
        browser.runtime.sendMessage({ type: AUDIO_BADGE_MESSAGE, refresh: next === 'update' }).catch(() => { /* background 깨는 중 */ });
    }

    async function tick() {
        if (!active) return;
        if (await attach()) route(true);
    }

    async function evaluate() {
        const cfg = await getAudioConfig();
        const id = adapter.getPageMode() === 'live' ? adapter.getCurrentChannelId() : null;
        active = cfg.enabled && !!id && !(channelKey(adapter.type, id) in cfg.off) && !isChannelOff();
        params = cfg.params;
        setParams(params);
        if (active) {
            await tick();
            timer ??= setInterval(tick, POLL_MS);
        } else {
            route(false);
            setStatus('ok');
            if (timer) { clearInterval(timer); timer = null; }
        }
    }

    // 사용자 동작 전이라 멈춰 있던 AudioContext는 첫 클릭·키 입력 때 다시 시도
    const retry = () => { if (active) tick(); };
    document.addEventListener('pointerdown', retry, true);
    document.addEventListener('keydown', retry, true);

    addStorageUpdateListener(key => { if (key === AUDIO_KEY) evaluate(); });
    browser.runtime.onMessage.addListener((msg: { type?: string }, _sender, sendResponse) => {
        if (msg?.type !== AUDIO_STATUS_MESSAGE || !active) return;
        sendResponse({ status, reduction: routed && comp ? comp.reduction : null } satisfies AudioStatusReply);
    });
    onTeardown(() => {
        active = false;
        if (timer) clearInterval(timer);
        document.removeEventListener('pointerdown', retry, true);
        document.removeEventListener('keydown', retry, true);
        route(false);
        if (source) video?.setAttribute(HANDOFF_ATTR, '');
    });

    return { evaluate };
}
