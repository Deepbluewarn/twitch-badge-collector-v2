import { getPlatformConfig } from "@/platform/host-selectors";

/**
 * 소켓 렌더 모드 스위치 (chzzk). OTA로 비율 배포한다.
 *
 * 켜져 있어도 채팅 소켓 탭 신호가 한 번도 안 오면 HTML 경로로 동작한다 (useChatStream).
 *
 * 우선순위:
 *  1. localStorage `tbc:socket-render` — '0'이면 끔, '1'이면 켬. 개발·디버그용.
 *  2. OTA `platforms.chzzk.constants.socketRender` — 0이면 전원 끔. 비상 스위치.
 *  3. OTA `constants.socketRenderPercent` (0~100) — 설치별 숫자(0~99)가 이 값보다 작으면 켬.
 *     값이 없으면 100(전원 켬). 절차: docs/ota-selectors.md 시나리오 D.
 *     개발 빌드(`npm run dev`)는 비율을 무시하고 켠다 — 실행마다 새 프로필이라 숫자를 새로 뽑아서
 *     켜졌다 꺼졌다 한다. 비상 스위치는 따른다.
 *
 * 설치별 숫자는 처음 필요할 때 무작위로 뽑아 storage.local에 두고 계속 쓴다 — 같은 사용자는
 * 비율을 올려도 켜진 쪽에서 꺼지지 않는다. 밖으로 보내지 않는다.
 *
 * MAIN world의 소켓 탭(ws-tap) 자체는 이 스위치와 무관하게 항상 설치된다. 치지직이 소켓을
 * 열기 전(document_start)에 걸려야 하는데 MAIN은 그 시점에 manifest를 아직 못 받았다.
 * 탭은 listener만 붙이고 예외를 밖으로 내지 않으므로 켜 둬도 host 동작에 영향이 없다.
 */
export const SOCKET_RENDER_FLAG = 'tbc:socket-render';
export const ROLLOUT_BUCKET_KEY = 'tbc-socket-rollout-bucket';

let bucket: number | undefined;

const isBucket = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < 100;

/**
 * 설치별 숫자(0~99)를 읽는다. 없으면 뽑아서 저장한다. 판정(isSocketRenderEnabled)은 동기라서
 * content script·팝업은 시작할 때 이걸 먼저 기다려야 한다.
 */
export async function ensureRolloutBucket(): Promise<number | undefined> {
    if (bucket !== undefined) return bucket;
    try {
        const res = await browser.storage.local.get(ROLLOUT_BUCKET_KEY);
        const stored = res[ROLLOUT_BUCKET_KEY];
        if (isBucket(stored)) return (bucket = stored);
        const fresh = crypto.getRandomValues(new Uint32Array(1))[0] % 100;
        await browser.storage.local.set({ [ROLLOUT_BUCKET_KEY]: fresh });
        return (bucket = fresh);
    } catch {
        return undefined;   // 저장소를 못 쓰면 판정에서 "모름"으로 — 비율 배포 중엔 끈 쪽으로.
    }
}

export function isSocketRenderEnabled(
    constants: Record<string, string | number> | undefined = getPlatformConfig('chzzk').constants,
    local: string | null = readLocal(),
    installBucket: number | undefined = bucket,
    // vitest는 mode가 'test'라 여기 걸리지 않는다.
    devBuild: boolean = import.meta.env.MODE === 'development',
): boolean {
    if (local === '0') return false;
    if (local === '1') return true;
    const kill = constants?.socketRender;
    if (kill === 0 || kill === '0') return false;
    if (devBuild) return true;
    const raw = constants?.socketRenderPercent;
    if (raw === undefined || raw === '') return true;
    const percent = Math.max(0, Math.min(100, Number(raw)));
    if (!Number.isFinite(percent)) return false;
    if (percent >= 100) return true;
    // 숫자를 모르면(저장소 실패) 비율 배포 중엔 끈 쪽 — 원래 동작(HTML 경로)이 안전하다.
    return installBucket !== undefined && installBucket < percent;
}

function readLocal(): string | null {
    try { return localStorage.getItem(SOCKET_RENDER_FLAG); } catch { return null; }
}

/** 테스트 전용 — 모듈에 캐시된 숫자를 비운다. */
export function __resetRolloutBucketForTest() { bucket = undefined; }
