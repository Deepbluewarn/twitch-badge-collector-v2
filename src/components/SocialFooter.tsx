import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGithub } from "@fortawesome/free-brands-svg-icons";
import { faEnvelope } from "@fortawesome/free-solid-svg-icons";
import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import { LinkButton, Stack } from '@/ui';

export default function SocialFooter({ showExtensionInfo = true }: { showExtensionInfo?: boolean }) {
    const iconUrl = browser.runtime.getURL('/icon/icon.png');
    const name = browser.i18n.getMessage('ExtensionName') || 'Badge Collector';
    const version = browser.runtime.getManifest().version;

    return (
        // 확장정보 없을 땐 단독 socials를 중앙 정렬
        <Stack dir="row" align="center" justify={showExtensionInfo ? 'flex-start' : 'center'} style={{ width: '100%' }}>
            {showExtensionInfo && <div style={{ flex: 1 }} />}

            {/* 중앙: social links */}
            <Stack dir="row" gap={4}>
                <LinkButton variant="text" href='https://discord.gg/ZM6Eazpz5V' target='_blank' aria-label="Discord"><FontAwesomeIcon icon={faDiscord} size='xl' /></LinkButton>
                <LinkButton variant="text" href='https://github.com/Deepbluewarn/twitch-badge-collector-v2' target='_blank' aria-label="GitHub"><FontAwesomeIcon icon={faGithub} size='xl' /></LinkButton>
                <LinkButton variant="text" href='mailto:tbcextension@gmail.com' target='_blank' aria-label="Email"><FontAwesomeIcon icon={faEnvelope} size='xl' /></LinkButton>
            </Stack>

            {/* 우측: 확장 정보 — popup 등 이미 상단에 표시되는 곳에선 숨김 */}
            {showExtensionInfo && (
                <Stack dir="row" align="center" gap={6} justify="flex-end" style={{ flex: 1, color: 'var(--ui-muted)' }}>
                    <img src={iconUrl} alt={name} style={{ width: 16, height: 16 }} />
                    {/* 표 주변 보조 글자와 같은 단계 (docs/design-system.md "글자") */}
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{name} v{version}</span>
                </Stack>
            )}
        </Stack>
    );
}
