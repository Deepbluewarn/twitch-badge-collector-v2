import { useCallback, useEffect, useRef } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Card, Dialog, IconButton, Stack } from "@/ui";
import { getAdapter } from "@/platform";
import s from '../FilterAddDialog.module.css';

export default function ChannelIdGuideDialog({ open, onClose }: { open: boolean, onClose: () => void }) {
    const { t } = useTranslation();
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;
    const close = useCallback(() => onCloseRef.current(), []);

    // 필터 추가 대화상자 위에 겹쳐 뜬다. 키트 Dialog는 둘 다 document에서 Esc를 받으므로
    // 먼저(window capture) 받아서 이 안내만 닫고 아래 대화상자까지 닫히지 않게 막는다.
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            close();
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [open, close]);

    return (
        <Dialog
            open={open}
            onClose={close}
            width="sm"
            title={t('channel_guide.title')}
            headerExtra={<IconButton icon="close" label={t('common.close')} size="sm" onClick={close} />}
        >
            <Stack gap={16}>
                <PlatformGuide
                    name={t('platform.twitch')}
                    accent={getAdapter('twitch').brandColor}
                    description={t('channel_guide.twitch')}
                    example="https://www.twitch.tv/abcd1234"
                    result="abcd1234"
                />
                <PlatformGuide
                    name={t('platform.chzzk')}
                    accent={getAdapter('chzzk').brandColor}
                    description={
                        <Trans i18nKey='channel_guide.chzzk' components={{ b: <b /> }} />
                    }
                    example="https://chzzk.naver.com/live/abcd1234"
                    result="abcd1234"
                />
            </Stack>
        </Dialog>
    );
}

function PlatformGuide({ name, accent, description, example, result }: {
    name: string;
    accent: string;
    description: React.ReactNode;
    example: string;
    result: string;
}) {
    const { t } = useTranslation();
    return (
        <Card className={s.guide} style={{ borderLeft: `4px solid ${accent}` }}>
            <h3 className={s.guideName}>{name}</h3>
            <p className={s.guideDesc}>{description}</p>
            <div className={s.guideExample}>
                <span>{t('channel_guide.example')}</span>
                <code>{example}</code>
                <span>→</span>
                <b>{result}</b>
            </div>
        </Card>
    );
}
