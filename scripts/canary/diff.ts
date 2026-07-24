/**
 * Canary 스냅샷 diff + auto-fix 후보 도출.
 *
 * class hash 접미사 rotation만 auto-PR 대상. 다른 유형은 알림만.
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

    // sample skeleton의 chzzk-style hash class fingerprint diff — required selector가
    // 안 깨졌어도 chzzk가 컴포넌트 추가/개편했는지 감지. ponytail: 샘플 chat 종류
    // (배지 유무 등) 따라 fingerprint가 흔들려 노이즈 여지. 노이즈 크면 채널별 union으로 업그레이드.
    const baseFp = hashClassSet(baseline.sampleSkeleton);
    const curFp = hashClassSet(current.sampleSkeleton);
    const added = [...curFp].filter(c => !baseFp.has(c));
    const removed = [...baseFp].filter(c => !curFp.has(c));
    if (added.length > 0 || removed.length > 0) {
        const preview = [...added.map(c => `+${c}`), ...removed.map(c => `-${c}`)].slice(0, 6).join(' ');
        alerts.push(`sample skeleton class 변화 (+${added.length}/-${removed.length}): ${preview}`);
    }

    // selector별 pass→fail 감지
    const byName = new Map(baseline.selectors.map(s => [s.name, s]));
    for (const cur of current.selectors) {
        const base = byName.get(cur.name);
        if (!base) continue;
        // required이면서 이전엔 >0 지금 0
        if (cur.required && base.count > 0 && cur.count === 0) {
            brokenRequired.push(cur);
            // auto-fix 후보 탐지: selector string 내 class hash 후보 뽑아
            // 현재 스냅샷의 matchedClasses나 sampleSkeleton에서 같은 "base word"를 찾음
            const candidate = tryAutoFix(cur, base, current);
            if (candidate) {
                autoFixCandidates.push(candidate);
            } else {
                alerts.push(`selector "${cur.name}" 깨짐 — auto-fix 후보 못 찾음. 사람 리뷰 필요.`);
            }
        }
    }

    const changed = brokenRequired.length > 0 || autoFixCandidates.length > 0 || alerts.length > 0;
    return { changed, brokenRequired, autoFixCandidates, alerts };
}

/**
 * skeleton HTML 안에서 chzzk-style CSS-in-JS 해시 클래스만 뽑음.
 * 예: `_container_zw6kq_2`, `_chatting_message_ca0ha_21`. utility/우리 클래스는 배제.
 */
function hashClassSet(skeleton: string | null): Set<string> {
    if (!skeleton) return new Set();
    const set = new Set<string>();
    const re = /_[a-z]+_[a-z0-9]{4,}_\d+/gi;
    for (const m of skeleton.matchAll(re)) set.add(m[0]);
    return set;
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
    // selector string에서 `_word_hash_` 패턴 추출
    // 예: `[class*="_container_o04z9_"]` → base=`_container_`, hash=`o04z9`
    const hashRe = /_([a-z]+)_([a-z0-9]{4,})_/gi;
    const oldMatches = Array.from(broken.selector.matchAll(hashRe));
    if (oldMatches.length === 0) return null;

    if (!currentSnap.sampleSkeleton) return null;

    // 각 old (word, hash) 페어에 대해 skeleton에서 같은 word + 다른 hash 찾기
    let newSelector = broken.selector;
    const substitutions: Array<{ from: string; to: string; word: string }> = [];

    for (const m of oldMatches) {
        const [, word, oldHash] = m;
        // skeleton class attribute 안에서 `_{word}_{someHash}_` 찾기
        const skeletonRe = new RegExp(`_${word}_([a-z0-9]{4,})_`, 'gi');
        const candidates = new Set<string>();
        for (const km of currentSnap.sampleSkeleton.matchAll(skeletonRe)) {
            if (km[1] !== oldHash) candidates.add(km[1]);
        }
        if (candidates.size !== 1) continue; // 0개거나 여러 개면 애매 → skip
        const newHash = candidates.values().next().value!;
        substitutions.push({ from: `_${word}_${oldHash}_`, to: `_${word}_${newHash}_`, word });
        newSelector = newSelector.split(`_${word}_${oldHash}_`).join(`_${word}_${newHash}_`);
    }

    if (substitutions.length === 0) return null;

    return {
        selectorName: broken.name,
        oldSelector: broken.selector,
        newSelector,
        reason: substitutions.map(s => `${s.from} → ${s.to}`).join(', '),
    };
}
