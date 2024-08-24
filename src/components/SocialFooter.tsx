import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGithub } from "@fortawesome/free-brands-svg-icons";
import { faEnvelope } from "@fortawesome/free-solid-svg-icons";
import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';

export default function SocialFooter() {
    return (
        <Stack direction='row' justifyContent='center' spacing={1} sx={{width: '100%'}}>
            <Button href='https://discord.gg/ZM6Eazpz5V' target='_blank'><FontAwesomeIcon icon={faDiscord} size='xl' /></Button>
            <Button href='https://github.com/Deepbluewarn/twitch-badge-collector-v2' target='_blank'><FontAwesomeIcon icon={faGithub} size='xl' /></Button>
            <Button href='mailto:tbcextension@gmail.com' target='_blank'><FontAwesomeIcon icon={faEnvelope} size='xl' /></Button>
        </Stack>
    )
}