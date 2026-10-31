/**
 * 치지직 인증 마크 — 파트너, 챌린저, 공식 세 종류 (host 번들의 verifiedMarkType과 이미지 표 그대로, 2026-10-31).
 *
 * 필터는 배지를 이미지 URL 문자열로 비교한다. 인증 마크는 host 채팅에 <img>가 없어서(CSS 배경) 우리가
 * 종류에 맞는 URL을 배지 목록에 넣고, 그 URL이 곧 필터의 이름표가 된다. 그래서 이 URL들은 필터에 저장된
 * 값과 같아야 한다 — 바꾸면 저장된 필터가 안 걸린다. OTA로 받지 않고 여기 고정한다.
 *
 * 예전(2.24 이하)엔 종류 없이 "인증 마크" 하나였다(이름표는 공식 마크 URL). 그때의 인증 마크가 지금의 파트너
 * 마크라, 그 필터는 업데이트 때 파트너 마크로 바꾼다 (migrateVerifiedMarkFilters).
 */
export const VERIFIED_MARK_TYPES = ['PARTNER', 'CHALLENGER', 'OFFICIAL'] as const;
export type VerifiedMarkType = typeof VERIFIED_MARK_TYPES[number];

const BASE = 'https://ssl.pstatic.net/static/nng/glive/image';
export const VERIFIED_MARK_URL: Record<VerifiedMarkType, string> = {
    PARTNER: `${BASE}/icon_partner_mark.png`,
    CHALLENGER: `${BASE}/icon_challenger_mark.png`,
    OFFICIAL: `${BASE}/icon_official_mark.png`,
};

/** 배지 목록(data/chzzk-badges.json)의 이름 — 필터에는 `역할: 이름`으로 저장된다. */
export const VERIFIED_MARK_NAME: Record<VerifiedMarkType, string> = {
    PARTNER: '파트너 마크',
    CHALLENGER: '챌린저 마크',
    OFFICIAL: '공식 마크',
};
export const VERIFIED_MARK_GROUP = '역할';
/** 종류가 나뉘기 전의 이름. 지금의 파트너 마크에 해당한다. */
export const LEGACY_VERIFIED_MARK_NAME = '인증 마크';

export function isVerifiedMarkType(v: unknown): v is VerifiedMarkType {
    return typeof v === 'string' && (VERIFIED_MARK_TYPES as readonly string[]).includes(v);
}

/** 종류를 모르면(예전 데이터, host 구조 변경) 파트너 마크로 본다 — 가장 흔하고, 나뉘기 전의 인증 마크다. */
export function verifiedMarkUrl(type: VerifiedMarkType | null | undefined): string {
    return VERIFIED_MARK_URL[type ?? 'PARTNER'];
}
