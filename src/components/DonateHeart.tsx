import s from './DonateHeart.module.css';

/**
 * 후원(Fairy) 링크에 붙는 얇은 선 빨간 하트. 팝업 헤더와 설정 페이지 왼쪽 메뉴가 쓴다.
 * 처음 그릴 때 한 번 흔들고, 감싼 링크에 마우스를 올리면 다시 흔들며 속이 찬다.
 * size는 옆 아이콘 상자와 같게 준다. 작을수록 선을 굵게 해 채운 material 글리프와 무게를 맞춘다.
 */
export default function DonateHeart({ size = 16 }: { size?: number }) {
    return (
        <span className={s.heart}>
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={size <= 14 ? 2.6 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
            </svg>
        </span>
    );
}
