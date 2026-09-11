import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Button from "@mui/material/Button";
import { useTranslation } from "react-i18next";
import { addStorageUpdateListener } from "@/utils/utils-browser";
import { SELECTOR_HEALTH_EVENT, SelectorHealth } from "@/platform/selector-health";

/**
 * 개발용 강제 표시 스위치. 배너는 host가 실제로 깨져야 뜨는데, 그 상황을 만들려면
 * selector를 일부러 망가뜨려야 해서 눈으로 확인하기가 번거롭다. storage에 이 키를
 * 넣으면 실제 감지 없이 배너를 띄운다.
 *
 *   browser.storage.local.set({ 'tbcv2-debug-force-health': 'stopped' })  // 수집 중단 (빨강)
 *   browser.storage.local.set({ 'tbcv2-debug-force-health': 'partial' })  // 부분 수집 (노랑)
 *   browser.storage.local.remove('tbcv2-debug-force-health')              // 해제
 *
 * storage 게이트라 기본값은 항상 꺼짐 — 릴리스 빌드에 남아도 사용자에게 안 보인다.
 */
const DEBUG_FORCE_KEY = 'tbcv2-debug-force-health';

function forcedHealth(mode: unknown): SelectorHealth | null {
    if (mode === 'stopped') {
        // 이름도 본문도 못 읽는 상태 = rev 13 사고와 같은 조건.
        return {
            broken: ['displayName', 'usernameContainer', 'messageText', 'badge'],
            degraded: [],
            checkedAt: Date.now(),
        };
    }
    if (mode === 'partial') {
        // 닉네임만 못 읽는 상태 — 배지/키워드 필터는 계속 도는 경우.
        return { broken: ['displayName', 'usernameContainer'], degraded: [], checkedAt: Date.now() };
    }
    return null;
}

/** 깨진 selector 이름 → 사용자에게 설명할 Filter Category */
const SELECTOR_TO_FIELD: Record<string, string> = {
    displayName: 'name',
    usernameContainer: 'name',
    messageText: 'keyword',
    badge: 'badge',
};

/**
 * host page 구조 변경으로 채팅 수집이 멈췄을 때 Container 상단에 뜨는 배너 (Layer 5).
 *
 * 지금까지 이 상황은 완전히 조용했다 — 사용자는 "필터가 죽었다"만 알 수 있었고 원인도
 * 복구 여부도 볼 수 없었다. selector-health가 감지 시 window 이벤트를 쏘고, 여기서
 * 받아 표시한다. 실제 OTA 요청은 selector-health가 이미 보냈고, 새 manifest는 다음
 * 페이지 로드부터 적용되므로 안내는 "새로고침"이다.
 *
 * 배너는 Container 안에 있으니 Container가 mount된 경우에만 보인다. chatRoom selector
 * 자체가 깨져 Container가 아예 안 붙는 최악의 경우는 popup의 진단 리포트가 담당.
 */
export default function SelectorHealthBanner() {
    const { t } = useTranslation();
    const [health, setHealth] = useState<SelectorHealth | null>(null);
    const [dismissed, setDismissed] = useState(false);

    // 개발용 강제 표시가 켜져 있으면 실제 감지 결과보다 우선한다.
    const [forced, setForced] = useState<SelectorHealth | null>(null);

    useEffect(() => {
        const onHealth = (e: Event) => {
            const detail = (e as CustomEvent<SelectorHealth>).detail;
            setHealth(detail);
            // 회복되면 dismiss 상태도 리셋 — 다음 사고 때 다시 보여야 한다.
            if (detail.broken.length === 0) setDismissed(false);
        };
        window.addEventListener(SELECTOR_HEALTH_EVENT, onHealth);
        return () => window.removeEventListener(SELECTOR_HEALTH_EVENT, onHealth);
    }, []);

    useEffect(() => {
        browser.storage.local.get(DEBUG_FORCE_KEY)
            .then(res => setForced(forcedHealth(res[DEBUG_FORCE_KEY])))
            .catch(() => { /* storage 못 읽음 — 강제 표시 없음 */ });

        // 콘솔에서 값을 바꾸면 새로고침 없이 바로 반영되게.
        addStorageUpdateListener((key, newValue) => {
            if (key !== DEBUG_FORCE_KEY) return;
            setForced(forcedHealth(newValue));
            setDismissed(false);
        });
    }, []);

    const shown = forced ?? health;
    if (!shown || shown.broken.length === 0 || dismissed) return null;

    // 이름도 본문도 못 읽으면 수집 자체가 멈춘 것. 하나라도 살아있으면 부분 수집.
    const nameDead = shown.broken.includes('displayName');
    const textDead = shown.broken.includes('messageText');
    const stopped = nameDead && textDead;

    const fields = Array.from(new Set(
        shown.broken.map(n => SELECTOR_TO_FIELD[n]).filter(Boolean),
    ));

    return (
        <Alert
            severity={stopped ? 'error' : 'warning'}
            action={
                <>
                    <Button color="inherit" size="small" onClick={() => window.location.reload()}>
                        {t('selector_health.refresh')}
                    </Button>
                    <Button color="inherit" size="small" onClick={() => setDismissed(true)}>
                        {t('selector_health.dismiss')}
                    </Button>
                </>
            }
            sx={{ fontSize: '0.75rem', alignItems: 'center', borderRadius: 0 }}
        >
            <AlertTitle sx={{ fontSize: '0.8rem', mb: 0.25 }}>{t('selector_health.title')}</AlertTitle>
            {stopped
                ? t('selector_health.body')
                : t('selector_health.partial', { fields: fields.join(', ') })}
        </Alert>
    );
}
