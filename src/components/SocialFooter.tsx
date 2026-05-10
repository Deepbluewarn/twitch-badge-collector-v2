import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGithub } from "@fortawesome/free-brands-svg-icons";
import { faEnvelope } from "@fortawesome/free-solid-svg-icons";
import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
export default function SocialFooter({ showExtensionInfo = true }: { showExtensionInfo?: boolean }) {
    const iconUrl = browser.runtime.getURL('/icon/icon.png');
    const name = browser.i18n.getMessage('ExtensionName') || 'Badge Collector';
    const version = browser.runtime.getManifest().version;

    return (
        <Stack
            direction='row'
            alignItems='center'
            sx={{
                width: '100%',
                // 확장정보 없을 땐 단독 socials를 중앙 정렬
                justifyContent: showExtensionInfo ? 'flex-start' : 'center',
            }}
        >
            {showExtensionInfo && <Box sx={{ flex: 1 }} />}

            {/* 중앙: social links */}
            <Stack direction='row' spacing={1}>
                <Button href='https://discord.gg/ZM6Eazpz5V' target='_blank'><FontAwesomeIcon icon={faDiscord} size='xl' /></Button>
                <Button href='https://github.com/Deepbluewarn/twitch-badge-collector-v2' target='_blank'><FontAwesomeIcon icon={faGithub} size='xl' /></Button>
                <Button href='mailto:tbcextension@gmail.com' target='_blank'><FontAwesomeIcon icon={faEnvelope} size='xl' /></Button>
            </Stack>

            {/* 우측: 확장 정보 — popup 등 이미 상단에 표시되는 곳에선 숨김 */}
            {showExtensionInfo && (
                <Stack
                    direction='row'
                    alignItems='center'
                    spacing={0.75}
                    sx={{ flex: 1, justifyContent: 'flex-end', color: 'text.disabled' }}
                >
                    <Box
                        component='img'
                        src={iconUrl}
                        alt={name}
                        sx={{ width: 16, height: 16, opacity: 0.7 }}
                    />
                    <Typography variant='caption' sx={{ fontSize: '0.72rem' }}>
                        {name} v{version}
                    </Typography>
                </Stack>
            )}
        </Stack>
    )
}