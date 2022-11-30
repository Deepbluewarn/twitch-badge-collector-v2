import React, { createContext, useContext } from "react";
import AlertInterface from "../interfaces/alert";

export const AlertContext = createContext<
  | {
      alerts: AlertInterface[];
      setAlerts: React.Dispatch<React.SetStateAction<AlertInterface[]>>;
      addAlert: (alert: AlertInterface) => void;
    }
  | undefined
>(undefined);

export function useAlertContext() {
  const context = useContext(AlertContext);

  if (typeof context === "undefined") {
    throw new Error("AlertContext must be within AlertProvider");
  }

  return context;
}
