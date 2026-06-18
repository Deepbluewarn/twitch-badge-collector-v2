/**
 * chzzk 도네이션 메시지 감시 — 첫 도네 발견 시 자동 dump.
 *
 * 사용:
 *  1. 도네이션 잘 들어오는 채널 라이브 페이지 열기
 *  2. 콘솔에 붙여넣고 Enter
 *  3. 도네 들어올 때까지 대기 (페이지 닫지 말 것)
 *  4. 첫 도네 감지 → 콘솔에 dump + clipboard 복사 + 감시 자동 종료
 *  5. dump 결과 전달
 *
 * MutationObserver로 새 chat 추가 감지. `_is_donation_` 가진 요소가 들어오면
 * 그 chat item 전체 outerHTML + 주요 selector 후보들 추출.
 */
(function () {
    const aside = document.getElementById('aside-chatting');
    if (!aside) {
        console.log('aside-chatting 못 찾음 — 라이브 페이지에서 실행하세요');
        return;
    }

    // chat 리스트 wrapper 찾기 (probe v2 결과 기반 구조)
    const wrapper = aside.querySelector('[class*="_wrapper_"][class*="_25"]')
        || aside.querySelector('[class*="_item_"]')?.parentElement;

    if (!wrapper) {
        console.log('chat wrapper 못 찾음');
        return;
    }

    console.log('[donation-watcher] 감시 시작. 도네 들어올 때까지 대기...');
    console.log('[donation-watcher] 대상 wrapper:', wrapper);

    let mo = null;
    let done = false;

    function checkForDonation(item) {
        if (done) return;
        // chat item이 _is_donation_ 가진 element를 포함하는지
        const donationEl = item.querySelector?.('[class*="_is_donation_"]');
        if (!donationEl) return;

        done = true;

        // 도네 item 내부 모든 _text_ 후보 dump
        const textCandidates = Array.from(item.querySelectorAll('[class*="_text_"]')).map(t => ({
            class: t.getAttribute('class') || '',
            tag: t.tagName.toLowerCase(),
            text: (t.textContent || '').trim().slice(0, 80),
            parentClass: t.parentElement?.getAttribute('class') || '',
        }));

        // 가장 가까운 chat container 안 모든 element class
        const allClasses = new Set();
        item.querySelectorAll('*').forEach(el => {
            const c = el.getAttribute('class') || '';
            c.split(/\s+/).filter(Boolean).forEach(x => allClasses.add(x));
        });

        const result = {
            itemHtml: item.outerHTML,
            donationElementClass: donationEl.getAttribute('class') || '',
            textCandidates,
            allClassesInItem: Array.from(allClasses).sort(),
        };

        console.log('=== TBC donation detected ===');
        console.log(JSON.stringify(result, null, 2));
        console.log('=== END ===');

        try {
            navigator.clipboard.writeText(JSON.stringify(result, null, 2));
            console.log('[복사됨]');
        } catch {}

        mo?.disconnect();
        return result;
    }

    // 기존 채팅 중에 이미 도네 있는지부터 검사
    aside.querySelectorAll('[class*="_item_"]').forEach(checkForDonation);

    if (done) return;

    // 새로 추가되는 chat 감시
    mo = new MutationObserver((records) => {
        records.forEach(r => {
            r.addedNodes.forEach(n => {
                if (n.nodeType !== 1) return;
                checkForDonation(n);
                n.querySelectorAll?.('[class*="_item_"]').forEach(checkForDonation);
            });
        });
    });
    mo.observe(wrapper, { childList: true, subtree: true });

    // 10분 timeout으로 자동 종료 (메모리 leak 방지)
    setTimeout(() => {
        if (!done) {
            mo?.disconnect();
            console.log('[donation-watcher] 10분 동안 도네 없음 → 감시 종료');
        }
    }, 10 * 60 * 1000);
})();
