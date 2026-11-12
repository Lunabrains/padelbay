"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { startStore, useStore } from "./store";

export function useNow(intervalMs = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Boots the shared store on the client and reports when persisted data is ready. */
export function useBootStore() {
  useEffect(() => {
    startStore();
  }, []);
  return useStore((s) => s.hydrated);
}

export function useCustomer() {
  const id = useStore((s) => s.session.customerId);
  return useStore((s) => (id ? s.db.customers.find((c) => c.id === id) : undefined));
}

export function useStaff() {
  const id = useStore((s) => s.session.staffId);
  return useStore((s) => (id ? s.db.staff.find((c) => c.id === id) : undefined));
}

function subscribeMedia(query: string) {
  return (cb: () => void) => {
    const m = window.matchMedia(query);
    m.addEventListener("change", cb);
    return () => m.removeEventListener("change", cb);
  };
}

export function useMedia(query: string, serverFallback = false) {
  return useSyncExternalStore(
    subscribeMedia(query),
    () => window.matchMedia(query).matches,
    () => serverFallback,
  );
}

export const useIsDesktop = () => useMedia("(min-width: 1024px)", true);
export const usePrefersReducedMotion = () => useMedia("(prefers-reduced-motion: reduce)", false);

export function hasWebGL(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
