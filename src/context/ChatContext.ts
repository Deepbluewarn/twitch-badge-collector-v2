import { createContext, MutableRefObject } from "react";

export const UserColorContext = createContext({} as MutableRefObject<Map<string, string>>);