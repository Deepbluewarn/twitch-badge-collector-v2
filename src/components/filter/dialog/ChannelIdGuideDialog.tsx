import { Dialog, DialogContent, DialogTitle, Paper, Stack, Typography } from "@mui/material";

export default function ChannelIdGuideDialog({ open, onClose }: { open: boolean, onClose: () => void }) {
    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>채널 ID 입력 안내</DialogTitle>
            <DialogContent>
                <Stack spacing={3}>
                    <Paper variant="outlined" sx={{ p: 2 }}>
                        <Typography variant="subtitle1" gutterBottom>
                            <b>트위치</b>
                        </Typography>
                        <Typography variant="body2" gutterBottom>
                            트위치 채널 ID는 채널 주소의 마지막 부분입니다.
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            예시: <code>https://www.twitch.tv/abcd1234</code> → <b>abcd1234</b>
                        </Typography>
                    </Paper>
                    <Paper variant="outlined" sx={{ p: 2 }}>
                        <Typography variant="subtitle1" gutterBottom>
                            <b>치지직</b>
                        </Typography>
                        <Typography variant="body2" gutterBottom>
                            치지직 채널 ID는 라이브 방송 주소에서 <b>/live/</b> 다음에 나오는 영문/숫자 ID입니다.
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            예시: <code>https://chzzk.naver.com/live/abcd1234</code> → <b>abcd1234</b>
                        </Typography>
                    </Paper>
                </Stack>
            </DialogContent>
        </Dialog>
    );
}
