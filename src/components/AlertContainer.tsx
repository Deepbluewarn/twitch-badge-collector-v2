import styled from "@emotion/styled";
import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import { useAlertContext } from "../context/Alert";

const AlertContainerStyle = styled(Stack)({
    position: 'fixed',
    right: '0',
    gap: '8px',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    padding: '8px',
    zIndex: '1444',
});

export default function AlertContainer() {
    const { alerts } = useAlertContext();

    const alert = alerts.map(a => {
        return (
            <Alert
                key={`${a.serverity}-${a.message}`}
                variant="filled"
                severity={a.serverity}
            >
                {a.message}
            </Alert>
        )
    });
    return (
        <AlertContainerStyle direction='row'>
            {alert}
        </AlertContainerStyle>
    )
}