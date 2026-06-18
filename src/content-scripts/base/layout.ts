import { SettingInterface } from "@/interfaces/setting";

type Platform = SettingInterface['platform'];
type Position = SettingInterface['position'];

export function applyPosition(type: Platform, position: Position) {
    const tbcContainer = document.getElementById(`${type}-container`) as HTMLDivElement;
    const handleContainer = document.getElementById("handle-container") as HTMLDivElement;
    const originContainer = document.getElementById(`tbc-${type}-chat-list-wrapper`) as HTMLDivElement;

    if (!tbcContainer || !handleContainer || !originContainer) return;

    if (position === "down") {
        tbcContainer.style.order = "3";
        handleContainer.style.order = "2";
        originContainer.style.order = "1";
    } else {
        tbcContainer.style.order = "1";
        handleContainer.style.order = "2";
        originContainer.style.order = "3";
    }
}

export function applyRatio(type: Platform, ratio: number, position: Position) {
    // undefined/NaN/범위 밖만 default 30. 0은 사용자가 의도적으로 한쪽 100% 원하는
    // 합법 값 (예: 모아보기만 전체, 원본만 전체). didDrag 가드(handler.tsx)로
    // 사고성 0 저장 자체를 막았으니 0이 저장돼 있으면 사용자 의도로 신뢰.
    if (typeof ratio !== 'number' || !isFinite(ratio) || ratio < 0 || ratio > 100) ratio = 30;

    let clone_size = parseFloat((ratio * 0.01).toFixed(2));
    let orig_size = parseFloat((1 - clone_size).toFixed(2));

    if (position === "up") {
        [orig_size, clone_size] = [clone_size, orig_size];
    }

    const orig = document.getElementById(`tbc-${type}-chat-list-wrapper`);
    const clone = document.getElementById(`${type}-container`);

    if (!orig || !clone) return;

    orig.style.height = `${orig_size * 100}%`;
    clone.style.height = `${clone_size * 100}%`;
}
