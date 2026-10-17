export type AlertSeverity = 'success' | 'info' | 'warning' | 'error';

export default interface AlertInterface {
    message: string;
    serverity: AlertSeverity;
}
