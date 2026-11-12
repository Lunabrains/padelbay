"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createSeed, shiftDB } from "./seed";
import type { DB } from "./types";
import { startOfDay } from "./time";

// One browser-side "database" shared by the customer app and the Command Center.
// It persists to localStorage and syncs live between tabs, so a booking made on the
// phone view appears in the manager's 3D Command Center a moment later.
//
// Cross-tab rules:
// - every write starts from the newest saved copy (another tab may have written since), so two
//   tabs never undo each other's bookings or orders;
// - sign-ins live under their own key and are merged field by field, so a customer signed in
//   in one tab and a manager signed in in another never sign each other out.

export const STORAGE_KEY = "padelbay-demo-v1";
export const SESSION_KEY = "padelbay-session-v1";

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

function readSession(): Session {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) return { twoD: false, ...JSON.parse(raw) };
  } catch {}
  return { twoD: false };
}

function writeSession(s: Session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {}
}

function newestSavedDB(): DB | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw)?.state?.db ?? null) : null;
  } catch {
    return null;
  }
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      db: createSeed(),
      session: { twoD: false },
      hydrated: false,
      commit: (fn) => {
        let base = get().db;
        const saved = typeof window !== "undefined" ? newestSavedDB() : null;
        if (saved && saved.lockers && saved.version > base.version) base = saved;
        const next = structuredClone(base);
        fn(next);
        next.version += 1;
        set({ db: next });
      },
      setSession: (patch) => {
        // the saved copy is the source of truth: other tabs keep it current via storage events
        const next = { ...readSession(), ...patch };
        for (const k of Object.keys(patch) as (keyof Session)[]) if (patch[k] === undefined) delete next[k];
        writeSession(next);
        set({ session: next });
      },
      resetDemo: () => {
        const session = { twoD: get().session.twoD };
        writeSession(session);
        set({ db: createSeed(), session });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ db: s.db }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        useStore.setState({ session: readSession() });
        if (!state) return;
        // data saved by an earlier version of the demo (before kit lockers): start from a fresh seed
        if (!state.db?.lockers || !state.db?.redemptions) {
          useStore.setState({ db: createSeed(), hydrated: true });
          return;
        }
        const today = startOfDay();
        if (state.db.seededDay !== today) {
          useStore.setState({ db: shiftDB(state.db, today - state.db.seededDay) });
        }
        useStore.setState({ hydrated: true });
      },
    },
  ),
);

if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") (window as unknown as Record<string, unknown>).__store = useStore;

let started = false;

/** Rehydrate once on the client and follow writes from other tabs. */
export function startStore() {
  if (started || typeof window === "undefined") return;
  started = true;
  void useStore.persist.rehydrate();
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) {
      // take the other tab's data only when it is newer; equal versions are our own echo
      const saved = newestSavedDB();
      if (saved && saved.lockers && saved.version > useStore.getState().db.version) useStore.setState({ db: saved });
    } else if (e.key === SESSION_KEY) {
      useStore.setState({ session: readSession() });
    }
  });
}

export const getDB = () => useStore.getState().db;
