import { useAlertContext } from "../context/Alert";
import { Button, Notice } from "@/ui";

/** 화면 오른쪽 위에 쌓이는 알림. */
export default function AlertContainer() {
    const { alerts, setAlerts } = useAlertContext();
    return (
        <div style={{ position: 'fixed', right: 0, top: 0, zIndex: 1444, display: 'flex', flexDirection: 'column', gap: 8, padding: 8 }}>
            {alerts.map((a, i) => (
                <Notice key={a.action ? `action-${i}-${a.message}` : `${a.serverity}-${a.message}`} tone={a.serverity}
                    action={a.action && (
                        <Button size="sm" variant="text" onClick={() => { a.action!.onClick(); setAlerts(prev => prev.filter(x => x !== a)); }}>
                            {a.action.label}
                        </Button>
                    )}>
                    {a.message}
                </Notice>
            ))}
        </div>
    );
}
