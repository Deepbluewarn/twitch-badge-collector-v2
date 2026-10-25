/**
 * 이 채널을 꺼 두었는지 — <html>의 클래스로 본다. ISOLATED의 setupChannelOff가 붙이고 뗀다.
 * MAIN world(페이지 쪽 스크립트)는 storage를 못 읽어서 같은 클래스를 그때그때 확인한다.
 * 꺼진 채널에서는 확장을 끈 것과 같아야 한다 — 감시·전달·위조를 모두 멈춘다.
 */
export const CHANNEL_OFF_CLASS = 'tbcv2-channel-off';

export const isChannelOffNow = () => document.documentElement.classList.contains(CHANNEL_OFF_CLASS);
