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

interface InlineCleanup {
    tempClasses: Array<{ el: HTMLElement; cls: string }>;
    styleEl: HTMLStyleElement | null;
}

const URL_REGEX = /url\((['"]?)([^'")]+?)\1\)/g;

function extractUrls(value: string): Array<{ raw: string; url: string }> {
    const out: Array<{ raw: string; url: string }> = [];
    if (!value || value === 'none') return out;
    let m: RegExpExecArray | null;
    const re = new RegExp(URL_REGEX);
    while ((m = re.exec(value)) !== null) {
        if (!m[2].startsWith('data:')) out.push({ raw: m[0], url: m[2] });
    }
    return out;
}

/**
 * root 안 이미지를 data URL로 변환.
 *  - <img> 태그의 src
 *  - computed style의 background-image: url(...)
 *  - ::before/::after pseudo-element의 background-image (chzzk 구독 메달 등)
 *
 * 동일 src는 한 번만 fetch (cache).
 *
 * Pseudo-element는 JS로 직접 style 못 주므로 임시 class + <style> rule 주입 방식.
 * cleanup 호출로 원복 필요.
 */
async function inlineImages(roots: HTMLElement[]): Promise<InlineCleanup> {
    const cache = new Map<string, Promise<string | null>>();
    const getDataUrl = (src: string) => {
        if (!cache.has(src)) cache.set(src, fetchImageAsDataUrl(src));
        return cache.get(src)!;
    };

    const tasks: Promise<void>[] = [];
    const tempClasses: Array<{ el: HTMLElement; cls: string }> = [];
    const pseudoRules: string[] = [];
    let pseudoCounter = 0;

    for (const root of roots) {
        // (1) <img> 태그
        root.querySelectorAll('img').forEach((img) => {
            const src = img.src;
            if (!src || src.startsWith('data:')) return;
            tasks.push((async () => {
                const dataUrl = await getDataUrl(src);
                if (dataUrl) img.src = dataUrl;
            })());
        });

        const allElements: HTMLElement[] = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];

        // (2) 자기 element의 url() 함유 CSS 속성들. chzzk이 색상 입힌 아이콘(인증마크,
        // 카테고리 아이콘 등)을 mask-image + background-color로 그려서 mask도 inline 필요.
        // content: url(...) 케이스도 같은 방식 처리. style.* 카멜케이스 매핑 필요.
        const URL_CSS_PROPS: Array<[string, string]> = [
            ['backgroundImage', 'background-image'],
            ['maskImage', 'mask-image'],
            ['webkitMaskImage', '-webkit-mask-image'],
            // content는 url() 단독일 때만 — 'foo' 같은 텍스트 content는 건드리지 않음.
        ];
        allElements.forEach((el) => {
            const cs = window.getComputedStyle(el);
            URL_CSS_PROPS.forEach(([camel, kebab]) => {
                const value = cs.getPropertyValue(kebab);
                const matches = extractUrls(value);
                if (matches.length === 0) return;
                tasks.push((async () => {
                    let next = value;
                    for (const { raw, url } of matches) {
                        const dataUrl = await getDataUrl(url);
                        if (dataUrl) next = next.replace(raw, `url("${dataUrl}")`);
                    }
                    (el.style as unknown as Record<string, string>)[camel] = next;
                })());
            });
        });

        // (3) pseudo-element ::before/::after의 url() 함유 속성들.
        // pseudo는 JS style 직접 주입 불가 → 임시 class + 전역 <style>로 우회.
        const PSEUDO_URL_PROPS = ['background-image', 'mask-image', '-webkit-mask-image'] as const;
        for (const el of allElements) {
            for (const pseudo of ['::before', '::after'] as const) {
                const cs = window.getComputedStyle(el, pseudo);
                for (const prop of PSEUDO_URL_PROPS) {
                    const value = cs.getPropertyValue(prop);
                    const matches = extractUrls(value);
                    if (matches.length === 0) continue;

                    const cls = `tbcv2-pseudo-${pseudoCounter++}`;
                    el.classList.add(cls);
                    tempClasses.push({ el, cls });

                    tasks.push((async () => {
                        let next = value;
                        for (const { raw, url } of matches) {
                            const dataUrl = await getDataUrl(url);
                            if (dataUrl) next = next.replace(raw, `url("${dataUrl}")`);
                        }
                        // 높은 specificity로 chzzk 원본 규칙 확실히 덮어씀.
                        pseudoRules.push(`html .${cls}${pseudo} { ${prop}: ${next} !important; }`);
                    })());
                }
            }
        }
    }

    await Promise.all(tasks);

    let styleEl: HTMLStyleElement | null = null;
    if (pseudoRules.length > 0) {
        styleEl = document.createElement('style');
        styleEl.textContent = pseudoRules.join('\n');
        document.head.appendChild(styleEl);
    }

    return { tempClasses, styleEl };
}

function cleanupInline(cleanup: InlineCleanup) {
    cleanup.tempClasses.forEach(({ el, cls }) => el.classList.remove(cls));
    if (cleanup.styleEl) cleanup.styleEl.remove();
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
 * 한 PNG 파일 당 최대 채팅 수. 초과 시 여러 파일로 분할 저장.
 * html-to-image는 element마다 ~400개 CSS 속성을 모두 inline 복사 → 채팅 많을수록
 * 메인 스레드 블록. 30개가 ~3-5초 수준이라 sweet spot.
 *
 * 이전엔 ESSENTIAL_STYLE_PROPS 화이트리스트로 속도 확보했으나 chzzk 신규 채팅 유형
 * (도네이션 등)이 화이트리스트 밖 속성에 의존해 fragile. 전체 속성 + 개수 제한이
 * 유지보수 단순함.
 */
const CHUNK_SIZE = 30;

interface CaptureOptions {
    container: HTMLElement;
    selectedKeys: Set<string>;
    keyAttr: string;
    filename: string;
    backgroundColor?: string;
}

export async function captureChats(opts: CaptureOptions): Promise<void> {
    const { container, selectedKeys, keyAttr, filename } = opts;
    if (selectedKeys.size === 0) return;

    // 선택된 chat을 host DOM 순서대로 정렬해서 chunk로 분할.
    const allChats = Array.from(container.querySelectorAll<HTMLElement>(`[${keyAttr}]`));
    const selectedInOrder = allChats.filter(el => {
        const k = el.getAttribute(keyAttr);
        return k !== null && selectedKeys.has(k);
    });
    if (selectedInOrder.length === 0) return;

    const chunks: HTMLElement[][] = [];
    for (let i = 0; i < selectedInOrder.length; i += CHUNK_SIZE) {
        chunks.push(selectedInOrder.slice(i, i + CHUNK_SIZE));
    }

    for (let i = 0; i < chunks.length; i++) {
        const chunkEls = chunks[i];
        const chunkKeys = new Set(chunkEls.map(el => el.getAttribute(keyAttr) ?? ''));
        // 단일 chunk면 원본 파일명. 다중이면 _1, _2 인덱스 부여.
        const chunkFilename = chunks.length === 1
            ? filename
            : filename.replace(/(\.png)?$/i, `_${i + 1}.png`);
        await captureChunk({ ...opts, allChats, selectedEls: chunkEls, chunkKeys, filename: chunkFilename });
    }
}

interface CaptureChunkArgs extends CaptureOptions {
    allChats: HTMLElement[];
    selectedEls: HTMLElement[];
    chunkKeys: Set<string>;
}

async function captureChunk({
    container,
    keyAttr,
    filename,
    backgroundColor = '#0e0e10',
    allChats,
    selectedEls,
    chunkKeys,
}: CaptureChunkArgs): Promise<void> {
    // 이번 chunk 외 모든 채팅을 layout에서 빼서 container 사이즈 축소.
    const hiddenEls: { el: HTMLElement; prevDisplay: string }[] = [];
    allChats.forEach((el) => {
        const k = el.getAttribute(keyAttr) ?? '';
        if (!chunkKeys.has(k)) {
            hiddenEls.push({ el, prevDisplay: el.style.display });
            el.style.display = 'none';
        }
    });

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

    // 닉네임 등이 narrow container 안에서 wrap돼 잘리는 케이스. 캡쳐 동안만 무력화.
    const ELLIPSIS_FIX_CLASS = 'tbcv2-capture-no-ellipsis';
    selectedEls.forEach((el) => el.classList.add(ELLIPSIS_FIX_CLASS));
    const ellipsisStyle = document.createElement('style');
    ellipsisStyle.textContent = `
        .${ELLIPSIS_FIX_CLASS}, .${ELLIPSIS_FIX_CLASS} * {
            text-overflow: clip !important;
            overflow: visible !important;
            max-width: none !important;
        }
        /* 닉네임 류는 절대 wrap 안 되게. 메시지 본문은 wrap 자연스러움 유지. */
        .${ELLIPSIS_FIX_CLASS} [class*="username"],
        .${ELLIPSIS_FIX_CLASS} [class*="username"] * {
            white-space: nowrap !important;
        }
    `;
    document.head.appendChild(ellipsisStyle);

    const inlineCleanup = await inlineImages(selectedEls);
    try {
        // toBlob: canvas.toBlob() 기반(async, non-blocking). includeStyleProperties 미지정 →
        // 전체 computed style 복사. 화이트리스트로 인한 chzzk 신규 유형 깨짐 회피.
        // 대신 chunk 단위로 호출하여 1회 비용 제한.
        const blob = await toBlob(container, {
            backgroundColor,
            pixelRatio: window.devicePixelRatio || 1,
            skipFonts: true,
            imagePlaceholder: TRANSPARENT_PNG,
            filter: (node: Node) => {
                if (!(node instanceof Element)) return true;
                if (node === container) return true;
                if (node.hasAttribute(keyAttr)) {
                    const k = node.getAttribute(keyAttr);
                    return k !== null && chunkKeys.has(k);
                }
                const chatAncestor = node.closest(`[${keyAttr}]`);
                if (chatAncestor) {
                    const k = chatAncestor.getAttribute(keyAttr);
                    return k !== null && chunkKeys.has(k);
                }
                return true;
            },
        });
        if (!blob) throw new Error('toBlob returned null');

        // blob URL은 host origin 묶임 → Firefox 거부. dataURL로 전환해 cross-context 안전.
        const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
        });
        await downloadPng(dataUrl, filename);
    } finally {
        cleanupInline(inlineCleanup);
        ellipsisStyle.remove();
        selectedEls.forEach((el) => el.classList.remove(ELLIPSIS_FIX_CLASS));
        hiddenEls.forEach(({ el, prevDisplay }) => {
            el.style.display = prevDisplay;
        });
        container.style.height = originalContainerStyle.height;
        container.style.maxHeight = originalContainerStyle.maxHeight;
        container.style.overflow = originalContainerStyle.overflow;
        removedSelectedClass.forEach((el) => el.classList.add('tbcv2-capture-selected'));
    }
}
