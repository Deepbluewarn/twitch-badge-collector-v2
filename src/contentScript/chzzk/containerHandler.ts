import { SettingInterface } from "@interfaces/setting";
import browser from "webextension-polyfill";

export default function createContainerHandler() {
  const handle_container = document.createElement("div");
  const resize_handle = document.createElement("div");
  handle_container.id = "handle-container";
  resize_handle.id = "tbc-resize-handle";

  let containerRatio = 0;
  let position: SettingInterface['position'] = "up";
  let tbcContainer: HTMLDivElement;

  const getPosition = (container: HTMLDivElement) => {
    return container.style.order === "1" ? "up" : "down";
  };

  const startDrag = function (e: MouseEvent | TouchEvent) {
    e.preventDefault();

    tbcContainer = <HTMLDivElement>document.getElementById("chzzk-container");

    if (!tbcContainer) return;

    tbcContainer.classList.add("freeze");

    position = getPosition(tbcContainer);

    window.addEventListener("mousemove", doDrag);
    window.addEventListener("touchmove", doDrag);
    window.addEventListener("mouseup", endDrag);
    window.addEventListener("touchend", endDrag);
  };

  const doDrag = (e: MouseEvent | TouchEvent) => {
    const chatListContainer = document.getElementById('tbc-chzzk-chat-list-container');

    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    let rectHeigth = 0;

    if (chatListContainer) {
      const rect = chatListContainer.getBoundingClientRect();

      rectHeigth = rect.height - 77 - 62;

      containerRatio = (1 - (clientY - rect.y - 77) / (rectHeigth)) * 100;
      containerRatio = Math.max(0, Math.min(100, Math.round(containerRatio)));
      updateContainerRatio(containerRatio, position);
    }
  };

  const endDrag = function () {
    tbcContainer.classList.remove("freeze");

    browser.storage.local.set({ containerRatio });
    window.removeEventListener("mousemove", doDrag);
    window.removeEventListener("touchmove", doDrag);
    window.removeEventListener("mouseup", endDrag);
    window.removeEventListener("touchend", endDrag);
  };

  handle_container.addEventListener("mousedown", startDrag);
  handle_container.addEventListener("touchstart", startDrag);
  handle_container.appendChild(resize_handle);

  return handle_container;
}

export function updateContainerRatio(
  ratio: number,
  position: SettingInterface["position"],
) {
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

  const orig = <HTMLDivElement>document.getElementById("tbc-chzzk-chat-list-wrapper");
  const clone = <HTMLDivElement>document.getElementById("chzzk-container");

  if (!orig || !clone) return;

  orig.style.height = `${orig_size * 100}%`;
  clone.style.height = `${clone_size * 100}%`;
}
