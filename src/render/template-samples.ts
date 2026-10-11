import type { ChzzkSocketChat } from "@/platform/chzzk-socket";
import type { ChzzkChatKind } from "./chzzk-chat-view";

/**
 * 템플릿 미리보기용 샘플 채팅. 2026-10 소켓 실측 모양을 따르되 닉네임·id는 지어냈다.
 * 배지·이모지 이미지는 치지직 공개 CDN 주소.
 */

const G = 'https://ssl.pstatic.net/static/nng/glive';
const now = Date.now();

function sample(over: Partial<ChzzkSocketChat> & { uid: string }): ChzzkSocketChat {
    const time = over.time ?? now;
    return {
        id: `${over.uid}_${time}`, time, type: 1, status: 'NORMAL',
        nickname: '시청자', anonymous: false, message: '', emojis: {},
        badges: [], verified: false, userRoleCode: 'common_user',
        nicknameColorCode: 'CC000', chatChannelId: 'SAMPLE', extras: {},
        ...over,
    };
}

export const TEMPLATE_SAMPLES: Record<ChzzkChatKind, { label: string; chat: ChzzkSocketChat }[]> = {
    chat: [
        {
            label: '배지 + 이모지',
            chat: sample({
                uid: 'sample-a', nickname: '고양이집사', message: '오늘 방송 재밌다 {:mlb_13:}',
                emojis: { mlb_13: `${G}/icon/mlb/13.png` },
                badges: [`${G}/icon/9m.png`, `${G}/badge/fan_03.png`],
            }),
        },
        {
            label: '매니저',
            chat: sample({
                uid: 'sample-b', nickname: '방장대리', message: '공지 확인해주세요', userRoleCode: 'streaming_chat_manager',
                badges: [`${G}/icon/manager.png`, `${G}/badge/cheatkey_12m.png`],
            }),
        },
        {
            label: '2단계 구독자 닉네임 꾸미기 (그라데이션)',
            chat: sample({ uid: 'sample-sg', nickname: '반짝구독자', message: '그라데이션 닉네임', nicknameColorCode: 'SG001', badges: [`${G}/icon/12m.png`] }),
        },
        {
            label: '2단계 구독자 닉네임 꾸미기 (하이라이트)',
            chat: sample({ uid: 'sample-sh', nickname: '형광펜구독자', message: '하이라이트 닉네임', nicknameColorCode: 'SH004', badges: [`${G}/icon/12m.png`] }),
        },
        {
            label: '클린봇 (클릭하면 원문)',
            chat: sample({ uid: 'sample-c', nickname: '지나가던사람', message: '가려진 원문입니다', status: 'CBOTBLIND' }),
        },
        {
            label: '운영자 블라인드',
            chat: sample({ uid: 'sample-d', nickname: '익명123', message: '보이면 안 되는 말', status: 'BLIND' }),
        },
    ],
    donation: [
        {
            label: '후원',
            chat: sample({
                uid: 'sample-e', type: 10, nickname: '치즈부자', message: '항상 잘 보고 있어요!',
                badges: [`${G}/icon/gold.png`, `${G}/badge/fan_03.png`],
                extras: { payAmount: 10000, donationType: 'CHAT', isAnonymous: false },
            }),
        },
        {
            label: '익명 후원 (메시지 없음)',
            chat: sample({ uid: 'anonymous', type: 10, anonymous: true, nickname: '', message: '', extras: { payAmount: 1000, isAnonymous: true } }),
        },
        {
            label: '미션 후원',
            chat: sample({
                uid: 'sample-f', type: 10, nickname: '미션왕', message: '',
                extras: { payAmount: 5000, donationType: 'MISSION', missionText: '노래 한 곡 불러주세요' },
            }),
        },
    ],
    subscription: [
        {
            label: '구독',
            chat: sample({
                uid: 'sample-g', type: 11, nickname: '오래된구독자', message: '1년 됐네요',
                badges: [`${G}/icon/12m.png`],
                extras: { month: 12, tierName: '팬', tierNo: 1 },
            }),
        },
    ],
};

/** 편집기의 "쓸 수 있는 값" 안내. 설명은 i18n `template.fields.<name>`. */
export const TEMPLATE_FIELDS: { name: string; kinds?: ChzzkChatKind[] }[] = [
    { name: 'nickname' },
    { name: 'messageHtml' },
    { name: 'message' },
    { name: 'hasMessage' },
    { name: 'badges' },
    { name: 'verifiedIconUrl' },
    { name: 'time' },
    { name: 'nickStyle' },
    { name: 'nickEffect' },
    { name: 'nickColorLight' },
    { name: 'nickColorDark' },
    { name: 'cleanbot' },
    { name: 'blinded' },
    { name: 'anonymous' },
    { name: 'donation.amountText', kinds: ['donation'] },
    { name: 'donation.amount', kinds: ['donation'] },
    { name: 'donation.mission', kinds: ['donation'] },
    { name: 'donation.missionText', kinds: ['donation'] },
    { name: 'subscription.month', kinds: ['subscription'] },
    { name: 'subscription.tierName', kinds: ['subscription'] },
];
