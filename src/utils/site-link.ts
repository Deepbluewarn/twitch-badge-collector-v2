// badgecollector.dev 링크. 확장 페이지에서 열면 리퍼러가 없어 GA에 Direct로 잡히므로 UTM으로 출처를 남긴다.
// spot은 확장 안 어느 링크인지(utm_content).
export function siteUrl(path: string, spot: string) {
    const url = new URL(path, 'https://badgecollector.dev');
    url.searchParams.set('utm_source', 'extension');
    url.searchParams.set('utm_medium', 'referral');
    url.searchParams.set('utm_content', spot);
    return url.href;
}
