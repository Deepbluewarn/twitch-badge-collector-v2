/**
 * chzzk probe v4 — fullscreen folded / verified / VOD 페이지 / player.
 *
 * 사용 시나리오:
 *  A. 라이브 페이지에서:
 *     1) 평소 상태 - 콘솔에 붙여넣기 (baseline aside class 수집)
 *     2) 풀스크린 진입 - 다시 붙여넣기 (folded 시 aside class 비교)
 *     3) 인증마크 사용자 채팅 떠 있을 때 (또는 도네이션 메시지) - dump
 *
 *  B. VOD 페이지(`/video/번호`)에서 콘솔에 붙여넣기 - chatRoomVod 매핑
 */
(function () {
    const isVod = location.pathname.startsWith('/video/');
    const aside = document.getElementById('aside-chatting');

    // 1) aside-chatting 현재 class — folded 비교용
    const asideClasses = aside ? Array.from(aside.classList) : null;
    const isFullscreen = !!document.fullscreenElement;

    // 2) verified 마크 후보 — chat 안에서 blind text "인증 마크" 찾기
    const verifiedHits = [];
    document.querySelectorAll('[class*="_is_message_"] [class*="_icon_"]').forEach(el => {
        const blind = el.querySelector('.blind');
        const blindText = blind?.textContent || '';
        verifiedHits.push({
            iconClass: el.getAttribute('class') || '',
            blindText: blindText.slice(0, 30),
            html: el.outerHTML.slice(0, 200),
        });
    });

    // 3) "인증 마크" 텍스트로 직접 검색
    const allBlinds = Array.from(document.querySelectorAll('.blind'));
    const verifiedBlinds = allBlinds
        .filter(el => /인증/.test(el.textContent || ''))
        .slice(0, 5)
        .map(el => ({
            text: (el.textContent || '').trim().slice(0, 30),
            parentClass: el.parentElement?.getAttribute('class') || '',
            parentTag: el.parentElement?.tagName.toLowerCase(),
            grandparentClass: el.parentElement?.parentElement?.getAttribute('class') || '',
            html: el.parentElement?.outerHTML.slice(0, 300) || '',
        }));

    // 4) VOD 모드면 chat list / video element 후보
    let vodInfo = null;
    if (isVod) {
        const candidates = {};
        // VOD 채팅 리스트는 ID 또는 별도 class. aside-chatting일 수도, 아닐 수도.
        candidates.aside = aside ? 'exists' : 'missing';
        candidates.layoutBody = !!document.getElementById('layout-body');
        // 채팅 후보 - 같은 React props 패턴
        function hasChatMessage(el) {
            const k = Object.keys(el).find(k => k.startsWith('__reactProps$'));
            if (!k) return false;
            const p = el[k];
            return !!(p?.children?.props?.chatMessage || p?.chatMessage);
        }
        let chatNodes = 0;
        const sample = (() => {
            for (const el of document.querySelectorAll('*')) {
                if (hasChatMessage(el)) {
                    chatNodes++;
                    if (chatNodes === 1) return el;
                }
            }
            return null;
        })();
        candidates.chatNodeCount = chatNodes;
        candidates.chatSampleAncestors = [];
        if (sample) {
            let cur = sample;
            for (let i = 0; i < 10 && cur; i++) {
                candidates.chatSampleAncestors.push({
                    tag: cur.tagName?.toLowerCase(),
                    id: cur.id || undefined,
                    classes: (cur.getAttribute && cur.getAttribute('class'))?.split(/\s+/).slice(0, 3),
                });
                cur = cur.parentElement;
            }
        }
        // chzzk 자체 video 태그 위치
        const videos = Array.from(document.querySelectorAll('video')).map(v => {
            let chain = [];
            let cur = v.parentElement;
            for (let i = 0; i < 6 && cur; i++) {
                chain.push({
                    tag: cur.tagName.toLowerCase(),
                    id: cur.id || undefined,
                    cls: (cur.getAttribute('class') || '').slice(0, 80),
                });
                cur = cur.parentElement;
            }
            return { src: v.currentSrc?.slice(0, 50), ancestors: chain };
        });
        candidates.videos = videos;
        vodInfo = candidates;
    }

    // 5) 도네이션 메시지 풀 dump — '_is_donation_' 가진 element의 형제/조상
    const donationItems = [];
    document.querySelectorAll('[class*="_is_donation_"]').forEach(el => {
        const item = el.closest('[class*="_item_"]');
        if (item && !donationItems.some(i => i.itemHtml === item.outerHTML)) {
            donationItems.push({
                itemHtml: item.outerHTML.slice(0, 2000),
            });
        }
    });

    const result = {
        isVod,
        isFullscreen,
        asideClasses,
        verifiedHits,
        verifiedBlinds,
        donationItems: donationItems.slice(0, 2),
        vodInfo,
    };

    console.log('=== TBC chzzk probe v4 ===');
    console.log(JSON.stringify(result, null, 2));
    console.log('=== END v4 ===');

    try {
        navigator.clipboard.writeText(JSON.stringify(result, null, 2));
        console.log('[복사됨]');
    } catch {}
    return result;
})();
