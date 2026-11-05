/**
 * 익명 사용 통계에 보내는 항목 목록. 확장, 사이트 ping.ts, ovm 리포트(ops/usage-report.ts)가 같은 목록을 쓴다.
 * ovm이 그대로 가져다 쓰므로 이 파일엔 import를 두지 않는다.
 */

// 하루 기록의 항목(그날 했는지). 사이트 리포 functions/api/ping.ts의 DAY_FLAGS와 같은 목록, 같은 순서. 뒤에만 덧붙인다.
// firstWeek, firstMonth와 합쳐 Analytics Engine 한 행의 숫자 칸(20개)에 맞춘다. 넘기면 서버가 다음 행으로 나눈다.
export const USAGE_FLAGS = [
    'twitch',
    'chzzk',
    'collected',
    'vod',
    'filterEdit',
    'templateEdit',
    'archiveOpen',
    'archiveSearch',
    'archiveExport',
    'capture',
    'settingOpen',
    'popupOpen',
    'clearChats',
    'ratioReset',
    'resize',
    'jumpBottom',
    'copyId',
    'channelToggle',
] as const;
export type UsageFlag = typeof USAGE_FLAGS[number];

// 주간 기록의 항목(설정을 기본값에서 바꿨는지). 사이트 리포 functions/api/ping.ts의 WEEK_FLAGS와 같은 목록, 같은 순서. 뒤에만 덧붙인다.
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
