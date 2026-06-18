/**
 * chzzk 신 DOM class 매핑 추출 스크립트.
 *
 * 사용법:
 *  1. https://chzzk.naver.com/live/<채널> 진입 (채팅 떠 있는 상태)
 *  2. devtools 콘솔 열기
 *  3. 이 파일 내용 전체 붙여넣고 Enter
 *  4. 결과 JSON을 복사해서 전달
 *
 * 동작:
 *  - 각 old selector의 semantic 이름 추출 (예: live_chatting_list_wrapper).
 *  - DOM의 모든 class를 스캔해 해당 semantic 이름을 substring으로 포함한 후보 출력.
 *  - exact match가 있으면 1순위, 아니면 후보 나열.
 *  - 신 패턴(_name_hash_num) / 구 패턴(name__hash) / 변형 모두 잡힘.
 */
(function () {
    const OLD_SELECTORS = {
        chatRoomLive: 'live_chatting_list_wrapper__a5XTV',
        chatRoomVod: 'vod_chatting_list__+LZHw',
        displayName: 'name_text__yQG50',
        messageText: 'live_chatting_message_text__DyleH',
        donationText: 'live_chatting_donation_message_text__XbDKP',
        badge: 'badge_container__a64XB',
        verifiedIcon: 'name_icon__zdbVH',
        usernameContainer: 'live_chatting_username_container__m1-i5',
        usernameContainerMsg: 'live_chatting_username_is_message__jvTvP',
        popupProfileHeader: 'live_chatting_popup_profile_header__OWnnU',
        pointButton: 'live_chatting_power_button__Ov3eJ',
        foldedClassPrefix: 'live_chatting_is_folded',
    };

    /** 클래스 풀 캡쳐 — DOM 전체 element의 classList 모두 수집. */
    const allClasses = new Set();
    document.querySelectorAll('*').forEach(el => {
        el.classList.forEach(c => allClasses.add(c));
    });
    const classArr = Array.from(allClasses);

    /** semantic 이름 추출 — 구 `name__hash` / 신 `_name_hash_n` / 그 외 변형. */
    function semantic(oldClass) {
        // 구 패턴: prefix__hash → prefix
        if (/__[A-Za-z0-9+/=_-]{3,}$/.test(oldClass)) {
            return oldClass.replace(/__[A-Za-z0-9+/=_-]{3,}$/, '');
        }
        return oldClass; // prefix 그 자체 (foldedClassPrefix 등)
    }

    /** 신 클래스명에서 semantic 추출 — `_name_hash_n` → `name` */
    function newSemantic(cls) {
        // _name_xxxxx_n
        const m = cls.match(/^_(.+?)_[A-Za-z0-9]+_\d+$/);
        if (m) return m[1];
        // _name_xxxxx (no trailing number)
        const m2 = cls.match(/^_(.+?)_[A-Za-z0-9]{4,}$/);
        if (m2) return m2[1];
        // 구 패턴
        return semantic(cls);
    }

    const result = {};

    for (const [key, oldFull] of Object.entries(OLD_SELECTORS)) {
        const sem = semantic(oldFull);
        const exact = classArr.includes(oldFull);
        // semantic 이름 substring 후보
        const substringHits = classArr.filter(c => c !== oldFull && c.includes(sem));
        // 신 패턴에서 semantic == sem 인 후보
        const newSemanticHits = classArr.filter(c => c.startsWith('_') && newSemantic(c) === sem);
        // 합치고 dedupe + sort
        const candidates = Array.from(new Set([...newSemanticHits, ...substringHits])).sort();

        result[key] = {
            old: oldFull,
            semantic: sem,
            exactMatchExists: exact,
            candidates: candidates.slice(0, 10), // 너무 많으면 cap
            sampleElements: candidates.slice(0, 3).map(c => {
                const el = document.querySelector(`.${CSS.escape(c)}`);
                if (!el) return null;
                return {
                    class: c,
                    tag: el.tagName.toLowerCase(),
                    childCount: el.children.length,
                    text: (el.textContent || '').trim().slice(0, 60),
                };
            }).filter(Boolean),
        };
    }

    // foldedClassPrefix 별도 처리: aside의 classList 확인
    const aside = document.getElementById('aside-chatting');
    result.asideChattingClasses = aside ? Array.from(aside.classList) : null;

    console.log('=== TBC chzzk selector probe ===');
    console.log(JSON.stringify(result, null, 2));
    console.log('=== END ===');

    // 복사 편의 — clipboard에 자동 복사
    try {
        const text = JSON.stringify(result, null, 2);
        navigator.clipboard.writeText(text).then(
            () => console.log('[복사됨] 결과가 클립보드에 복사되었습니다.'),
            () => console.log('[복사 실패] 위 출력을 수동으로 복사해 주세요.'),
        );
    } catch { /* 무시 */ }

    return result;
})();
