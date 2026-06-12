// The shared build state. Every component reads the current `State` and a
// `dispatch` for build changes from here, plus the loaded `Db` (which never
// changes after startup). This replaces the old main.ts module-level `state`
// object + global `render()`.

import { createContext, useContext, type Dispatch } from "react";
import type { Db } from "../core/db";
import type { Action } from "../core/reducer";
import type { State } from "../core/state";

export type AppContextValue = {
  db: Db;
  state: State;
  dispatch: Dispatch<Action>;
};

const AppContext = createContext<AppContextValue | null>(null);

export const AppStateProvider = AppContext.Provider;

function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("App state hooks must be used inside <AppStateProvider>");
  return ctx;
}

export const useDb = (): Db => useAppContext().db;
export const useAppState = (): State => useAppContext().state;
export const useDispatch = (): Dispatch<Action> => useAppContext().dispatch;
