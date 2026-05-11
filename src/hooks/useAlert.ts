import React, { useEffect, useRef } from "react";
import AlertInterface from "../interfaces/alert";

const ALERT_TTL_MS = 4000;
const MAX_VISIBLE = 4;

export default function useAlert() {
    const [alerts, setAlerts] = React.useState<AlertInterface[]>([]);
    // 다음 dismiss timeout 1개만 유지 — alerts가 바뀔 때마다 이전 것을 cancel.
    // 이전 구조는 매 alerts 변경마다 setTimeout을 새로 등록하면서 timeoutId를 배열에
    // 누적만 하고 비우지 않아 leak이 있었음.
    const dismissTimeoutRef = useRef<number | null>(null);

    const addAlert = (alert: AlertInterface) => {
        setAlerts(prev => {
            if (prev.some(a => isDuplicate(a, alert))) return prev;
            return [...prev, alert];
        });
    };

    const shiftAlert = () => {
        setAlerts(prev => {
            const next = prev.slice(1);
            return next;
        });
    };

    useEffect(() => {
        // 이전 timeout이 있으면 cancel — alerts 변경마다 단일 활성 timeout만 유지.
        if (dismissTimeoutRef.current !== null) {
            clearTimeout(dismissTimeoutRef.current);
            dismissTimeoutRef.current = null;
        }

        if (alerts.length === 0) return;
        if (alerts.length > MAX_VISIBLE) {
            shiftAlert();
            return;
        }

        dismissTimeoutRef.current = window.setTimeout(() => {
            shiftAlert();
            dismissTimeoutRef.current = null;
        }, ALERT_TTL_MS);

        return () => {
            if (dismissTimeoutRef.current !== null) {
                clearTimeout(dismissTimeoutRef.current);
                dismissTimeoutRef.current = null;
            }
        };
    }, [alerts]);

    return { alerts, setAlerts, addAlert };
}

function isDuplicate(a: AlertInterface, b: AlertInterface): boolean {
    return a.message === b.message && a.serverity === b.serverity;
}
