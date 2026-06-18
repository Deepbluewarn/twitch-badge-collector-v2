/**
 * chzzk probe v3 — 배지/도네/인증/풀스크린 등 추가 정보 수집.
 *
 * v2 결과로 chat 구조 매핑은 끝났음. 누락된 것들:
 *  - 배지 (badge): 현재 채팅 목록에 배지 있는 사용자 있으면 잡힘
 *  - 도네이션 (donation): 도네 채팅 있을 때만
 *  - 인증마크 (verified): 인증 사용자 채팅 있을 때만
 *  - 풀스크린 folded: 풀스크린 진입했을 때만
 *  - hash group 전체 분석: 같은 hash 가진 class들 모아서 semantic 매핑
 *
 * 사용법: chzzk 라이브 페이지 콘솔에 붙여넣기.
 */
(function () {
    const aside = document.getElementById('aside-chatting');
    if (!aside) {
        console.log('aside-chatting 못 찾음');
        return;
    }

    // 1) hash 그룹 dump — 같은 hash 공유하는 class들 묶기.
    // `_name_hash_n` 패턴에서 hash 추출.
    const groups = new Map(); // hash → Set<class>
    document.querySelectorAll('*').forEach(el => {
        el.classList.forEach(c => {
            const m = c.match(/^_(.+?)_([a-z0-9]{4,7})_\d+$/i);
            if (!m) return;
            const hash = m[2];
            if (!groups.has(hash)) groups.set(hash, new Set());
            groups.get(hash).add(c);
        });
    });
    const groupsOut = {};
    for (const [hash, set] of groups) {
        const arr = Array.from(set).sort();
        if (arr.length >= 3) groupsOut[hash] = arr; // 의미 있는 group만
    }

    // 2) chat items 안 모든 unique class 수집 + 의미 추출.
    const chatItems = aside.querySelectorAll('[class*="_item_"]');
    const classesInItems = new Set();
    chatItems.forEach(it => {
        it.querySelectorAll('*').forEach(el => {
            el.classList.forEach(c => classesInItems.add(c));
        });
        it.classList.forEach(c => classesInItems.add(c));
    });
    const itemClasses = Array.from(classesInItems).sort();

    // SVG의 className은 string이 아닌 SVGAnimatedString — getAttribute('class')로 안전 접근.
    const cls = (el) => (el && el.getAttribute && el.getAttribute('class')) || '';

    // 3) 배지/이미지 후보 — chat item 안 img + class에 badge 들어간 element.
    const badgeRelated = new Set();
    chatItems.forEach(it => {
        it.querySelectorAll('img').forEach(img => {
            badgeRelated.add(`IMG src=${(img.src || '').slice(0, 80)} class=${cls(img).slice(0, 80)} parentClass=${cls(img.parentElement).slice(0, 80)}`);
        });
        it.querySelectorAll('[class*="badge"], [class*="_badge"], [class*="Badge"]').forEach(el => {
            badgeRelated.add(`EL ${el.tagName.toLowerCase()} class=${cls(el).slice(0, 100)} html=${el.outerHTML.slice(0, 120)}`);
        });
    });

    // 4) 인증마크 후보 — _icon_, _verified_, name_icon 등.
    const verifiedCandidates = new Set();
    chatItems.forEach(it => {
        it.querySelectorAll('[class*="_icon"], [class*="_verified"], [class*="_official"]').forEach(el => {
            verifiedCandidates.add(`${el.tagName.toLowerCase()} class=${cls(el).slice(0, 100)}`);
        });
    });

    // 5) 도네이션 후보 — _donation_ 들어간 모든 element.
    const donationCandidates = Array.from(document.querySelectorAll('[class*="_donation_"]')).slice(0, 20).map(el => ({
        tag: el.tagName.toLowerCase(),
        classes: Array.from(el.classList).slice(0, 4),
        text: (el.textContent || '').trim().slice(0, 60),
    }));

    // 6) 포인트/적립 관련 button 후보 확장 — text + aria + class에 point/power 들어간 거.
    const pointCandidates = Array.from(document.querySelectorAll('button')).filter(b => {
        const t = (b.textContent || '').trim();
        const aria = b.getAttribute('aria-label') || '';
        return /포인트|적립|받기|point|power/i.test(t + ' ' + cls(b) + ' ' + aria);
    }).map(b => ({
        tag: 'button',
        classes: Array.from(b.classList).slice(0, 5),
        aria: b.getAttribute('aria-label') || undefined,
        text: (b.textContent || '').trim().slice(0, 60),
    }));

    // 7) aside-chatting 현재 class — 풀스크린 비교용 baseline.
    const asideClasses = Array.from(aside.classList);

    // 8) chat item 1개 전체 outerHTML (badge 구조 직접 확인용) — 너무 길지 않게.
    const sampleItem = chatItems[0]?.outerHTML?.slice(0, 1500) ?? null;
    const sampleItemBadged = Array.from(chatItems).find(it =>
        it.querySelector('img') || it.querySelector('[class*="badge"], [class*="_badge"]')
    )?.outerHTML?.slice(0, 1500) ?? null;

    const result = {
        hashGroups: groupsOut,
        itemClassesUnique: itemClasses,
        badgeRelated: Array.from(badgeRelated),
        verifiedCandidates: Array.from(verifiedCandidates),
        donationCandidates,
        pointCandidates,
        asideClasses,
        sampleItem,
        sampleItemBadged,
    };

    console.log('=== TBC chzzk probe v3 ===');
    console.log(JSON.stringify(result, null, 2));
    console.log('=== END v3 ===');

    try {
        navigator.clipboard.writeText(JSON.stringify(result, null, 2));
        console.log('[복사됨]');
    } catch {}
    return result;
})();
