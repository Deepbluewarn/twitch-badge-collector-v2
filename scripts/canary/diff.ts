/**
 * Canary 스냅샷 diff + auto-fix 후보 도출.
 *
 * class hash 접미사 rotation만 auto-fix 대상. 깨짐, 갈래 사망 판정은 judge.ts가 방송 전체로 한다.
 * 예: `_container_o04z9_` → `_container_zw6kq_` (앞 word 같음, hash만 다름)
 */
import type { CanarySnapshot, SelectorSample } from './snapshot-types';

export interface DiffResult {
    /** 새 스냅샷이 baseline과 동일한가 */
    changed: boolean;
    /** required selector 중 count가 >0에서 0으로 떨어진 것 */
    brokenRequired: SelectorSample[];
    /** 자동 fix 가능 후보. baseline과 비교해 "class hash만 rotate"된 케이스. */
    autoFixCandidates: AutoFixCandidate[];
    /** 그 외 알림 필요 사유 (구조 변경, anchor 하락 등) */
    alerts: string[];
}

export interface AutoFixCandidate {
    /** 어느 selector가 대상인지 (selectors JSON key) */
    selectorName: string;
    /** 옛 selector string */
    oldSelector: string;
    /** 새로 제안하는 selector string */
    newSelector: string;
    /** 감지 근거 요약 */
    reason: string;
}

/**
 * baseline == null이면 첫 실행. 그땐 diff 없이 스냅샷만 저장.
 */
export function diffSnapshots(baseline: CanarySnapshot | null, current: CanarySnapshot): DiffResult {
    if (!baseline) {
        return { changed: true, brokenRequired: [], autoFixCandidates: [], alerts: ['initial snapshot'] };
    }

    const alerts: string[] = [];
    const brokenRequired: SelectorSample[] = [];
    const autoFixCandidates: AutoFixCandidate[] = [];

    // anchor layer 하락 = 채팅창 selector 자체 위기
    if (baseline.anchorLayer !== current.anchorLayer && current.anchorLayer !== 'L1') {
        alerts.push(`anchor layer 하락: ${baseline.anchorLayer} → ${current.anchorLayer}`);
    }

    // selector별 pass→fail 감지. baseline엔 count 대신 present(boolean)만 있을 수 있음
    // (persist 시 strip). 옛 baseline과 호환 위해 둘 다 지원.
    const byName = new Map(baseline.selectors.map(s => [s.name, s]));
    for (const cur of current.selectors) {
        const base = byName.get(cur.name);
        if (!base) continue;
        const wasPresent = base.present !== undefined ? base.present : (base.count ?? 0) > 0;
        // required이면서 이전엔 present 지금 0
        if (cur.required && wasPresent && cur.count === 0) {
            brokenRequired.push(cur);
            // auto-fix 후보 탐지: selector string 내 class hash 후보 뽑아
            // 현재 스냅샷의 matchedClasses나 sampleSkeleton에서 같은 "base word"를 찾음
            const candidate = tryAutoFix(cur, base, current);
            if (candidate) autoFixCandidates.push(candidate);
        }
    }

    const changed = brokenRequired.length > 0 || autoFixCandidates.length > 0 || alerts.length > 0;
    return { changed, brokenRequired, autoFixCandidates, alerts };
}

/**
 * 깨진 selector에서 class hash pattern (`_word_hash_`)을 뽑아, 현재 스냅샷의 sample
 * skeleton 안에서 같은 word로 시작하지만 hash가 다른 클래스를 찾음.
 * 정확히 하나 있으면 auto-fix 후보.
 */
function tryAutoFix(
    broken: SelectorSample,
    _baseline: SelectorSample,
    currentSnap: CanarySnapshot,
): AutoFixCandidate | null {
    // 1순위: 봇이 라이브 DOM에서 직접 검증한 후보. cardinality 채점을 통과한 것만
    // 실려 오므로 "매칭은 되는데 엉뚱한 노드" 오답이 이미 걸러진 상태다.
    const probes = broken.candidates ?? [];
    if (probes.length > 0 && broken.selector) {
        const best = probes[0];
        // 최고점이 유일하지 않으면(동점 복수) 사람이 봐야 한다 — 자동 치환은 위험.
        const tied = probes.filter(p => p.score === best.score);
        if (tied.length === 1) {
            return {
                selectorName: broken.name,
                oldSelector: broken.selector,
                newSelector: best.selector,
                reason: `${best.replaced} (라이브 검증: 문서 ${best.docCount}건, 점수 ${best.score.toFixed(2)})`,
            };
        }
        return null;
    }

    // 2순위(구 경로): 후보 probe가 없는 스냅샷 — skeleton에서 hash만 유추.
    // 같은 word의 hash 후보가 여러 개면 판단 불가라 포기한다.
    const brokenSelector = broken.selector;
    if (!brokenSelector) return null;
    const hashRe = /_([a-z]+)_([a-z0-9]{4,})_/gi;
    const oldMatches = Array.from(brokenSelector.matchAll(hashRe));
    if (oldMatches.length === 0) return null;
    if (!currentSnap.sampleSkeleton) return null;

    let newSelector = brokenSelector;
    const substitutions: Array<{ from: string; to: string; word: string }> = [];

    for (const m of oldMatches) {
        const [, word, oldHash] = m;
        const skeletonRe = new RegExp(`_${word}_([a-z0-9]{4,})_`, 'gi');
        const candidates = new Set<string>();
        for (const km of currentSnap.sampleSkeleton.matchAll(skeletonRe)) {
            if (km[1] !== oldHash) candidates.add(km[1]);
        }
        if (candidates.size !== 1) continue;
        const newHash = candidates.values().next().value!;
        substitutions.push({ from: `_${word}_${oldHash}_`, to: `_${word}_${newHash}_`, word });
        newSelector = newSelector.split(`_${word}_${oldHash}_`).join(`_${word}_${newHash}_`);
    }

    if (substitutions.length === 0) return null;

    return {
        selectorName: broken.name,
        oldSelector: brokenSelector,
        newSelector,
        reason: substitutions.map(s => `${s.from} → ${s.to}`).join(', '),
    };
}
