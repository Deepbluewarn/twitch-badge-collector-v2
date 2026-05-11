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
    if (ratio != 0) ratio = ratio ? ratio : 30;

    let orig_size = ratio === 0 ? 1 : ratio === 10 ? 0 : 1;
    let clone_size = ratio === 0 ? 0 : ratio === 10 ? 1 : 0;

    if (1 <= ratio && ratio <= 100) {
        clone_size = parseFloat((ratio * 0.01).toFixed(2));
        orig_size = parseFloat((1 - clone_size).toFixed(2));
    }

    if (position === "up") {
        [orig_size, clone_size] = [clone_size, orig_size];
    }

    const orig = document.getElementById(`tbc-${type}-chat-list-wrapper`);
    const clone = document.getElementById(`${type}-container`);

    if (!orig || !clone) return;

    orig.style.height = `${orig_size * 100}%`;
    clone.style.height = `${clone_size * 100}%`;
}
