import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { t } from "i18next";
import browser from "webextension-polyfill";

const Donation = () => {
    return (
        <Stack gap={2}>
            <Typography>{t('common.encourage_donation')}</Typography>

            <Stack direction={'row'} alignItems={'center'} gap={2} sx={{ marginTop: '8px' }}>
                <Link href={import.meta.env.VITE_DONATE_LINK} target='_blank'>
                    <Box
                        component='img'
                        sx={{ width: '10rem', borderRadius: '8px' }}
                        src={`https://cdn.jsdelivr.net/npm/twitch-badge-collector-cc@0.0.70/dist/donation/toonation_b14.gif`}
                    />
                </Link>
                <Link href="https://www.buymeacoffee.com/bluewarndev" target="_blank">
                    <Box
                        component='img'
                        sx={{ width: '10rem', borderRadius: '8px' }}
                        src={browser.runtime.getURL('src/assets/bmc-button.svg')}
                    />
                </Link>
            </Stack>
        </Stack>
    )
}

export default function DonationAlert({ noAlert }: { noAlert?: boolean }) {
    return (
        noAlert ? (
            <Donation />
        ) : (
            <Alert variant="outlined" severity="info">
                <Donation />
            </Alert>
        )
    )
}
