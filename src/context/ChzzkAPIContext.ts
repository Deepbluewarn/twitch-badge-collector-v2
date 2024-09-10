import { createContext, useContext } from "react";
import { ChzzkAPIHooks } from "../hooks/useChzzkAPI";

export const ChzzkAPIContext = createContext<ChzzkAPIHooks | undefined>(undefined);

export function useChzzkAPIContext() {
  const context = useContext(ChzzkAPIContext);

  if (typeof context === 'undefined') {
    throw new Error("ChzzkAPIContext must be within ChzzkAPIProvider");
  }

  return context;
}