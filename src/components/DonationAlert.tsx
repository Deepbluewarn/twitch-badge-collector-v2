import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { t } from "i18next";

const Donation = () => {
    return (
        <Stack gap={2}>
            <Typography>{t('common.encourage_donation')}</Typography>

            <Stack direction={'row'} alignItems={'center'} gap={2} sx={{ marginTop: '8px' }}>
                <Link href="https://bit.ly/3An2B2l" target="_blank">
                    <Box
                        component='img'
                        sx={{ width: '10rem', borderRadius: '8px' }}
                        src={browser.runtime.getURL('/assets/bmc-button.svg')}
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
