import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import CloseIcon from "@mui/icons-material/Close";
import { addStorageUpdateListener } from "@/utils/utils-browser";
import { SELECTOR_HEALTH_EVENT, SelectorHealth } from "@/platform/selector-health";
import { getManifest } from "@/platform/host-selectors";

/**
 * 번역은 browser.i18n(public/_locales) 사용 — i18next가 아니다.
 *
 * 이 컴포넌트는 content script가 host page에 mount하는 Container 안에서 돈다.
 * i18next는 설정 페이지 entrypoint에서만 init되므로 여기선 초기화가 안 돼 있고,
 * useTranslation을 쓰면 번역 키 문자열이 그대로 화면에 찍힌다 (실제로 그렇게 났다).
 * popup과 SocialFooter도 같은 이유로 browser.i18n을 쓴다.
 */
const t = (key: string, sub?: string[]): string =>
    browser.i18n.getMessage(key as never, sub as never) || key;

/** 깨진 selector 이름 → 사용자에게 설명할 Filter Category */
const SELECTOR_TO_FIELD: Record<string, string> = {
    displayName: 'name',
    usernameContainer: 'name',
    messageText: 'keyword',
    badge: 'badge',
};

/**
 * 개발용 강제 표시 스위치. 배너는 host가 실제로 깨져야 뜨는데, 그 상황을 만들려면
 * selector를 일부러 망가뜨려야 해서 눈으로 확인하기가 번거롭다. storage에 이 키를
 * 넣으면 실제 감지 없이 배너를 띄운다.
 *
 *   browser.storage.local.set({ 'tbcv2-debug-force-health': 'stopped' })  // 수집 중단
 *   browser.storage.local.set({ 'tbcv2-debug-force-health': 'partial' })  // 부분 수집
 *   browser.storage.local.remove('tbcv2-debug-force-health')              // 해제
 *
 * storage 게이트라 기본값은 항상 꺼짐 — 릴리스 빌드에 남아도 사용자에게 안 보인다.
 */
const DEBUG_FORCE_KEY = 'tbcv2-debug-force-health';

/**
 * 사용자가 닫은 사실을 기억하는 키. 값은 닫을 때의 manifest rev.
 *
 * 세션 state만 쓰면 새로고침·채널 이동마다 다시 뜬다. 사고는 개발자가 selector를
 * 고쳐 push할 때까지 몇 시간 이어질 수 있어서, 그동안 매번 다시 띄우면 그게 곧
 * 사용자가 화내는 지점이다. 반대로 영구 무음도 안 되므로 rev를 키로 쓴다 —
 * 새 selector가 도착하면(rev 증가) 상황이 바뀐 것이니 다시 보여준다.
 */
const DISMISSED_KEY = 'tbcv2-health-dismissed-rev';

function forcedHealth(mode: unknown): SelectorHealth | null {
    if (mode === 'stopped') {
        // 이름도 본문도 못 읽는 상태 = rev 13 사고와 같은 조건.
        return {
            verdict: 'broken',
            broken: ['displayName', 'usernameContainer', 'messageText', 'badge'],
            degraded: [],
            chatCount: 20,
            checkedAt: Date.now(),
        };
    }
    if (mode === 'partial') {
        // 닉네임만 못 읽는 상태 — 배지/키워드 필터는 계속 도는 경우.
        return {
            verdict: 'broken',
            broken: ['displayName', 'usernameContainer'],
            degraded: [],
            chatCount: 20,
            checkedAt: Date.now(),
        };
    }
    return null;
}

/**
 * host page 구조 변경으로 채팅 수집이 멈췄을 때 Container 상단에 뜨는 한 줄 바 (Layer 5).
 *
 * 높이를 한 줄로 제한한 이유: 사용자가 켠 게 아니라 확장이 알아서 띄우는 UI다.
 * 이 저장소에는 "작은 화면에서 채팅 가린다"는 피드백으로 FAB를 없앤 이력이 있고,
 * 캡쳐 액션 바(52px)는 사용자가 직접 켰기 때문에 허용되는 것이다. 여기서 카드형
 * 알림을 띄우면 좁은 Container에서 채팅 여러 줄을 가린다.
 *
 * 배너는 Container 안에 있으니 Container가 mount된 경우에만 보인다. chatRoom selector
 * 자체가 깨져 Container가 아예 안 붙는 최악의 경우는 popup의 진단 리포트가 담당.
 */
export default function SelectorHealthBanner() {
    const [health, setHealth] = useState<SelectorHealth | null>(null);
    const [forced, setForced] = useState<SelectorHealth | null>(null);
    const [dismissedRev, setDismissedRev] = useState<number | null>(null);

    useEffect(() => {
        const onHealth = (e: Event) => {
            setHealth((e as CustomEvent<SelectorHealth>).detail);
        };
        window.addEventListener(SELECTOR_HEALTH_EVENT, onHealth);
        return () => window.removeEventListener(SELECTOR_HEALTH_EVENT, onHealth);
    }, []);

    useEffect(() => {
        browser.storage.local.get([DEBUG_FORCE_KEY, DISMISSED_KEY])
            .then(res => {
                setForced(forcedHealth(res[DEBUG_FORCE_KEY]));
                const rev = res[DISMISSED_KEY];
                setDismissedRev(typeof rev === 'number' ? rev : null);
            })
            .catch(() => { /* storage 못 읽음 — 강제 표시/기억 없음 */ });

        // 콘솔에서 디버그 값을 바꾸면 새로고침 없이 바로 반영되게.
        addStorageUpdateListener((key, newValue) => {
            if (key === DEBUG_FORCE_KEY) setForced(forcedHealth(newValue));
            if (key === DISMISSED_KEY) setDismissedRev(typeof newValue === 'number' ? newValue : null);
        });
    }, []);

    const shown = forced ?? health;

    // 'unknown'(판정 근거 없음)과 'ok'에서는 아무것도 띄우지 않는다.
    if (!shown || shown.verdict !== 'broken') return null;

    const rev = getManifest().rev;
    if (dismissedRev !== null && dismissedRev >= rev) return null;

    // 이름도 본문도 못 읽으면 수집 자체가 멈춘 것. 하나라도 살아있으면 부분 수집.
    const nameDead = shown.broken.includes('displayName');
    const textDead = shown.broken.includes('messageText');
    const stopped = nameDead && textDead;

    const fields = Array.from(new Set(
        shown.broken.map(n => SELECTOR_TO_FIELD[n]).filter(Boolean),
    ));

    const label = stopped
        ? t('selectorHealthTitle')
        : t('selectorHealthPartialShort', [fields.join(', ')]);
    const detail = stopped
        ? t('selectorHealthBody')
        : t('selectorHealthPartial', [fields.join(', ')]);

    const accent = stopped ? '#F26D5B' : '#E0A63C';

    const dismiss = () => {
        setDismissedRev(rev);
        browser.storage.local.set({ [DISMISSED_KEY]: rev }).catch(() => { /* 기억 실패 — 세션 내에서만 닫힘 */ });
    };

    return (
        <Box
            role="status"
            title={detail}
            sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                height: 26,
                px: 1,
                bgcolor: 'rgba(20,20,22,0.94)',
                backdropFilter: 'blur(6px)',
                borderBottom: `1px solid ${accent}`,
                color: '#EDEDED',
                fontSize: '11px',
                lineHeight: 1,
                overflow: 'hidden',
            }}
        >
            <WarningAmberIcon sx={{ fontSize: 14, color: accent, flexShrink: 0 }} />
            <Box component="span" sx={{
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
            }}>
                {label}
            </Box>
            <ButtonBase
                onClick={() => window.location.reload()}
                sx={{
                    flexShrink: 0, px: 0.75, py: 0.25, borderRadius: '2px',
                    fontSize: '11px', fontWeight: 600, color: accent,
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
                }}
            >
                {t('selectorHealthRefresh')}
            </ButtonBase>
            <ButtonBase
                onClick={dismiss}
                aria-label={t('selectorHealthDismiss')}
                sx={{
                    flexShrink: 0, width: 18, height: 18, borderRadius: '2px',
                    color: 'rgba(255,255,255,0.65)',
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.1)', color: '#fff' },
                }}
            >
                <CloseIcon sx={{ fontSize: 13 }} />
            </ButtonBase>
        </Box>
    );
}
