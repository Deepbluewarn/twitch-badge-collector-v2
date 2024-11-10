import { createContext, useContext } from "react";
import { SoopAPIHooks } from "../hooks/useSoopAPI";

export const SoopAPIContext = createContext<SoopAPIHooks | undefined>(undefined);

export function useSoopAPIContext() {
  const context = useContext(SoopAPIContext);

  if (typeof context === 'undefined') {
    throw new Error("SoopAPIContext must be within SoopAPIProvider");
  }

  return context;
}
