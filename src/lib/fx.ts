"use client";

import { create } from "zustand";
import type { Reward } from "./actions";

export interface Toast {
  id: string;
  title: string;
  body?: string;
  tone: "success" | "info" | "warning" | "error" | "reward";
}

interface FxState {
  toasts: Toast[];
  levelUp: Reward["levelUp"] | null;
  conciergeOpen: boolean;
  conciergeSeed?: string;
  toast: (t: Omit<Toast, "id">) => void;
  dismiss: (id: string) => void;
  celebrate: (r?: Reward) => void;
  closeLevelUp: () => void;
  openConcierge: (seed?: string) => void;
  closeConcierge: () => void;
}

export const useFx = create<FxState>((set, get) => ({
  toasts: [],
  levelUp: null,
  conciergeOpen: false,
  toast: (t) => {
    const id = Math.random().toString(36).slice(2);
    set({ toasts: [...get().toasts.slice(-3), { ...t, id }] });
    setTimeout(() => get().dismiss(id), t.tone === "reward" ? 5200 : 4200);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  celebrate: (r) => {
    if (!r) return;
    for (const u of r.unlocked) get().toast({ tone: "reward", title: `Achievement unlocked · ${u.name}`, body: `+${u.points} points` });
    if (r.points && !r.unlocked.length) get().toast({ tone: "reward", title: `+${r.points} points`, body: "Added to your Padel Bay level" });
    if (r.levelUp) setTimeout(() => set({ levelUp: r.levelUp }), r.unlocked.length ? 900 : 300);
  },
  closeLevelUp: () => set({ levelUp: null }),
  openConcierge: (seed) => set({ conciergeOpen: true, conciergeSeed: seed }),
  closeConcierge: () => set({ conciergeOpen: false, conciergeSeed: undefined }),
}));
