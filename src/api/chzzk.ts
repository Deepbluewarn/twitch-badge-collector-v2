// 치지직 배지 목록 — 리포의 data/chzzk-badges.json을 jsDelivr로 받는다.
// 이름은 사람이 붙인다(수집기는 새 배지를 알려만 줌). jsDelivr가 @master를 ~12h 캐시하므로
// 바로 반영하려면 https://purge.jsdelivr.net/gh/Deepbluewarn/twitch-badge-collector-v2@master/data/chzzk-badges.json
const BADGES_URL = 'https://cdn.jsdelivr.net/gh/Deepbluewarn/twitch-badge-collector-v2@master/data/chzzk-badges.json';

export interface ChzzkBadge {
    name: string;
    imageUrl: string;
    condition?: string;
}

export interface ChzzkBadgeGroup {
    id: string;
    title: string;
    badges: ChzzkBadge[];
}

export async function fetchChzzkBadgeGroups(): Promise<ChzzkBadgeGroup[]> {
    const res = await fetch(BADGES_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data?.groups)) throw new Error('unexpected badge list shape');
    return data.groups;
}
