import React from "react";
import AlertInterface from "../interfaces/alert";

export default function useAlert() {
    const [ alerts, setAlerts ] = React.useState<AlertInterface[]>([]);
    const [ times, setTimes ] = React.useState<number[]>([]);

    const addAlert = (alert: AlertInterface) => {
        setAlerts(alerts => {
            if(alerts.some(a => checkAlertDuplicate(a, alert))){
                return alerts;
            }
            return [...alerts, alert];
        });
    }

    const checkAlertDuplicate = (alert_1: AlertInterface, alert_2: AlertInterface) => {
        return (
            alert_1.message === alert_2.message && 
            alert_1.serverity === alert_2.serverity
        )
    }

    const shiftAlert = () => {
        setAlerts(alerts => {
            alerts.shift();
            return [...alerts];
        });
    }

    React.useEffect(() => {
        if(alerts.length === 0){
            times.forEach(t => {
                clearTimeout(t);
            });
        }
        if(alerts.length > 4){
            shiftAlert();
        }
    }, [alerts]);

    React.useEffect(() => {
        const timeId = window.setTimeout(() => {
            if(alerts.length <= 0) return;

            shiftAlert();

            clearTimeout(timeId);
        }, 4000);

        setTimes([...times, timeId]);
    }, [alerts]);

    return { alerts, setAlerts, addAlert };
}

