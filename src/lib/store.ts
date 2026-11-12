"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createSeed, shiftDB } from "./seed";
import type { DB } from "./types";
import { startOfDay } from "./time";

// One browser-side "database" shared by the customer app and the Command Center.
// It persists to localStorage and syncs live between tabs, so a booking made on the
// phone view appears in the manager's 3D Command Center a moment later.

export const STORAGE_KEY = "padelbay-demo-v1";

export interface Session {
  customerId?: string;
  staffId?: string;
  twoD: boolean;
}

interface State {
  db: DB;
  session: Session;
  hydrated: boolean;
  commit: (fn: (db: DB) => void) => void;
  setSession: (patch: Partial<Session>) => void;
  resetDemo: () => void;
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      db: createSeed(),
      session: { twoD: false },
      hydrated: false,
      commit: (fn) => {
        const next = structuredClone(get().db);
        fn(next);
        next.version += 1;
        set({ db: next });
      },
      setSession: (patch) => set({ session: { ...get().session, ...patch } }),
      resetDemo: () => set({ db: createSeed(), session: { twoD: get().session.twoD } }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ db: s.db, session: s.session }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // data saved by an earlier version of the demo: add what is missing
        if (!state.db.redemptions) useStore.setState({ db: { ...state.db, redemptions: [] } });
        const today = startOfDay();
        if (state.db.seededDay !== today) {
          useStore.setState({ db: shiftDB(state.db, today - state.db.seededDay) });
        }
        useStore.setState({ hydrated: true });
      },
    },
  ),
);

let started = false;

/** Rehydrate once on the client and follow writes from other tabs. */
export function startStore() {
  if (started || typeof window === "undefined") return;
  started = true;
  void useStore.persist.rehydrate();
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) void useStore.persist.rehydrate();
  });
}

export const getDB = () => useStore.getState().db;
