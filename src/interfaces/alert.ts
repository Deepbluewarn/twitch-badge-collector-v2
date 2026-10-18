export type AlertSeverity = 'success' | 'info' | 'warning' | 'error';

export default interface AlertInterface {
    message: string;
    serverity: AlertSeverity;
    /** 알림 오른쪽 글자 버튼 (예: 되돌리기). 누르면 알림도 닫힌다. */
    action?: { label: string; onClick: () => void };
    /** 떠 있는 시간(ms). 기본 4초 — 되돌리기처럼 누를 시간이 필요하면 길게. */
    ttl?: number;
}
