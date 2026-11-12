"use client";

import { bookCourt, cancelBooking, ensureCourtPass, placeOrder, unlockDoor } from "./actions";
import { KEY_WINDOW_MIN } from "./catalog";
import { slotStatus } from "./engine/availability";
import { getDB } from "./store";
import type { OrderLine } from "./types";
import { MIN, addDays, atHour, startOfDay } from "./time";

// Demo traffic for the Command Center: realistic guests booking, ordering, reserving and
// cancelling through the same actions the customer app uses, so every number stays consistent.

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export type SimKind = "booking" | "order" | "locker" | "cancel";

export function simulateOnce(kind?: SimKind): string | null {
  const db = getDB();
  const now = Date.now();
  const members = db.customers.filter((c) => !c.isDemoGuest);
  if (!members.length) return null;
  const r = Math.random();
  const k: SimKind = kind ?? (r < 0.45 ? "booking" : r < 0.85 ? "order" : r < 0.93 ? "locker" : "cancel");

  if (k === "booking") {
    for (let attempt = 0; attempt < 40; attempt++) {
      const day = addDays(startOfDay(now), Math.floor(Math.random() * 4));
      const hour = 8 + Math.floor(Math.random() * 28) / 2;
      const dur = pick([60, 90, 90, 120]);
      if (hour + dur / 60 > 24) continue;
      const start = atHour(day, Math.floor(hour), (hour % 1) * 60);
      if (start < now + 20 * MIN) continue;
      const court = pick(db.courts);
      if (slotStatus(db, court.id, start, dur, now) !== "free") continue;
      const c = pick(members);
      const friends = members.filter((m) => m.id !== c.id).sort(() => Math.random() - 0.5).slice(0, 1 + Math.floor(Math.random() * 3));
      const res = bookCourt({
        customerId: c.id,
        courtId: court.id,
        start,
        durationMin: dur,
        players: friends.map((f) => ({ customerId: f.id, name: f.name, status: "accepted" })),
        splitPayment: Math.random() > 0.4,
        weeks: Math.random() < 0.08 ? 4 : 1,
        paymentMethod: pick(["Apple Pay", "Card •••• 4242", "Apple Pay", "Pay at venue"]),
        openMatch: Math.random() < 0.12,
        source: Math.random() < 0.3 ? "concierge" : "app",
      });
      if (res.ok) return `Booking · ${c.name} · ${court.short}`;
    }
    return null;
  }

  if (k === "order") {
    const inPlay = db.bookings.filter((b) => b.status === "confirmed" && b.kind !== "maintenance" && b.start <= now && b.start + b.durationMin * MIN > now);
    const toCourt = inPlay.length > 0 && Math.random() < 0.65;
    const booking = toCourt ? pick(inPlay) : undefined;
    const customer = booking ? db.customers.find((c) => c.id === booking.customerId) ?? pick(members) : pick(members);
    const items = db.menu.filter((m) => m.available).sort(() => Math.random() - 0.5).slice(0, 1 + Math.floor(Math.random() * 3));
    const lines: OrderLine[] = items.map((m) => ({ itemId: m.id, name: m.name, qty: Math.random() < 0.25 ? 2 : 1, unitPrice: m.price, options: [], optionsLabel: "" }));
    const court = booking ? db.courts.find((c) => c.id === booking.courtId) : undefined;
    const res = placeOrder({
      customerId: customer.id,
      lines,
      deliverTo: court ? { kind: "court", refId: court.id, label: court.short } : { kind: "pickup", label: "Pickup at Sip" },
      method: pick(["Apple Pay", "Card •••• 4242"]),
    });
    return res.ok ? `Sip order #${res.value.number} · ${customer.name}` : null;
  }

  if (k === "locker") {
    // a player arriving: their club card opens the kit locker inside the key window
    const inWindow = db.bookings.filter(
      (b) => b.status === "confirmed" && b.kind !== "maintenance" && b.start - KEY_WINDOW_MIN * MIN <= now && now <= b.start + (b.durationMin + KEY_WINDOW_MIN) * MIN,
    );
    if (!inWindow.length) return null;
    const b = pick(inWindow);
    const key = ensureCourtPass(b.id);
    if (!key.ok) return null;
    const res = unlockDoor(key.value, "Card", { door: "locker" });
    const c = db.customers.find((x) => x.id === b.customerId);
    return res.ok ? `${res.value.door} opened · ${c?.name ?? "guest"}` : null;
  }

  // cancel: a member drops an upcoming session, the recovery flow kicks in
  const upcoming = db.bookings.filter((b) => b.status === "confirmed" && b.kind !== "maintenance" && b.start > now + HOUR_MS && b.start < now + 3 * 24 * 60 * MIN && !db.customers.find((c) => c.id === b.customerId)?.isDemoGuest);
  if (!upcoming.length) return null;
  const b = pick(upcoming);
  const res = cancelBooking(b.id, { type: "customer", id: b.customerId });
  return res.ok ? "Cancellation" : null;
}

const HOUR_MS = 60 * MIN;

export function simulateBurst(n = 8) {
  const kinds: SimKind[] = ["booking", "order", "booking", "order", "locker", "order", "booking", "cancel", "order", "booking"];
  const done: string[] = [];
  for (let i = 0; i < n; i++) {
    const r = simulateOnce(kinds[i % kinds.length]);
    if (r) done.push(r);
  }
  return done;
}
