import { toBlob } from 'html-to-image';

/**
 * 채팅 이미지 캡쳐.
 *
 * 핵심 전략:
 *  - 캡쳐 대상은 선택된 채팅 element만. visible 채팅 컨테이너 자체를 toPng에
 *    넘기되, html-to-image의 `filter` 옵션으로 비선택 채팅을 clone 단계에서 제외.
 *  - 선택된 채팅 안의 <img>는 background fetch로 미리 data URL로 swap (inlineImages).
 *    호스트 페이지 컨텍스트의 fetch는 CORS로 막히고, html-to-image 기본 fetch도
 *    동일 제약을 받기 때문 — 확장 background만 host_permissions로 우회 가능.
 *  - cacheBust는 끔. 활성화하면 URL에 ?timestamp가 붙는데, chzzk CDN 등 일부
 *    서버는 이를 다른 리소스로 보고 404 응답.
 *  - skipFonts는 켬. embed-webfonts.js의 SVG data URL 정규식 버그 회피용.
 */

interface FetchImageResponse {
    dataUrl?: string;
    error?: string;
}

async function fetchImageAsDataUrl(url: string): Promise<string | null> {
    try {
        const res = (await browser.runtime.sendMessage({
            type: 'fetchImageAsDataUrl',
            url,
        })) as FetchImageResponse | undefined;
        if (!res) {
            console.warn('[tbcv2 capture] no response from background', url);
            return null;
        }
        if (res.error) {
            console.warn('[tbcv2 capture] background fetch failed', url, res.error);
            return null;
        }
        return res.dataUrl ?? null;
    } catch (e) {
        console.warn('[tbcv2 capture] sendMessage threw', url, e);
        return null;
    }
}

/**
 * root 안 이미지를 data URL로 변환.
 *  - <img> 태그의 src
 *  - computed style의 background-image: url(...)
 * 동일 src는 한 번만 fetch (cache).
 */
async function inlineImages(root: HTMLElement): Promise<void> {
    const cache = new Map<string, Promise<string | null>>();
    const getDataUrl = (src: string) => {
        if (!cache.has(src)) cache.set(src, fetchImageAsDataUrl(src));
        return cache.get(src)!;
    };

    const tasks: Promise<void>[] = [];

    // (1) <img> 태그
    root.querySelectorAll('img').forEach((img) => {
        const src = img.src;
        if (!src || src.startsWith('data:')) return;
        tasks.push((async () => {
            const dataUrl = await getDataUrl(src);
            if (dataUrl) img.src = dataUrl;
        })());
    });

    // (2) background-image: url(...). chzzk emoji/구독배지가 이 형태로 종종 렌더됨.
    // 자기 자신 + 모든 자손 element의 computed style을 검사.
    const allElements: HTMLElement[] = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];
    const URL_REGEX = /url\((['"]?)([^'")]+?)\1\)/g;
    allElements.forEach((el) => {
        const bg = window.getComputedStyle(el).backgroundImage;
        if (!bg || bg === 'none') return;
        // 동일 element에 여러 url() 가능 (multi-bg). 모두 inline 후 통째로 재할당.
        const matches: { raw: string; url: string }[] = [];
        let m: RegExpExecArray | null;
        const re = new RegExp(URL_REGEX);
        while ((m = re.exec(bg)) !== null) {
            if (!m[2].startsWith('data:')) matches.push({ raw: m[0], url: m[2] });
        }
        if (matches.length === 0) return;
        tasks.push((async () => {
            let next = bg;
            for (const { raw, url } of matches) {
                const dataUrl = await getDataUrl(url);
                if (dataUrl) next = next.replace(raw, `url("${dataUrl}")`);
            }
            el.style.backgroundImage = next;
        })());
    });

    await Promise.all(tasks);
}

async function downloadPng(dataUrl: string, filename: string): Promise<void> {
    const res = await browser.runtime.sendMessage({
        type: 'downloadDataUrl',
        dataUrl,
        filename,
    });
    if (res?.error) throw new Error(res.error);
}

/** 1x1 투명 PNG — html-to-image fetch 실패 시 fallback. */
const TRANSPARENT_PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=';

/**
 * html-to-image의 cloneCSSStyle은 기본적으로 *모든* (~400개) CSS 속성을 element마다
 * 복사함. 채팅 100개 × 30 element × 400 = 120만 setProperty 호출 → 메인 스레드 수 초 멈춤.
 * 채팅 시각 재현에 실제로 필요한 속성만 추려서 8배 정도 단축.
 */
const ESSENTIAL_STYLE_PROPS = [
    // 색상/배경
    'color', 'background-color', 'background-image', 'background-size',
    'background-position', 'background-repeat', 'background-clip', 'opacity',
    // 폰트/텍스트
    'font-family', 'font-size', 'font-weight', 'font-style', 'line-height',
    'letter-spacing', 'text-align', 'text-decoration', 'text-decoration-color',
    'text-transform', 'white-space', 'word-break', 'word-wrap', 'overflow-wrap',
    'text-overflow', 'text-shadow',
    // 박스
    'display', 'visibility', 'box-sizing',
    'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
    'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
    'border-color', 'border-style', 'border-width', 'border-radius',
    'outline', 'outline-color', 'outline-style', 'outline-width', 'outline-offset',
    // 위치/레이아웃
    'position', 'top', 'right', 'bottom', 'left', 'z-index',
    'flex', 'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis',
    'justify-content', 'align-items', 'align-content', 'align-self', 'gap',
    'order',
    // 오버플로우/이미지
    'overflow', 'overflow-x', 'overflow-y',
    'object-fit', 'object-position',
    // 트랜스폼/효과
    'transform', 'transform-origin', 'filter',
    // 인라인 이미지
    'vertical-align',
];

interface CaptureOptions {
    container: HTMLElement;
    selectedKeys: Set<string>;
    keyAttr: string;
    filename: string;
    backgroundColor?: string;
}

export async function captureChats({
    container,
    selectedKeys,
    keyAttr,
    filename,
    backgroundColor = '#0e0e10',
}: CaptureOptions): Promise<void> {
    if (selectedKeys.size === 0) return;

    // 선택/비선택 채팅 분리.
    const allChats = Array.from(container.querySelectorAll<HTMLElement>(`[${keyAttr}]`));
    const selectedEls: HTMLElement[] = [];
    const hiddenEls: { el: HTMLElement; prevDisplay: string }[] = [];

    allChats.forEach((el) => {
        const k = el.getAttribute(keyAttr);
        if (k !== null && selectedKeys.has(k)) {
            selectedEls.push(el);
        } else {
            // 비선택 채팅: layout에서 빼서 container scrollHeight를 줄임 (canvas 사이즈 결정 요인).
            hiddenEls.push({ el, prevDisplay: el.style.display });
            el.style.display = 'none';
        }
    });
    if (selectedEls.length === 0) return;

    // 선택 표시용 outline 클래스는 캡쳐 PNG에 안 들어가게 잠깐 제거.
    const removedSelectedClass: HTMLElement[] = [];
    selectedEls.forEach((el) => {
        if (el.classList.contains('tbcv2-capture-selected')) {
            el.classList.remove('tbcv2-capture-selected');
            removedSelectedClass.push(el);
        }
    });

    // 컨테이너 height/overflow 임시 해제 — 선택 채팅이 viewport 밖에 있어도 capture.
    const originalContainerStyle = {
        height: container.style.height,
        maxHeight: container.style.maxHeight,
        overflow: container.style.overflow,
    };
    container.style.height = 'auto';
    container.style.maxHeight = 'none';
    container.style.overflow = 'visible';

    try {
        await Promise.all(selectedEls.map((el) => inlineImages(el)));

        // toBlob: canvas.toBlob() 기반(async, non-blocking). toPng는 canvas.toDataURL()로
        // 큰 캔버스(100개+)에서 메인 스레드를 수 초 멈춤. blob 받은 뒤엔 background로
        // 직접 blob URL 다운로드 (FileReader 거치는 base64 변환도 회피).
        const blob = await toBlob(container, {
            backgroundColor,
            pixelRatio: window.devicePixelRatio || 1,
            skipFonts: true,
            imagePlaceholder: TRANSPARENT_PNG,
            includeStyleProperties: ESSENTIAL_STYLE_PROPS,
            // filter: clone 트리에서 비선택 채팅을 통째로 제외.
            filter: (node: Node) => {
                if (!(node instanceof Element)) return true;
                if (node === container) return true;
                if (node.hasAttribute(keyAttr)) {
                    const k = node.getAttribute(keyAttr);
                    return k !== null && selectedKeys.has(k);
                }
                const chatAncestor = node.closest(`[${keyAttr}]`);
                if (chatAncestor) {
                    const k = chatAncestor.getAttribute(keyAttr);
                    return k !== null && selectedKeys.has(k);
                }
                return true;
            },
        });
        if (!blob) throw new Error('toBlob returned null');

        const blobUrl = URL.createObjectURL(blob);
        try {
            await downloadPng(blobUrl, filename);
        } finally {
            // Chrome downloads는 URL을 비동기로 fetch하므로 즉시 revoke하면 실패.
            // 충분히 큰 지연 후 revoke (메모리 누수 방지).
            setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
        }
    } finally {
        hiddenEls.forEach(({ el, prevDisplay }) => {
            el.style.display = prevDisplay;
        });
        container.style.height = originalContainerStyle.height;
        container.style.maxHeight = originalContainerStyle.maxHeight;
        container.style.overflow = originalContainerStyle.overflow;
        removedSelectedClass.forEach((el) => el.classList.add('tbcv2-capture-selected'));
    }
}
