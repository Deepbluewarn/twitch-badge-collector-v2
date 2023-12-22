import browser from "webextension-polyfill";
import { ChatRoom } from "./container";
import { ReplayPageType } from "./utils";
import { SettingInterface } from 'twitch-badge-collector-cc';

const videoWrapperClassName = "video-chat__message-list-wrapper";

export default function createContainerHandler() {
  const handle_container = document.createElement("div");
  const resize_handle = document.createElement("div");
  handle_container.id = "handle-container";
  resize_handle.id = "tbc-resize-handle";

  let containerRatio = 0;
  let position: string = "up";
  let tbcContainer: HTMLDivElement;
  let isReplay: boolean | string = false;

  const getPosition = (container: HTMLDivElement) => {
    return container.style.order === "1" ? "up" : "down";
  };

  const startDrag = function (e: MouseEvent | TouchEvent) {
    e.preventDefault();

    tbcContainer = <HTMLDivElement>document.getElementById("tbc-container");

    if (!tbcContainer) return;

    tbcContainer.classList.add("freeze");

    position = getPosition(tbcContainer);
    isReplay = ReplayPageType();

    window.addEventListener("mousemove", doDrag);
    window.addEventListener("touchmove", doDrag);
    window.addEventListener("mouseup", endDrag);
    window.addEventListener("touchend", endDrag);
  };

  const doDrag = (e: MouseEvent | TouchEvent) => {
    let chat_room;

    if (isReplay) {
      chat_room = document.getElementsByClassName(videoWrapperClassName)[0]
        .parentElement;
    } else {
      chat_room = ChatRoom();
    }

    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    if (chat_room) {
      const rect = chat_room.getBoundingClientRect();
      containerRatio = (1 - (clientY - rect.y) / rect.height) * 100;
      containerRatio = Math.max(0, Math.min(100, Math.round(containerRatio)));
      updateContainerRatio(containerRatio, position, isReplay);
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
  position: SettingInterface.PositionOptionsType,
  replay: boolean | string
) {
  if (ratio != 0) ratio = ratio ? ratio : 30;

  let orig_size = ratio === 0 ? 1 : ratio === 10 ? 0 : 1;
  let clone_size = ratio === 0 ? 0 : ratio === 10 ? 1 : 0;

  if (1 <= ratio && ratio <= 100) {
    clone_size = parseFloat((ratio * 0.01).toFixed(2));
    orig_size = parseFloat((1 - clone_size).toFixed(2));
  }

  // let orig, clone;

  if (position === "up") {
    [orig_size, clone_size] = [clone_size, orig_size];
  }

  const orig = <HTMLDivElement>(
    document.getElementsByClassName(
      replay ? videoWrapperClassName : "tbc-origin"
    )[0]
  );
  const clone = <HTMLDivElement>document.getElementById("tbc-container");

  if (!orig || !clone) return;

  orig.style.height = `${orig_size * 100}%`;
  clone.style.height = `${clone_size * 100}%`;
}
