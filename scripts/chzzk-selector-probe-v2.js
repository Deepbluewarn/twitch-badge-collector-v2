/**
 * chzzk 신 DOM probe v2 — React props 기반 chat node 발견.
 *
 * v1 결과: class에서 semantic 이름이 완전히 제거됨 (`_container_1qgfi_2` 같은
 * 의미 없는 generic name만 남음). class 기반 selector 매칭 불가.
 *
 * v2 전략:
 *  - React fiber/props는 chzzk가 안 바꿨을 가능성 큼 (props.chatMessage 등).
 *  - chatMessage 가진 element 찾아 chat 노드 위치 + 조상 chain 추적.
 *  - 거기서 chat list wrapper / username 등 구조적 위치 파악.
 *  - 그 외 ID/aria-label/data-* 등 hash-proof 앵커 dump.
 *
 * 사용법: chzzk 라이브 페이지 콘솔에 붙여넣기.
 */
(function () {
    /** React fiber에서 props 추출 — getReactProps와 같은 패턴. */
    function getReactProps(node) {
        if (!node) return null;
        const key = Object.keys(node).find(k =>
            k.startsWith('__reactProps$') || k.startsWith('__reactInternalInstance$')
        );
        return key ? node[key] : null;
    }

    /** element가 React props에 chatMessage 가지는지. */
    function hasChatMessage(el) {
        const p = getReactProps(el);
        if (!p) return false;
        // children.props.chatMessage 또는 직접 chatMessage
        return !!(p?.children?.props?.chatMessage || p?.chatMessage);
    }

    /** element의 id + aria-label + 첫 2개 class + tag를 요약. */
    function describe(el) {
        if (!el) return null;
        const cls = Array.from(el.classList).slice(0, 3);
        return {
            tag: el.tagName.toLowerCase(),
            id: el.id || undefined,
            aria: el.getAttribute('aria-label') || undefined,
            classes: cls.length ? cls : undefined,
            childCount: el.children.length,
        };
    }

    // 1) chatMessage 가진 element 모두 스캔.
    const chatNodes = [];
    document.querySelectorAll('*').forEach(el => {
        if (hasChatMessage(el)) chatNodes.push(el);
    });

    const chatSample = chatNodes[0] || null;
    const chatAncestorChain = [];
    if (chatSample) {
        let cur = chatSample;
        for (let i = 0; i < 10 && cur; i++) {
            chatAncestorChain.push(describe(cur));
            cur = cur.parentElement;
        }
    }

    // 2) chat sample 내부 구조 — username/text/badge 등 위치 추정.
    const chatInner = chatSample ? Array.from(chatSample.querySelectorAll('*')).slice(0, 30).map(describe) : [];

    // 3) ID 가진 element 전체 list (top-level 앵커).
    const idElements = Array.from(document.querySelectorAll('[id]')).map(el => ({
        id: el.id,
        tag: el.tagName.toLowerCase(),
        aria: el.getAttribute('aria-label') || undefined,
    })).filter(e => !e.id.startsWith('tbc-') && !e.id.startsWith('chzzk-container')); // 우리 자체 ID 제외

    // 4) aria-label 가진 element 모두.
    const ariaElements = Array.from(document.querySelectorAll('[aria-label]')).map(el => ({
        aria: el.getAttribute('aria-label'),
        tag: el.tagName.toLowerCase(),
        id: el.id || undefined,
    }));

    // 5) aside-chatting 자식 구조 (채팅 패널 전체).
    const aside = document.getElementById('aside-chatting');
    const asideTree = aside ? walkTree(aside, 0, 4) : null;
    function walkTree(el, depth, maxDepth) {
        if (depth > maxDepth) return null;
        return {
            ...describe(el),
            depth,
            children: Array.from(el.children).slice(0, 8).map(c => walkTree(c, depth + 1, maxDepth)).filter(Boolean),
        };
    }

    // 6) 포인트 버튼 후보 — text content "포인트" 또는 비슷.
    const pointButtonCandidates = Array.from(document.querySelectorAll('button')).filter(b => {
        const t = (b.textContent || '').trim();
        return /포인트|적립|받기/.test(t) || b.getAttribute('aria-label')?.includes('포인트');
    }).map(describe);

    const result = {
        chatNodeCount: chatNodes.length,
        chatSample: describe(chatSample),
        chatAncestorChain,
        chatInnerSample: chatInner,
        idElements,
        ariaElements,
        asideChatTree: asideTree,
        pointButtonCandidates,
    };

    console.log('=== TBC chzzk probe v2 ===');
    console.log(JSON.stringify(result, null, 2));
    console.log('=== END v2 ===');

    try {
        navigator.clipboard.writeText(JSON.stringify(result, null, 2));
        console.log('[복사됨]');
    } catch {}

    return result;
})();
