"use client";

import { ACHIEVEMENTS, CANCELLATION, OPTION_GROUPS, POINTS_PER_DOLLAR, WELCOME_POINTS, tierFor, type Tier } from "./catalog";
import { quote } from "./engine/pricing";
import { getDB, useStore } from "./store";
import type { Actor, Booking, Customer, DB, InvitedPlayer, Notice, Order, OrderLine, OrderStage } from "./types";
import { DAY, HOUR, MIN, addDays, atHour, fmtDate, fmtRange, fmtTime, overlaps } from "./time";

// Front-end "service layer": every mutation validates against the latest shared state,
// writes an audit entry, and raises notices for staff and the customer.

const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const code = () => Math.random().toString(36).slice(2, 8).toUpperCase();

export interface Reward {
  points: number;
  unlocked: { id: string; name: string; points: number }[];
  levelUp?: { from: Tier; to: Tier };
}

export type Result<T> = { ok: true; value: T; reward?: Reward } | { ok: false; error: string };

function audit(db: DB, actor: Actor, action: string, entity: string, summary: string, entityId?: string) {
  db.audit.unshift({ id: uid("au"), at: Date.now(), actor, action, entity, entityId, summary });
  if (db.audit.length > 400) db.audit.length = 400;
}

function notify(db: DB, n: Omit<Notice, "id" | "at" | "read">) {
  db.notices.unshift({ ...n, id: uid("nt"), at: Date.now(), read: false });
  if (db.notices.length > 200) db.notices.length = 200;
}

function award(db: DB, customerId: string, points: number, achievementIds: string[] = []): Reward {
  const c = db.customers.find((x) => x.id === customerId);
  const reward: Reward = { points: 0, unlocked: [] };
  if (!c) return reward;
  const before = tierFor(c.loyalty.lifetime);
  for (const aid of achievementIds) {
    if (c.achievements.some((a) => a.id === aid)) continue;
    const def = ACHIEVEMENTS.find((a) => a.id === aid);
    if (!def) continue;
    c.achievements.push({ id: aid, at: Date.now() });
    reward.unlocked.push({ id: def.id, name: def.name, points: def.points });
    points += def.points;
  }
  c.loyalty.points += points;
  c.loyalty.lifetime += points;
  reward.points = points;
  const after = tierFor(c.loyalty.lifetime);
  if (after.id !== before.id) {
    reward.levelUp = { from: before, to: after };
    notify(db, { kind: "loyalty", title: `${c.name} reached ${after.name}`, body: `${before.name} → ${after.name}. ${after.character} unlocked.`, severity: "success", audience: "staff", ref: { kind: "customer", id: c.id } });
    notify(db, { kind: "loyalty", title: `Welcome to ${after.name}`, body: `${after.character} joins your squad. ${after.privileges[0]}.`, severity: "success", audience: "customer", customerId: c.id });
    audit(db, { type: "system" }, "loyalty.level_up", "customer", `${c.name} moved from ${before.name} to ${after.name}`, c.id);
  }
  return reward;
}

class AbortCommit extends Error {}

/** Run a mutation against a fresh copy of the shared state; a failed validation writes nothing. */
function safeCommit<T>(fn: (db: DB) => Result<T>): Result<T> {
  let result: Result<T> | null = null;
  try {
    useStore.getState().commit((db) => {
      result = fn(db);
      if (!result.ok) throw new AbortCommit();
    });
  } catch (e) {
    if (!(e instanceof AbortCommit)) throw e;
  }
  return (result as Result<T> | null) ?? { ok: false, error: "Nothing happened" };
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export function createCustomer(input: { name: string; phone: string; email: string; rating: number }): Result<Customer> {
  const name = input.name.trim();
  if (name.length < 2) return { ok: false, error: "Please add your name" };
  if (!/^\+?[\d\s-]{7,}$/.test(input.phone.trim())) return { ok: false, error: "Add a valid phone number" };
  const res = safeCommit<Customer>((db) => {
    const c: Customer = {
      id: uid("cu"),
      name,
      phone: input.phone.trim(),
      email: input.email.trim(),
      hue: Math.floor(Math.random() * 360),
      createdAt: Date.now(),
      lastVisitAt: Date.now(),
      skill: { rating: input.rating, matches: 0, wins: 0, side: "both", style: "all-round" },
      loyalty: { points: WELCOME_POINTS, lifetime: WELCOME_POINTS },
      achievements: [],
      marketingOptIn: true,
      tags: ["new"],
      favoriteItems: [],
      credit: 0,
      isDemoGuest: true,
    };
    db.customers.unshift(c);
    notify(db, { kind: "system", title: "New member joined", body: `${c.name} signed up in the app · Rookie`, severity: "info", audience: "staff", ref: { kind: "customer", id: c.id } });
    audit(db, { type: "customer", id: c.id }, "customer.signup", "customer", `${c.name} created an account`, c.id);
    return { ok: true, value: c };
  });
  if (res.ok) useStore.getState().setSession({ customerId: res.value.id });
  return res;
}

export function signInCustomer(customerId: string) {
  useStore.getState().setSession({ customerId });
}

export function signOutCustomer() {
  useStore.getState().setSession({ customerId: undefined });
}

// ---------------------------------------------------------------------------
// Courts
// ---------------------------------------------------------------------------

export function slotConflict(db: DB, courtId: string, start: number, durationMin: number, ownerKey?: string): string | null {
  const court = db.courts.find((c) => c.id === courtId);
  if (!court) return "Unknown court";
  if (court.status === "maintenance") return `${court.short} is under maintenance`;
  const clash = db.bookings.find((b) => b.courtId === courtId && b.status === "confirmed" && overlaps(b.start, b.durationMin, start, durationMin));
  if (clash) return `${court.short} is already booked ${fmtRange(clash.start, clash.durationMin)}`;
  const held = db.holds.find((h) => h.courtId === courtId && h.expiresAt > Date.now() && h.ownerKey !== ownerKey && overlaps(h.start, h.durationMin, start, durationMin));
  if (held) return `Someone is checking out ${court.short} at ${fmtTime(held.start)} right now`;
  return null;
}

/** Soft-lock a slot for five minutes while the customer pays. */
export function holdSlot(courtId: string, start: number, durationMin: number, ownerKey: string): Result<string> {
  return safeCommit((db) => {
    db.holds = db.holds.filter((h) => h.expiresAt > Date.now() && h.ownerKey !== ownerKey);
    const conflict = slotConflict(db, courtId, start, durationMin, ownerKey);
    if (conflict) return { ok: false, error: conflict };
    const id = uid("hd");
    db.holds.push({ id, courtId, start, durationMin, ownerKey, expiresAt: Date.now() + 5 * MIN });
    return { ok: true, value: id };
  });
}

export function releaseHold(ownerKey: string) {
  const db = getDB();
  if (!db.holds.some((h) => h.ownerKey === ownerKey)) return;
  useStore.getState().commit((d) => {
    d.holds = d.holds.filter((h) => h.ownerKey !== ownerKey);
  });
}

export interface BookingRequest {
  customerId: string;
  courtId: string;
  start: number;
  durationMin: number;
  players: InvitedPlayer[];
  splitPayment: boolean;
  weeks: number;
  paymentMethod: string;
  openMatch: boolean;
  source: Booking["source"];
  ownerKey?: string;
}

export function bookCourt(req: BookingRequest): Result<{ bookings: Booking[]; passId: string }> {
  return safeCommit((db) => {
    const customer = db.customers.find((c) => c.id === req.customerId);
    if (!customer) return { ok: false, error: "Sign in to book" };
    const court = db.courts.find((c) => c.id === req.courtId)!;
    if (req.start < Date.now() - 10 * MIN) return { ok: false, error: "That time has already passed" };
    if (![60, 90, 120].includes(req.durationMin)) return { ok: false, error: "Choose 60, 90 or 120 minutes" };
    const tier = tierFor(customer.loyalty.lifetime);
    if (req.start > addDays(Date.now(), tier.bookAheadDays + 1)) return { ok: false, error: `${tier.name} members can book ${tier.bookAheadDays} days ahead` };

    const weeks = Math.max(1, Math.min(8, req.weeks));
    const occurrences = Array.from({ length: weeks }, (_, i) => addDays(req.start, i * 7));
    for (const start of occurrences) {
      const conflict = slotConflict(db, req.courtId, start, req.durationMin, req.ownerKey);
      if (conflict) return { ok: false, error: weeks > 1 ? `Week of ${fmtDate(start)}: ${conflict}` : conflict };
    }

    const groupId = weeks > 1 ? uid("rg") : undefined;
    const created: Booking[] = [];
    let spend = 0;
    for (const start of occurrences) {
      const q = quote(court, start, req.durationMin, { customer, promos: db.promos });
      const b: Booking = {
        id: uid("bk"),
        courtId: req.courtId,
        customerId: customer.id,
        start,
        durationMin: req.durationMin,
        status: "confirmed",
        price: q.price,
        listPrice: q.listPrice,
        discountLabel: q.label,
        players: req.players,
        splitPayment: req.splitPayment,
        recurringGroupId: groupId,
        createdAt: Date.now(),
        source: req.source,
        payment: { method: req.paymentMethod, status: req.paymentMethod === "Pay at venue" ? "pay-at-venue" : "paid", refunded: 0 },
        kind: "play",
      };
      created.push(b);
      spend += q.price;
    }
    db.bookings.push(...created);
    db.holds = db.holds.filter((h) => h.ownerKey !== req.ownerKey);

    // Digital access pass for the first session: valid 15 minutes before until the end.
    const first = created[0];
    const passId = uid("ps");
    db.passes.unshift({
      id: passId,
      holderId: customer.id,
      kind: "court",
      refId: first.id,
      label: `${court.short} · ${fmtDate(first.start)} ${fmtRange(first.start, first.durationMin)}`,
      door: `${court.short} gate`,
      code: code(),
      validFrom: first.start - 15 * MIN,
      validTo: first.start + first.durationMin * MIN,
      status: "active",
      issuedAt: Date.now(),
    });
    first.passId = passId;

    if (req.openMatch) {
      const m = {
        id: uid("mt"),
        courtId: req.courtId,
        start: first.start,
        durationMin: first.durationMin,
        hostId: customer.id,
        playerIds: [customer.id, ...req.players.filter((p) => p.customerId).map((p) => p.customerId!)],
        level: [Math.max(1, customer.skill.rating - 0.7), customer.skill.rating + 0.7] as [number, number],
        pricePerPlayer: Math.round((first.price / 4) * 100) / 100,
        note: "Hosted from the app",
        bookingId: first.id,
        createdAt: Date.now(),
      };
      db.matches.push(m);
      first.openMatchId = m.id;
    }

    customer.lastVisitAt = Math.max(customer.lastVisitAt, Date.now());
    const h = new Date(first.start).getHours();
    const ach = ["first-serve"];
    if (h < 9) ach.push("early-bird");
    if (h >= 21) ach.push("night-owl");
    if (req.players.length >= 3) ach.push("squad-up");
    if (weeks > 1) ach.push("regular");
    if (req.openMatch) ach.push("open-court");
    if (req.source === "concierge") ach.push("ask-the-bay");
    const reward = award(db, customer.id, Math.round(spend * POINTS_PER_DOLLAR.courts), ach);

    notify(db, {
      kind: "booking",
      title: `New booking · ${court.short}`,
      body: `${customer.name} · ${fmtDate(first.start)} ${fmtRange(first.start, first.durationMin)}${weeks > 1 ? ` · weekly ×${weeks}` : ""} · $${spend.toFixed(2)}`,
      severity: "success",
      audience: "staff",
      ref: { kind: "booking", id: first.id },
    });
    audit(db, { type: "customer", id: customer.id }, "booking.create", "booking", `${customer.name} booked ${court.short} ${fmtDate(first.start)} ${fmtRange(first.start, first.durationMin)} via ${req.source}`, first.id);
    audit(db, { type: "system" }, "access.issue", "pass", `Digital pass issued for ${court.short} gate`, passId);
    return { ok: true, value: { bookings: created, passId }, reward };
  });
}

export function refundFor(b: Booking, now = Date.now(), freeHours = CANCELLATION.fullRefundHours) {
  const hours = (b.start - now) / HOUR;
  if (hours >= freeHours) return { rate: 1, label: freeHours < CANCELLATION.fullRefundHours ? "Full refund (level perk)" : "Full refund" };
  if (hours >= CANCELLATION.partialRefundHours) return { rate: CANCELLATION.partialRate, label: "50% refund" };
  return { rate: 0, label: "No refund · 80% back as credit if the slot is re-booked" };
}

export function cancelBooking(bookingId: string, by: Actor): Result<{ refund: number; offeredTo?: string }> {
  return safeCommit((db) => {
    const b = db.bookings.find((x) => x.id === bookingId);
    if (!b || b.status !== "confirmed") return { ok: false, error: "Booking not found" };
    const customer = db.customers.find((c) => c.id === b.customerId);
    const tier = customer ? tierFor(customer.loyalty.lifetime) : null;
    const { rate } = refundFor(b, Date.now(), tier?.freeCancelHours);
    const refund = Math.round(b.price * rate * 100) / 100;
    b.status = "cancelled";
    b.cancelledAt = Date.now();
    b.payment.refunded = refund;
    b.payment.status = rate === 1 ? "refunded" : rate > 0 ? "partial-refund" : b.payment.status;
    db.passes.filter((p) => p.refId === b.id).forEach((p) => (p.status = "revoked"));
    const court = db.courts.find((c) => c.id === b.courtId)!;

    // Smart cancellation recovery: offer the slot to the waitlist first, then to a likely player.
    let offeredTo: string | undefined;
    const wait = db.waitlist.find((w) => w.status === "waiting" && (w.courtId === null || w.courtId === b.courtId) && overlaps(w.start, w.durationMin, b.start, b.durationMin));
    if (wait) {
      wait.status = "offered";
      wait.offeredAt = Date.now();
      offeredTo = db.customers.find((c) => c.id === wait.customerId)?.name;
      notify(db, { kind: "booking", title: "A court opened up for you", body: `${court.short} ${fmtDate(b.start)} ${fmtRange(b.start, b.durationMin)} is yours if you want it.`, severity: "success", audience: "customer", customerId: wait.customerId });
    } else {
      const likely = db.customers.find((c) => c.preferredHour === new Date(b.start).getHours() && c.id !== b.customerId);
      offeredTo = likely?.name;
    }
    notify(db, {
      kind: "ai",
      title: `Cancellation recovery · ${court.short}`,
      body: `${fmtDate(b.start)} ${fmtRange(b.start, b.durationMin)} freed. ${offeredTo ? `Offered to ${offeredTo}${wait ? " (waitlist)" : " (likely player, AI)"}.` : "Released to open booking."}`,
      severity: "info",
      audience: "staff",
      ref: { kind: "booking", id: b.id },
    });
    audit(db, by, "booking.cancel", "booking", `${customer?.name ?? "Booking"} cancelled ${court.short} ${fmtDate(b.start)}; refund $${refund.toFixed(2)}`, b.id);
    return { ok: true, value: { refund, offeredTo } };
  });
}

export function joinWaitlist(customerId: string, courtId: string | null, start: number, durationMin: number): Result<string> {
  return safeCommit((db) => {
    if (db.waitlist.some((w) => w.customerId === customerId && w.start === start && w.status === "waiting")) return { ok: false, error: "You're already on this waitlist" };
    const id = uid("wl");
    db.waitlist.push({ id, customerId, courtId, start, durationMin, createdAt: Date.now(), status: "waiting" });
    const c = db.customers.find((x) => x.id === customerId);
    notify(db, { kind: "booking", title: "Waitlist join", body: `${c?.name} is waiting for ${fmtDate(start)} ${fmtRange(start, durationMin)}`, severity: "info", audience: "staff" });
    audit(db, { type: "customer", id: customerId }, "waitlist.join", "waitlist", `${c?.name} joined the waitlist for ${fmtDate(start)} ${fmtTime(start)}`, id);
    return { ok: true, value: id };
  });
}

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

export function unlockDoor(passId: string, method: "QR" | "BLE" | "NFC" | "Card"): Result<{ granted: boolean; reason?: string }> {
  const res = safeCommit<{ granted: boolean; reason?: string }>((db) => {
    const p = db.passes.find((x) => x.id === passId);
    if (!p) return { ok: false, error: "Pass not found" };
    const now = Date.now();
    // Demo mode: a pass for a future session is accepted so the presenter can show the unlock.
    const granted = p.status === "active" && now <= p.validTo;
    const reason = p.status !== "active" ? "Pass revoked" : now > p.validTo ? "Pass expired" : undefined;
    db.accessLogs.unshift({ id: uid("al"), at: now, passId: p.id, holderId: p.holderId, door: p.door, method, result: granted ? "granted" : "denied", reason });
    const holder = db.customers.find((c) => c.id === p.holderId);
    audit(db, { type: "customer", id: p.holderId }, granted ? "access.granted" : "access.denied", "door", `${p.door} ${granted ? "opened" : "refused"} for ${holder?.name} via ${method}`, p.id);
    notify(db, { kind: "access", title: `${p.door} ${granted ? "unlocked" : "refused"}`, body: `${holder?.name} · ${method === "Card" ? "Padel Bay Club card" : `${method} digital key`}${reason ? ` · ${reason}` : ""}`, severity: granted ? "info" : "warning", audience: "staff", ref: { kind: "pass", id: p.id } });
    const reward = granted ? award(db, p.holderId, 0, ["key-holder"]) : undefined;
    return { ok: true, value: { granted, reason }, reward };
  });
  return res;
}

/** The club card opens any confirmed court booking: issue its door credential on first tap. */
export function ensureCourtPass(bookingId: string): Result<string> {
  const existing = getDB().bookings.find((b) => b.id === bookingId)?.passId;
  if (existing) return { ok: true, value: existing };
  return safeCommit((db) => {
    const b = db.bookings.find((x) => x.id === bookingId);
    if (!b || b.status !== "confirmed") return { ok: false, error: "Booking not found" };
    const court = db.courts.find((c) => c.id === b.courtId)!;
    const passId = uid("ps");
    db.passes.unshift({
      id: passId,
      holderId: b.customerId,
      kind: "court",
      refId: b.id,
      label: `${court.short} · ${fmtDate(b.start)} ${fmtRange(b.start, b.durationMin)}`,
      door: `${court.short} gate`,
      code: code(),
      validFrom: b.start - 15 * MIN,
      validTo: b.start + b.durationMin * MIN,
      status: "active",
      issuedAt: Date.now(),
    });
    b.passId = passId;
    return { ok: true, value: passId };
  });
}

export function revokePass(passId: string, staffId: string): Result<true> {
  return safeCommit((db) => {
    const p = db.passes.find((x) => x.id === passId);
    if (!p) return { ok: false, error: "Pass not found" };
    p.status = "revoked";
    audit(db, { type: "staff", id: staffId }, "access.revoke", "pass", `Revoked ${p.door} key`, p.id);
    return { ok: true, value: true };
  });
}

// ---------------------------------------------------------------------------
// Café
// ---------------------------------------------------------------------------

export function linePrice(itemPrice: number, options: OrderLine["options"]): number {
  let p = itemPrice;
  for (const o of options) {
    const g = OPTION_GROUPS[o.groupId];
    for (const cid of o.choiceIds) p += g?.choices.find((c) => c.id === cid)?.price ?? 0;
  }
  return Math.round(p * 100) / 100;
}

export const ORDER_FLOW: { stage: OrderStage; label: string; at: number }[] = [
  { stage: "received", label: "Received", at: 0 },
  { stage: "preparing", label: "Preparing", at: 12 },
  { stage: "ready", label: "Ready", at: 55 },
  { stage: "delivering", label: "On its way", at: 75 },
  { stage: "delivered", label: "Delivered", at: 115 },
];

/** Demo clock: orders move through the kitchen in about two minutes unless staff take over. */
export function orderStage(o: Order, now = Date.now()): OrderStage {
  if (!o.autoFlow) return o.stage;
  const s = (now - o.createdAt) / 1000;
  let stage: OrderStage = "received";
  for (const f of ORDER_FLOW) {
    if (f.stage === "delivering" && o.deliverTo.kind === "pickup") continue;
    if (s >= f.at) stage = f.stage;
  }
  return stage;
}

export function placeOrder(input: { customerId: string; lines: OrderLine[]; deliverTo: Order["deliverTo"]; method: string; note?: string }): Result<Order> {
  return safeCommit((db) => {
    if (!input.lines.length) return { ok: false, error: "Your cart is empty" };
    const customer = db.customers.find((c) => c.id === input.customerId);
    if (!customer) return { ok: false, error: "Sign in to order" };
    for (const l of input.lines) {
      const item = db.menu.find((m) => m.id === l.itemId);
      if (!item?.available) return { ok: false, error: `${l.name} just sold out` };
    }
    const total = Math.round(input.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0) * 100) / 100;
    db.orderSeq += 1;
    const order: Order = {
      id: uid("or"),
      number: db.orderSeq,
      customerId: customer.id,
      lines: input.lines,
      total,
      deliverTo: input.deliverTo,
      createdAt: Date.now(),
      autoFlow: true,
      stage: "received",
      history: [{ stage: "received", at: Date.now() }],
      payment: { method: input.method, status: input.deliverTo.kind === "suite" && input.method === "Charge to suite" ? "charged-to-suite" : "paid" },
      note: input.note,
    };
    db.orders.push(order);
    for (const l of input.lines) {
      const item = db.menu.find((m) => m.id === l.itemId)!;
      for (const u of item.uses) {
        const inv = db.inventory.find((i) => i.id === u.inventoryId);
        if (!inv) continue;
        const wasAbove = inv.qty > inv.reorderAt;
        inv.qty = Math.max(0, Math.round((inv.qty - u.qty * l.qty) * 1000) / 1000);
        if (wasAbove && inv.qty <= inv.reorderAt) {
          notify(db, { kind: "alert", title: `${inv.name} below reorder point`, body: `${inv.qty} ${inv.unit} left. AI suggests reordering ${Math.round(inv.par - inv.qty)} ${inv.unit}.`, severity: "warning", audience: "staff", ref: { kind: "inventory", id: inv.id } });
        }
      }
    }
    if (input.deliverTo.kind === "suite") {
      const stay = db.stays.find((s) => s.id === input.deliverTo.refId);
      stay?.folio.push({ label: `Sip order #${order.number}`, amount: total, at: Date.now() });
    }
    const ach = input.deliverTo.kind === "court" ? ["sip-and-play"] : [];
    const reward = award(db, customer.id, Math.round(total * POINTS_PER_DOLLAR.cafe), ach);
    notify(db, { kind: "order", title: `Sip order #${order.number}`, body: `${customer.name} · ${input.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")} → ${input.deliverTo.label}`, severity: "info", audience: "staff", ref: { kind: "order", id: order.id } });
    audit(db, { type: "customer", id: customer.id }, "order.create", "order", `Order #${order.number} to ${input.deliverTo.label} · $${total.toFixed(2)}`, order.id);
    return { ok: true, value: order, reward };
  });
}

export function setOrderStage(orderId: string, stage: OrderStage, staffId: string): Result<true> {
  return safeCommit((db) => {
    const o = db.orders.find((x) => x.id === orderId);
    if (!o) return { ok: false, error: "Order not found" };
    o.autoFlow = false;
    o.stage = stage;
    o.history.push({ stage, at: Date.now(), by: staffId });
    audit(db, { type: "staff", id: staffId }, "order.stage", "order", `Order #${o.number} → ${stage}`, o.id);
    return { ok: true, value: true };
  });
}

// ---------------------------------------------------------------------------
// Bay Suites (planned accommodation, simulated)
// ---------------------------------------------------------------------------

export function unitAvailable(db: DB, unitId: string, checkIn: number, checkOut: number, ignoreStayId?: string) {
  return !db.stays.some((s) => s.unitId === unitId && s.id !== ignoreStayId && s.status !== "cancelled" && s.status !== "checked-out" && s.checkIn < checkOut && checkIn < s.checkOut);
}

export function bookStay(input: { customerId: string; unitId: string; arrivalDay: number; nights: number; guests: number; packageId?: string; method: string }): Result<string> {
  return safeCommit((db) => {
    const customer = db.customers.find((c) => c.id === input.customerId);
    if (!customer) return { ok: false, error: "Sign in to reserve" };
    const unit = db.units.find((u) => u.id === input.unitId)!;
    if (input.guests > unit.capacity) return { ok: false, error: `${unit.name} sleeps ${unit.capacity}` };
    const checkIn = atHour(input.arrivalDay, 15);
    const checkOut = atHour(addDays(input.arrivalDay, input.nights), 11);
    if (!unitAvailable(db, unit.id, checkIn, checkOut)) return { ok: false, error: `${unit.name} is taken on those nights` };
    const pkg = db.packages.find((p) => p.id === input.packageId);
    const total = pkg ? pkg.price : unit.nightly * input.nights;
    const id = uid("st");
    db.stays.push({
      id,
      unitId: unit.id,
      customerId: customer.id,
      checkIn,
      checkOut,
      guests: [{ name: customer.name, email: customer.email, phone: customer.phone, adult: true }],
      status: "reserved",
      packageId: pkg?.id,
      nightly: unit.nightly,
      total,
      createdAt: Date.now(),
      folio: [{ label: pkg ? `${pkg.name} package` : `${input.nights} nights · ${unit.name}`, amount: total, at: Date.now() }],
    });
    const reward = award(db, customer.id, Math.round(total * POINTS_PER_DOLLAR.stays));
    notify(db, { kind: "stay", title: `New reservation · ${unit.name}`, body: `${customer.name} · ${fmtDate(checkIn)} for ${input.nights} night${input.nights > 1 ? "s" : ""}${pkg ? ` · ${pkg.name}` : ""}`, severity: "success", audience: "staff", ref: { kind: "stay", id } });
    audit(db, { type: "customer", id: customer.id }, "stay.create", "stay", `${customer.name} reserved ${unit.name} ${fmtDate(checkIn)} ×${input.nights}`, id);
    return { ok: true, value: id, reward };
  });
}

export function registerGuests(stayId: string, data: { guests: { name: string; adult: boolean }[]; arrivalTime: string; idVerified: boolean; rulesAccepted: boolean }): Result<true> {
  return safeCommit((db) => {
    const s = db.stays.find((x) => x.id === stayId);
    if (!s) return { ok: false, error: "Reservation not found" };
    if (!data.rulesAccepted) return { ok: false, error: "Please accept the house rules" };
    if (!data.idVerified) return { ok: false, error: "Verify the lead guest's ID first" };
    s.guests = [s.guests[0], ...data.guests.filter((g) => g.name.trim()).map((g) => ({ name: g.name.trim(), adult: g.adult }))];
    s.registration = { completedAt: Date.now(), arrivalTime: data.arrivalTime, idVerified: true, rulesAccepted: true };
    audit(db, { type: "customer", id: s.customerId }, "stay.register", "stay", `Guest registration completed for ${s.guests.length} guest(s)`, s.id);
    return { ok: true, value: true };
  });
}

export function checkInStay(stayId: string): Result<string> {
  return safeCommit((db) => {
    const s = db.stays.find((x) => x.id === stayId);
    if (!s) return { ok: false, error: "Reservation not found" };
    if (!s.registration) return { ok: false, error: "Complete guest registration first" };
    const unit = db.units.find((u) => u.id === s.unitId)!;
    s.status = "checked-in";
    s.checkedInAt = Date.now();
    const passId = uid("ps");
    db.passes.unshift({ id: passId, holderId: s.customerId, kind: "suite", refId: s.id, label: `${unit.name} · until ${fmtDate(s.checkOut)}`, door: `${unit.name} door`, code: code(), validFrom: Date.now(), validTo: s.checkOut + HOUR, status: "active", issuedAt: Date.now() });
    s.keyPassId = passId;
    const c = db.customers.find((x) => x.id === s.customerId);
    const reward = award(db, s.customerId, 0, ["bay-sleeper"]);
    notify(db, { kind: "stay", title: `Digital check-in · ${unit.name}`, body: `${c?.name} checked in. Smart key issued.`, severity: "success", audience: "staff", ref: { kind: "stay", id: s.id } });
    audit(db, { type: "customer", id: s.customerId }, "stay.checkin", "stay", `${c?.name} checked in to ${unit.name}; key issued`, s.id);
    return { ok: true, value: passId, reward };
  });
}

export function checkOutStay(stayId: string, rating: number): Result<true> {
  return safeCommit((db) => {
    const s = db.stays.find((x) => x.id === stayId);
    if (!s) return { ok: false, error: "Reservation not found" };
    const unit = db.units.find((u) => u.id === s.unitId)!;
    s.status = "checked-out";
    s.checkedOutAt = Date.now();
    s.rating = rating;
    db.passes.filter((p) => p.refId === s.id).forEach((p) => (p.status = "revoked"));
    unit.housekeeping = "dirty";
    db.tasks.unshift({ id: uid("tk"), title: `Turn over ${unit.name} after checkout`, area: "suites", refId: unit.id, assigneeId: "s-house", due: Date.now() + 3 * HOUR, status: "todo", priority: "normal", createdBy: "system", createdAt: Date.now() });
    const c = db.customers.find((x) => x.id === s.customerId);
    notify(db, { kind: "stay", title: `Checked out · ${unit.name}`, body: `${c?.name} rated the stay ${rating}/5. Key revoked, housekeeping task created.`, severity: "info", audience: "staff", ref: { kind: "stay", id: s.id } });
    audit(db, { type: "customer", id: s.customerId }, "stay.checkout", "stay", `${c?.name} checked out of ${unit.name}`, s.id);
    return { ok: true, value: true };
  });
}

// ---------------------------------------------------------------------------
// Community
// ---------------------------------------------------------------------------

export function joinMatch(matchId: string, customerId: string): Result<true> {
  return safeCommit((db) => {
    const m = db.matches.find((x) => x.id === matchId);
    const c = db.customers.find((x) => x.id === customerId);
    if (!m || !c) return { ok: false, error: "Match not found" };
    if (m.playerIds.includes(c.id)) return { ok: false, error: "You're already in" };
    if (m.playerIds.length >= 4) return { ok: false, error: "This match is full" };
    m.playerIds.push(c.id);
    const reward = award(db, c.id, Math.round(m.pricePerPlayer), ["open-court"]);
    notify(db, { kind: "community", title: "Open match filling up", body: `${c.name} joined ${fmtDate(m.start)} ${fmtTime(m.start)} (${m.playerIds.length}/4)`, severity: "info", audience: "staff" });
    audit(db, { type: "customer", id: c.id }, "match.join", "match", `${c.name} joined an open match`, m.id);
    return { ok: true, value: true, reward };
  });
}

export function registerTournament(tournamentId: string, customerId: string, partnerId: string): Result<true> {
  return safeCommit((db) => {
    const t = db.tournaments.find((x) => x.id === tournamentId);
    if (!t) return { ok: false, error: "Tournament not found" };
    if (t.teams.length >= t.maxTeams) return { ok: false, error: "Registration is full" };
    if (t.teams.some((tm) => tm.players.includes(customerId))) return { ok: false, error: "You're already registered" };
    t.teams.push({ id: uid("tm"), players: [customerId, partnerId] });
    const c = db.customers.find((x) => x.id === customerId);
    const reward = award(db, customerId, t.entryFee, ["bracket-ready"]);
    notify(db, { kind: "community", title: `Tournament entry · ${t.name}`, body: `${c?.name} registered (${t.teams.length}/${t.maxTeams} teams)`, severity: "info", audience: "staff" });
    audit(db, { type: "customer", id: customerId }, "tournament.register", "tournament", `${c?.name} registered for ${t.name}`, t.id);
    return { ok: true, value: true, reward };
  });
}

export function sendInvite(fromId: string, toId: string, message: string): Result<true> {
  return safeCommit((db) => {
    db.invitations.unshift({ id: uid("iv"), fromId, toId, message, createdAt: Date.now(), status: "pending" });
    return { ok: true, value: true };
  });
}

export function recordConcierge(customerId: string | undefined, summary: string) {
  useStore.getState().commit((db) => {
    audit(db, customerId ? { type: "customer", id: customerId } : { type: "ai" }, "concierge.plan", "concierge", summary);
  });
}

// ---------------------------------------------------------------------------
// Command Center (staff)
// ---------------------------------------------------------------------------

export function staffSignIn(staffId: string, pin: string): Result<true> {
  const s = getDB().staff.find((x) => x.id === staffId);
  if (!s || s.pin !== pin) return { ok: false, error: "That PIN doesn't match" };
  useStore.getState().setSession({ staffId });
  useStore.getState().commit((db) => audit(db, { type: "staff", id: staffId }, "auth.signin", "staff", `${s.name} signed in to the Command Center`));
  return { ok: true, value: true };
}

export function staffSignOut() {
  useStore.getState().setSession({ staffId: undefined });
}

export function staffAction(staffId: string, summary: string, mutate: (db: DB) => void, action = "ops.update", entity = "ops") {
  useStore.getState().commit((db) => {
    mutate(db);
    audit(db, { type: "staff", id: staffId }, action, entity, summary);
  });
}

export function markNoticesRead(audience: "staff" | "customer", customerId?: string) {
  useStore.getState().commit((db) => {
    db.notices.forEach((n) => {
      if (n.audience === audience && (audience === "staff" || n.customerId === customerId)) n.read = true;
    });
  });
}

export function upcomingFor(db: DB, customerId: string, now = Date.now()) {
  return db.bookings
    .filter((b) => b.customerId === customerId && b.status === "confirmed" && b.start + b.durationMin * MIN > now)
    .sort((a, b) => a.start - b.start);
}

export function activeCourtBooking(db: DB, customerId: string, now = Date.now()) {
  // the session in play now, or the next one today
  return upcomingFor(db, customerId, now).find((b) => b.start - now < 12 * HOUR);
}

export function dayKey(t: number) {
  return Math.floor(t / DAY);
}
