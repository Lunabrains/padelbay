"use client";

import { create } from "zustand";

// Client-only UI state for the shared 3D stage (not persisted).

export type Zone =
  | "intro"
  | "overview"
  | "courts"
  | "court"
  | "cafe"
  | "club"
  | "lockers"
  | "community"
  | "command";

export interface StageState {
  zone: Zone;
  focusId?: string; // court id, unit id, tier id…
  mode: "guest" | "ops";
  interactive: boolean;
  inset: { right: number; bottom: number };
  hovered?: string;
  highlight: string[];
  quality: "high" | "low";
  reducedMotion: boolean;
  webgl: boolean;
  chapter?: string; // landing scroll-spy, drives the contextual nav
  set: (patch: Partial<Omit<StageState, "set">>) => void;
}

export const useStage = create<StageState>((set) => ({
  zone: "intro",
  mode: "guest",
  interactive: false,
  inset: { right: 0, bottom: 0 },
  highlight: [],
  quality: "high",
  reducedMotion: false,
  webgl: true,
  set: (patch) => set(patch),
}));

/** Facility clicks from the 3D world are routed through here so each shell can decide what they open. */
export type PickHandler = (kind: "court" | "cafe" | "locker" | "club" | "tier" | "hall", id: string) => boolean | void;
// Handlers stack: the innermost screen gets first refusal (return true to consume the pick).
const handlers: PickHandler[] = [];
export function onPick(fn: PickHandler) {
  handlers.push(fn);
  return () => {
    const i = handlers.lastIndexOf(fn);
    if (i >= 0) handlers.splice(i, 1);
  };
}
export function pick(kind: Parameters<PickHandler>[0], id: string) {
  for (let i = handlers.length - 1; i >= 0; i--) if (handlers[i](kind, id) === true) return;
}
