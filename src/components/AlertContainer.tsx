import { useAlertContext } from "../context/Alert";
import { Notice } from "@/ui";

/** 화면 오른쪽 위에 쌓이는 알림. */
export default function AlertContainer() {
    const { alerts } = useAlertContext();
    return (
        <div style={{ position: 'fixed', right: 0, top: 0, zIndex: 1444, display: 'flex', flexDirection: 'column', gap: 8, padding: 8 }}>
            {alerts.map(a => (
                <Notice key={`${a.serverity}-${a.message}`} tone={a.serverity}>{a.message}</Notice>
            ))}
        </div>
    );
}
