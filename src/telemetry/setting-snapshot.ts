/**
 * 주간 설정 기록의 항목 (docs/adr/0001-anonymous-usage-stats.md). 그 주에 처음 쓴 날, 설정을 기본값에서 바꿨는지만 0/1로 적는다.
 * 값 자체(개수, 색, 비율)는 보내지 않는다. 사람마다 거의 달라 기록을 잇는 단서가 된다.
 */
import defaultFilter from '@/defaultFilters';
import type { CompositeFilterElement, FilterCategory } from '@/interfaces/filter';
import { DEFAULT_MAX_CHATS } from '@/reducer/setting';
import { ARCHIVE_SETTING_KEY, DEFAULT_ARCHIVE_SETTING, sanitizeArchiveSetting } from '@/archive/chat-archive';
import { CHANNEL_OFF_KEY } from '@/utils/channel-off';

// 사이트 리포 functions/api/ping.ts의 WEEK_FLAGS와 같은 목록, 같은 순서. 뒤에만 덧붙인다.
export const SETTING_FLAGS = [
    'advancedFilter',
    'floating',
    'template',
    'filterBadge',
    'filterName',
    'filterKeyword',
    'filterExclude',
    'filterSleep',
    'filterChannel',
    'filterPerson',
    'filterMarker',
    'filterNote',
    'archiveOn',
    'archiveDays',
    'channelOff',
    'positionDown',
    'chatTime',
    'maxChats',
    'theme',
    'markerOff',
    'jumpBottomOff',
    'persistOff',
    'floatingBg',
    'chatSideLeft',
    'pointBoxOff',
] as const;
export type SettingFlag = typeof SETTING_FLAGS[number];

export const SETTING_SOURCE_KEYS = [
    'advancedFilter', 'displayMode', 'chzzkCustomTemplate', 'filter', ARCHIVE_SETTING_KEY, CHANNEL_OFF_KEY,
    'position', 'chatTime', 'maximumNumberChats', 'darkTheme', 'collectedChatMarker', 'jumpToBottomButton',
    'chatPersistence', 'floatingBgColor', 'chzzkChatSide', 'pointBoxAuto',
];

// 설치할 때 들어가는 기본 필터는 세지 않는다. 세면 배지, 닉네임, 제외 필터가 거의 모두 1이 된다.
// 값은 배지 이미지 동기화로 바뀌어도 id는 그대로다.
const DEFAULT_GROUP_IDS = new Set(defaultFilter.map(c => c.id));
const DEFAULT_FILTER_IDS = new Set(defaultFilter.flatMap(c => c.filters.map(f => f.id)));
const CATEGORY_FLAG: Record<FilterCategory, SettingFlag> = { badge: 'filterBadge', name: 'filterName', keyword: 'filterKeyword' };

// 번역이 있는 언어와 번역을 더할 만한 큰 언어만. 그 밖은 other — 드문 언어는 사람을 좁히는 단서가 된다.
const LOCALES = ['de', 'en', 'es', 'fr', 'ja', 'ko', 'pt_BR', 'ru', 'uk', 'zh_CN', 'zh_TW'];
const OTHER_LANGS = ['ar', 'hi', 'id', 'it', 'nl', 'pl', 'pt', 'th', 'tr', 'vi', 'zh'];

export function langCode(uiLanguage: string): string {
    const l = uiLanguage.replace('-', '_');
    if (LOCALES.includes(l)) return l;
    const base = l.slice(0, 2).toLowerCase();
    if (LOCALES.includes(base) || OTHER_LANGS.includes(base)) return base;
    return 'other';
}

export function settingFlags(s: Record<string, unknown>): Record<SettingFlag, 0 | 1> {
    const out = Object.fromEntries(SETTING_FLAGS.map(f => [f, 0])) as Record<SettingFlag, 0 | 1>;
    const on = (flag: SettingFlag, cond: unknown) => { if (cond) out[flag] = 1; };

    on('advancedFilter', s.advancedFilter === 'on');
    on('floating', s.displayMode === 'floating');
    on('template', s.chzzkCustomTemplate === 'on');

    const groups = Array.isArray(s.filter) ? s.filter as CompositeFilterElement[] : [];
    for (const g of groups) {
        if (!g || typeof g !== 'object') continue;
        const mine = !DEFAULT_GROUP_IDS.has(g.id);
        on('filterExclude', mine && g.filterType === 'exclude');
        on('filterSleep', mine && g.filterType === 'sleep');
        on('filterChannel', mine && g.filterChannelId);
        on('filterMarker', g.markerColor);
        on('filterNote', typeof g.filterNote === 'string' && g.filterNote.trim());
        for (const f of Array.isArray(g.filters) ? g.filters : []) {
            if (!f || DEFAULT_FILTER_IDS.has(f.id)) continue;
            const flag = CATEGORY_FLAG[f.category];
            if (flag) out[flag] = 1;
            on('filterPerson', f.userId);
        }
    }

    const archive = sanitizeArchiveSetting(s[ARCHIVE_SETTING_KEY]);
    on('archiveOn', archive.enabled);
    on('archiveDays', archive.days !== DEFAULT_ARCHIVE_SETTING.days);
    const off = s[CHANNEL_OFF_KEY];
    on('channelOff', off && typeof off === 'object' && Object.keys(off).length > 0);

    on('positionDown', s.position === 'down');
    on('chatTime', s.chatTime === 'on');
    on('maxChats', s.maximumNumberChats !== undefined && s.maximumNumberChats !== DEFAULT_MAX_CHATS);
    on('theme', s.darkTheme !== undefined && s.darkTheme !== 'system');
    on('markerOff', s.collectedChatMarker === 'off');
    on('jumpBottomOff', s.jumpToBottomButton === 'off');
    on('persistOff', s.chatPersistence === 'off');
    on('floatingBg', s.floatingBgColor);
    on('chatSideLeft', s.chzzkChatSide === 'left');
    on('pointBoxOff', s.pointBoxAuto === 'off');
    return out;
}
