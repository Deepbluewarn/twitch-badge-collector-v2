import { nanoid } from 'nanoid';
import { AtomicFilterElement, CompositeFilterElement, FilterCategoryArr, TypeArr } from '@/interfaces/filter';
import { atomicFiltersEqual } from '@/utils/utils-common';
import { migrateVerifiedMarkFilters } from './verified-migration';

export type ParsedFilterImport =
    | { ok: true; list: CompositeFilterElement[]; skipped: number }
    | { ok: false };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const nonEmptyString = (v: unknown): v is string => typeof v === 'string' && v !== '';

function toAtomic(v: unknown): AtomicFilterElement | null {
    if (!isObject(v)) return null;
    if (!FilterCategoryArr.includes(v.category as never) || !TypeArr.includes(v.type as never)) return null;
    if (!nonEmptyString(v.value)) return null;
    return { ...v, id: nonEmptyString(v.id) ? v.id : nanoid() } as AtomicFilterElement;
}

function toComposite(v: unknown): CompositeFilterElement | null {
    if (!isObject(v)) return null;
    if (!nonEmptyString(v.id) || !TypeArr.includes(v.filterType as never)) return null;
    if (v.platform !== 'chzzk' && v.platform !== 'twitch') return null;
    if (!Array.isArray(v.filters) || v.filters.length === 0) return null;
    const filters = v.filters.map(toAtomic);
    if (filters.some(f => f === null)) return null;
    return { ...v, filterNote: typeof v.filterNote === 'string' ? v.filterNote : '', filters } as CompositeFilterElement;
}

/**
 * 필터 백업 파일(.tbc)을 읽는다. JSON 배열이 아니면 실패. 형식이 틀린 항목은 버리고 개수만 센다 —
 * 그대로 넣으면 채팅마다 판정에서 던지거나(값이 문자열이 아닐 때) 엉뚱한 채팅이 걸린다.
 */
export function parseFilterImport(text: string): ParsedFilterImport {
    let raw: unknown;
    try { raw = JSON.parse(text); } catch { return { ok: false }; }
    if (!Array.isArray(raw)) return { ok: false };
    const valid = raw.map(toComposite).filter((c): c is CompositeFilterElement => c !== null);
    // 예전 백업의 "인증 마크"(종류 구분 전)는 파트너 마크로 바꿔 넣는다
    return { ok: true, list: migrateVerifiedMarkFilters(valid).list, skipped: raw.length - valid.length };
}

/** 지금 플랫폼의 필터를 가져온 것으로 바꾼다. 다른 플랫폼 필터는 그대로, 가져온 것끼리 겹치면 하나만. */
export function replacePlatformFilters(current: CompositeFilterElement[], imported: CompositeFilterElement[], platform: CompositeFilterElement['platform']): CompositeFilterElement[] {
    const next = current.filter(f => f.platform !== platform);
    for (const f of imported) {
        if (f.platform !== platform) continue;
        const dup = next.some(af =>
            af.platform === f.platform &&
            (af.filterChannelId ?? '') === (f.filterChannelId ?? '') &&
            atomicFiltersEqual(af.filters, f.filters));
        if (!dup) next.push(f);
    }
    return next;
}
