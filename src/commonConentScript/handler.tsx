import React, { useCallback, useEffect, useRef } from "react";
import styled from "styled-components";
import browser from "webextension-polyfill";
import { PositionOptionType } from "../interfaces/setting";
import { ChatRoom } from "../contentScript/container";

const HandlerStyle = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  height: 2rem;
  cursor: row-resize;

  #tbc-resize-handle {
    display: flex;
    border-top: 2px solid var(--color-background-alt-2);
    height: 0.5rem;
    margin: 0.5rem;
  }
  .up {
    order: 2;
    background-color: #ffffff;
  }
  .down {
    order: 1;
    background-color: #121212;
  }
`;
const HandlerUpStyle = styled(HandlerStyle)`
  order: 2;
  background-color: #ffffff;
`;
const HandlerDownStyle = styled(HandlerStyle)`
  order: 1;
  background-color: #121212;
`;

export default function Handler(props: React.HTMLAttributes<HTMLDivElement>) {
  const streamChat = useRef(document.getElementsByClassName("stream-chat")[0]);
  const tbcContainer = useRef(document.getElementById("tbc-container"));
  const originalContainer = useRef(
    document.getElementsByClassName("tbc-origin")[0] as HTMLElement
  );
  const chatRoom = useRef(ChatRoom());
  const handlerContainer = useRef<HTMLDivElement>(null);
  const ratio = useRef(0);

  const getPosition = (container: HTMLElement) => {
    return container.style.order === "1" ? "up" : "down";
  };

  const startDrag = useCallback(() => {
    if (!tbcContainer.current) return;

    tbcContainer.current.classList.add("freeze");

    document.addEventListener("mousemove", doDrag);
    document.addEventListener("touchmove", doDrag);
    document.addEventListener("mouseup", endDrag);
    document.addEventListener("touchend", endDrag);
  }, []);

  const doDrag = useCallback((e: MouseEvent | TouchEvent) => {
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    if (!chatRoom.current) return;
    if (!tbcContainer.current) return;

    const position = getPosition(tbcContainer.current);
    const rect = chatRoom.current.getBoundingClientRect();
    ratio.current = (1 - (clientY - rect.y) / rect.height) * 100;
    ratio.current = Math.max(0, Math.min(100, Math.round(ratio.current)));
    updateRatio(ratio.current, position);
  }, []);

  const endDrag = useCallback(() => {
    if (!tbcContainer.current) return;

    tbcContainer.current.classList.remove("freeze");

    browser.storage.local.set({ containerRatio: ratio.current });
    document.removeEventListener("mousemove", doDrag);
    document.removeEventListener("touchmove", doDrag);
    document.removeEventListener("mouseup", endDrag);
    document.removeEventListener("touchend", endDrag);
  }, []);

  function updateRatio(ratio: number, position: PositionOptionType) {
    if (ratio != 0) ratio = ratio ? ratio : 30;

    let orig_size = ratio === 0 ? 1 : ratio === 10 ? 0 : 1;
    let clone_size = ratio === 0 ? 0 : ratio === 10 ? 1 : 0;

    if (1 <= ratio && ratio <= 100) {
      clone_size = parseFloat((ratio * 0.01).toFixed(2));
      orig_size = parseFloat((1 - clone_size).toFixed(2));
    }

    let orig, clone;

    if (position === "up") {
      [orig_size, clone_size] = [clone_size, orig_size];
    }
    orig = originalContainer.current;
    clone = tbcContainer.current;

    if (!orig || !clone) return;

    orig.style.height = `${orig_size * 100}%`;
    clone.style.height = `${clone_size * 100}%`;
  }

  useEffect(() => {
    if (!handlerContainer.current) return;

    handlerContainer.current.addEventListener("mousedown", startDrag);
    handlerContainer.current.addEventListener("touchstart", startDrag);
  }, []);

  const position = props.className
    ? props.className.includes("up")
      ? "up"
      : "down"
    : "down";
    
  return (
    <HandlerDownStyle {...props} id="handle-container" ref={handlerContainer}>
      <div id="tbc-resize-handle"></div>
    </HandlerDownStyle>
  );
}
