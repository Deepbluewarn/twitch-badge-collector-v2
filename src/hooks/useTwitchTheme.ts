import { useState, useRef } from "react";
import useMutationObserver from "./useMutationObserver";

export type TwitchTheme = 'light' | 'dark';
/**
 * 
 * @returns TwitchTheme
 */
export default function useTwitchTheme() {
  const twitchHTMLTagRef = useRef<HTMLElement>(document.documentElement);
  const getTheme = () => {
    return twitchHTMLTagRef.current.classList.contains("tw-root--theme-dark") ? 'dark' : 'light' as TwitchTheme;
  };
  const [theme, setTheme] = useState(getTheme());

  const themeCallback = (mutationRecord: MutationRecord[]) => {
    setTheme(getTheme());
  };

  useMutationObserver(twitchHTMLTagRef, themeCallback);

  return { theme, setTheme }
}