import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Button from "@mui/material/Button";
import { useTranslation } from "react-i18next";
import { SELECTOR_HEALTH_EVENT, SelectorHealth } from "@/platform/selector-health";

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

    if (!health || health.broken.length === 0 || dismissed) return null;

    // 이름도 본문도 못 읽으면 수집 자체가 멈춘 것. 하나라도 살아있으면 부분 수집.
    const nameDead = health.broken.includes('displayName');
    const textDead = health.broken.includes('messageText');
    const stopped = nameDead && textDead;

    const fields = Array.from(new Set(
        health.broken.map(n => SELECTOR_TO_FIELD[n]).filter(Boolean),
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
