import { churnRisk } from "./ai";
import { tierFor } from "./catalog";
import type { Customer, DB } from "./types";
import { DAY, HOUR, MIN, addDays, fmtShortDate, fmtWeekday, startOfDay } from "./time";

// Read models for the Command Center, computed from the same shared data the customer app writes.

export function courtRevenue(db: DB, from: number, to: number, courtId?: string) {
  return db.bookings
    .filter((b) => b.kind !== "maintenance" && b.start >= from && b.start < to && (!courtId || b.courtId === courtId))
    .reduce((s, b) => s + (b.status === "confirmed" ? b.price : b.price - b.payment.refunded), 0);
}

export function cafeRevenue(db: DB, from: number, to: number) {
  return db.orders.filter((o) => o.createdAt >= from && o.createdAt < to && o.stage !== "cancelled").reduce((s, o) => s + o.total, 0);
}

export function stayRevenue(db: DB, from: number, to: number) {
  let sum = 0;
  for (const s of db.stays) {
    if (s.status === "cancelled") continue;
    const nights = Math.max(1, Math.round((s.checkOut - s.checkIn) / DAY));
    for (let n = 0; n < nights; n++) {
      const night = startOfDay(s.checkIn) + n * DAY;
      if (night >= from && night < to) sum += s.total / nights;
    }
  }
  return sum;
}

export function revenueByDay(db: DB, days: number, now: number) {
  const today = startOfDay(now);
  return Array.from({ length: days }, (_, i) => {
    const day = addDays(today, i - days + 1);
    const next = day + DAY;
    return {
      day,
      label: days > 8 ? fmtShortDate(day).split(" ")[0] : fmtWeekday(day),
      values: { courts: courtRevenue(db, day, next), cafe: cafeRevenue(db, day, next), stays: stayRevenue(db, day, next) },
    };
  });
}

export function occupancy(db: DB, day: number) {
  const occupied = db.units.filter((u) => db.stays.some((s) => s.unitId === u.id && s.status !== "cancelled" && s.checkIn < day + DAY && s.checkOut > day + 12 * HOUR)).length;
  return occupied / db.units.length;
}

export function topItems(db: DB, from: number) {
  const m = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const o of db.orders) {
    if (o.createdAt < from) continue;
    for (const l of o.lines) {
      const x = m.get(l.itemId) ?? { name: l.name, qty: 0, revenue: 0 };
      x.qty += l.qty;
      x.revenue += l.qty * l.unitPrice;
      m.set(l.itemId, x);
    }
  }
  return [...m.values()].sort((a, b) => b.revenue - a.revenue);
}

export function customerStats(db: DB, c: Customer, now: number) {
  const bookings = db.bookings.filter((b) => b.customerId === c.id && b.status === "confirmed" && b.kind !== "maintenance");
  const spendCourts = bookings.reduce((s, b) => s + b.price, 0);
  const orders = db.orders.filter((o) => o.customerId === c.id);
  const spendCafe = orders.reduce((s, o) => s + o.total, 0);
  const stays = db.stays.filter((s) => s.customerId === c.id && s.status !== "cancelled");
  const spendStays = stays.reduce((s, x) => s + x.total, 0);
  return {
    sessions: bookings.filter((b) => b.start < now).length,
    upcoming: bookings.filter((b) => b.start >= now).length,
    orders: orders.length,
    stays: stays.length,
    spend: spendCourts + spendCafe + spendStays,
    spendCourts,
    spendCafe,
    spendStays,
    tier: tierFor(c.loyalty.lifetime),
    churn: churnRisk(db, c, now),
  };
}

export interface Segment {
  id: string;
  label: string;
  description: string;
  match: (c: Customer, s: ReturnType<typeof customerStats>) => boolean;
}

export const SEGMENTS: Segment[] = [
  { id: "all", label: "Everyone", description: "All members", match: () => true },
  { id: "regulars", label: "Regulars", description: "8+ sessions", match: (_c, s) => s.sessions >= 8 },
  { id: "lapsed", label: "Lapsed · churn risk", description: "High churn-risk score", match: (_c, s) => s.churn.label === "High" },
  { id: "high-value", label: "High value", description: "Top spenders, $600+", match: (_c, s) => s.spend >= 600 },
  { id: "weekday-flex", label: "Weekday flex", description: "Free afternoons, price-sensitive", match: (c) => (c.preferredHour ?? 19) < 17 || c.tags.includes("parent") },
  { id: "cafe-lovers", label: "Sip lovers", description: "5+ café orders", match: (_c, s) => s.orders >= 5 },
  { id: "parents", label: "Parents", description: "Bring the little ones", match: (c) => c.tags.includes("parent") },
  { id: "new", label: "New this month", description: "Joined in the last 30 days", match: (c) => c.isDemoGuest === true || c.tags.includes("new") },
];

export function segmentMembers(db: DB, segmentId: string, now: number) {
  const seg = SEGMENTS.find((s) => s.id === segmentId) ?? SEGMENTS[0];
  return db.customers.filter((c) => seg.match(c, customerStats(db, c, now)));
}

export function mask(value: string, allowed: boolean) {
  if (allowed) return value;
  if (value.includes("@")) return value.replace(/^(.).*(@.*)$/, "$1•••$2");
  return value.replace(/\d(?=\d{2})/g, "•");
}

export function liveMinutes(now: number) {
  return Math.round((now % HOUR) / MIN);
}
