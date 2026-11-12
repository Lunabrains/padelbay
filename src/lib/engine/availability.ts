import { CLOSE_HOUR, MIN, OPEN_HOUR, atHour, overlaps } from "../time";
import type { Customer, DB } from "../types";
import { quote } from "./pricing";

export type SlotStatus = "free" | "booked" | "held" | "past" | "maintenance";

export interface Slot {
  start: number;
  status: SlotStatus;
  price: number;
  listPrice: number;
  promo?: string;
  peak: boolean;
}

export function slotStatus(db: DB, courtId: string, start: number, durationMin: number, now: number, ownerKey?: string): SlotStatus {
  if (start < now - 5 * MIN) return "past";
  const court = db.courts.find((c) => c.id === courtId);
  if (!court || court.status === "maintenance") return "maintenance";
  const clash = db.bookings.find((b) => b.courtId === courtId && b.status === "confirmed" && overlaps(b.start, b.durationMin, start, durationMin));
  if (clash) return clash.kind === "maintenance" ? "maintenance" : "booked";
  if (db.holds.some((h) => h.courtId === courtId && h.expiresAt > now && h.ownerKey !== ownerKey && overlaps(h.start, h.durationMin, start, durationMin))) return "held";
  return "free";
}

/** Every 30-minute start on a day for one court, with live status and the member's price. */
export function daySlots(db: DB, courtId: string, day: number, durationMin: number, now: number, customer?: Customer | null, ownerKey?: string): Slot[] {
  const court = db.courts.find((c) => c.id === courtId)!;
  const out: Slot[] = [];
  for (let h = OPEN_HOUR; h + durationMin / 60 <= CLOSE_HOUR; h += 0.5) {
    const start = atHour(day, Math.floor(h), (h % 1) * 60);
    const q = quote(court, start, durationMin, { customer, promos: db.promos, now });
    out.push({ start, status: slotStatus(db, courtId, start, durationMin, now, ownerKey), price: q.price, listPrice: q.listPrice, promo: q.promo?.label, peak: q.peak });
  }
  return out;
}

export function nextFreeSlots(db: DB, now: number, durationMin = 90, limit = 6, customer?: Customer | null) {
  const res: { courtId: string; start: number; price: number; promo?: string }[] = [];
  const startFrom = Math.ceil(now / (30 * MIN)) * 30 * MIN;
  for (let t = startFrom; res.length < limit && t < startFrom + 36 * 60 * MIN; t += 30 * MIN) {
    const h = new Date(t).getHours() + new Date(t).getMinutes() / 60;
    if (h < OPEN_HOUR || h + durationMin / 60 > CLOSE_HOUR) continue;
    for (const c of db.courts) {
      if (res.length >= limit) break;
      if (res.some((r) => r.start === t)) continue;
      if (slotStatus(db, c.id, t, durationMin, now) === "free") {
        const q = quote(c, t, durationMin, { customer, promos: db.promos, now });
        res.push({ courtId: c.id, start: t, price: q.price, promo: q.promo?.label });
      }
    }
  }
  return res;
}

export function utilization(db: DB, courtId: string | null, from: number, to: number) {
  const courts = courtId ? [courtId] : db.courts.map((c) => c.id);
  const capacity = courts.length * ((to - from) / MIN);
  let used = 0;
  for (const b of db.bookings) {
    if (b.status !== "confirmed" || !courts.includes(b.courtId)) continue;
    const s = Math.max(from, b.start);
    const e = Math.min(to, b.start + b.durationMin * MIN);
    if (e > s) used += (e - s) / MIN;
  }
  return capacity ? used / capacity : 0;
}
