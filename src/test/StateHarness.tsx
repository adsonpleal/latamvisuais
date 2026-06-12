// Test harness: wraps children in a real reducer + AppStateProvider so that
// dispatched actions actually flow through clampState and re-render, exactly
// like the running app. Lets component tests assert on real state transitions.

import { useReducer, type ReactNode } from "react";
import type { Db } from "../core/db";
import { clampState } from "../core/clamp";
import { createAppReducer } from "../core/reducer";
import { initialState, type State } from "../core/state";
import { AppStateProvider } from "../state/AppStateContext";
import { makeDb } from "./fixtures";

export function StateHarness({
  children,
  db = makeDb(),
  init,
}: {
  children: ReactNode;
  db?: Db;
  init?: Partial<State>;
}) {
  const [state, dispatch] = useReducer(createAppReducer(db), init, (init) =>
    clampState(db, { ...initialState(db), ...init }),
  );
  return <AppStateProvider value={{ db, state, dispatch }}>{children}</AppStateProvider>;
}
