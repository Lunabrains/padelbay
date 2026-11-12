import { churnRisk } from "./ai";
import { KEY_WINDOW_MIN, tierFor } from "./catalog";
import type { Booking, Customer, DB, Locker } from "./types";
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

export function revenueByDay(db: DB, days: number, now: number) {
  const today = startOfDay(now);
  return Array.from({ length: days }, (_, i) => {
    const day = addDays(today, i - days + 1);
    const next = day + DAY;
    return {
      day,
      label: days > 8 ? fmtShortDate(day).split(" ")[0] : fmtWeekday(day),
      values: { courts: courtRevenue(db, day, next), cafe: cafeRevenue(db, day, next) },
    };
  });
}

export type LockerLive = "ready" | "assigned" | "active" | "check" | "maintenance";

/** What a locker is doing right now, from its own state plus the bookings that use it. */
export function lockerLive(db: DB, l: Locker, now: number): { state: LockerLive; booking?: Booking; next?: Booking } {
  if (l.status === "maintenance") return { state: "maintenance" };
  const uses = db.bookings.filter((b) => b.lockerId === l.id && b.status === "confirmed").sort((a, b) => a.start - b.start);
  const win = (b: Booking) => [b.start - KEY_WINDOW_MIN * MIN, b.start + (b.durationMin + KEY_WINDOW_MIN) * MIN] as const;
  const active = uses.find((b) => win(b)[0] <= now && now <= win(b)[1]);
  if (active) return { state: "active", booking: active };
  // a session that ended since the last kit check needs a count before the next player
  const returned = uses.filter((b) => win(b)[1] < now && win(b)[1] > l.lastCheckedAt).pop();
  const next = uses.find((b) => win(b)[0] > now);
  if (l.status === "check" || returned) return { state: "check", booking: returned, next };
  if (next && next.start - now < 12 * 60 * MIN) return { state: "assigned", next };
  return { state: "ready", next };
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
  return {
    sessions: bookings.filter((b) => b.start < now).length,
    upcoming: bookings.filter((b) => b.start >= now).length,
    orders: orders.length,
    spend: spendCourts + spendCafe,
    spendCourts,
    spendCafe,
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
