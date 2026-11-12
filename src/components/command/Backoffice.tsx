"use client";

import clsx from "clsx";
import { useMemo, useState, type ReactNode } from "react";
import { Check, MessageCircle, Plus, Search, X } from "lucide-react";
import { Avatar, Button, Label, Segmented } from "@/components/ui/kit";
import { ORDER_FLOW, bookCourt, cancelBooking, kitFor, orderStage, setOrderStage, staffAction } from "@/lib/actions";
import { KEY_WINDOW_MIN, can } from "@/lib/catalog";
import { daySlots } from "@/lib/engine/availability";
import { useFx } from "@/lib/fx";
import { useNow, useStaff } from "@/lib/hooks";
import { cafeRevenue, courtRevenue, lockerLive, mask } from "@/lib/ops";
import { useStore } from "@/lib/store";
import type { Booking, Order, OrderStage } from "@/lib/types";
import { DAY, MIN, addDays, fmtAgo, fmtDate, fmtDayLabel, fmtRange, fmtTime, startOfDay } from "@/lib/time";

// Back office lists: every reservation and every Sip order in one place, with the
// actions the front desk and the café actually need.

const NEW_MS = 3 * 60_000;

function NewChip({ at, now }: { at: number; now: number }) {
  if (at > now || now - at > NEW_MS) return null;
  return <span className="rounded-full bg-sage px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-ink">New</span>;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3">
      <p className="text-[10.5px] uppercase tracking-wider text-white/50">{label}</p>
      <p className="mt-0.5 text-[20px] font-semibold tabular text-white">{value}</p>
      {sub && <p className="text-[10.5px] text-white/45">{sub}</p>}
    </div>
  );
}

function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="animate-rise rounded-[24px] border border-white/10 bg-ink/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[14px] font-semibold text-white">{title}</p>
        <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Close"><X size={14} /></button>
      </div>
      {children}
    </div>
  );
}

function Status({ children, tone }: { children: ReactNode; tone: "good" | "warn" | "bad" | "info" | "neutral" }) {
  return (
    <span
      className={clsx(
        "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        tone === "good" && "bg-sage/20 text-sage",
        tone === "warn" && "bg-gold/20 text-gold",
        tone === "bad" && "bg-danger/20 text-danger",
        tone === "info" && "bg-[#5a88e6]/25 text-[#9dbbff]",
        tone === "neutral" && "bg-white/10 text-white/65",
      )}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Reservations: court bookings (with their kit locker key) and the waitlist
// ---------------------------------------------------------------------------

type Scope = "today" | "upcoming" | "past" | "all";

export function Reservations() {
  const db = useStore((s) => s.db);
  const staff = useStaff();
  const now = useNow(5_000);
  const toast = useFx((s) => s.toast);
  const [tab, setTab] = useState<"courts" | "waitlist">("courts");
  const [scope, setScope] = useState<Scope>("today");
  const [court, setCourt] = useState<string>("all");
  const [status, setStatus] = useState<"all" | "confirmed" | "cancelled">("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const today = startOfDay(now);
  const writer = can(staff?.role, "courts:write");
  const pii = can(staff?.role, "guests:pii");

  const bookings = useMemo(() => {
    const list = db.bookings.filter((b) => {
      if (b.kind === "maintenance") return false;
      if (court !== "all" && b.courtId !== court) return false;
      if (status !== "all" && b.status !== status) return false;
      if (scope === "today" && (b.start < today || b.start >= today + DAY)) return false;
      if (scope === "upcoming" && b.start + b.durationMin * MIN < now) return false;
      if (scope === "past" && (b.start >= now || b.start < today - 7 * DAY)) return false;
      if (q) {
        const c = db.customers.find((x) => x.id === b.customerId);
        if (!c?.name.toLowerCase().includes(q.toLowerCase())) return false;
      }
      return true;
    });
    return list.sort((a, b) => (scope === "past" ? b.start - a.start : a.start - b.start) || b.createdAt - a.createdAt).slice(0, 120);
  }, [db, scope, court, status, q, today, now]);

  const recent = db.bookings.filter((b) => b.kind !== "maintenance" && b.createdAt <= now && now - b.createdAt < NEW_MS).length;
  const todayAll = db.bookings.filter((b) => b.kind !== "maintenance" && b.start >= today && b.start < today + DAY);
  const selected = sel ? db.bookings.find((b) => b.id === sel) : undefined;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Court sessions today" value={String(todayAll.filter((b) => b.status === "confirmed").length)} sub={`${todayAll.filter((b) => b.status === "cancelled").length} cancelled`} />
        <Stat label="Court revenue today" value={`$${Math.round(courtRevenue(db, today, today + DAY)).toLocaleString()}`} />
        <Stat label="Upcoming sessions" value={String(db.bookings.filter((b) => b.status === "confirmed" && b.kind !== "maintenance" && b.start > now).length)} sub="next 9 days" />
        <Stat label="New in the last 3 min" value={String(recent)} sub={recent ? "highlighted below" : "waiting for bookings"} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["courts", "waitlist"] as const).map((t) => (
          <button key={t} onClick={() => { setTab(t); setSel(null); }} className={clsx("rounded-full px-4 py-1.5 text-[12.5px] font-medium", tab === t ? "bg-white text-ink" : "bg-white/8 text-white/75")}>
            {t === "courts" ? "Court bookings" : `Waitlist · ${db.waitlist.filter((w) => w.status !== "converted").length}`}
          </button>
        ))}
        {tab === "courts" && writer && (
          <Button variant="sage" className="ml-auto h-9 px-4 text-[12px]" onClick={() => setCreating((c) => !c)}>
            <Plus size={14} /> New booking
          </Button>
        )}
      </div>

      {tab === "courts" && (
        <>
          {creating && <NewBooking onDone={() => setCreating(false)} />}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-3">
              <Search size={14} className="text-white/45" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search guest" className="h-9 w-40 bg-transparent text-[12.5px] text-white outline-none placeholder:text-white/35" />
            </div>
            {(["today", "upcoming", "past", "all"] as const).map((s) => (
              <button key={s} onClick={() => setScope(s)} className={clsx("rounded-full px-3 py-1.5 text-[11.5px] capitalize", scope === s ? "bg-white text-ink" : "bg-white/8 text-white/70")}>{s === "past" ? "Past 7 days" : s}</button>
            ))}
            <span className="mx-1 h-5 w-px bg-white/15" />
            {["all", ...db.courts.map((c) => c.id)].map((c) => (
              <button key={c} onClick={() => setCourt(c)} className={clsx("rounded-full px-3 py-1.5 text-[11.5px]", court === c ? "bg-white text-ink" : "bg-white/8 text-white/70")}>{c === "all" ? "All courts" : db.courts.find((x) => x.id === c)?.short}</button>
            ))}
            <span className="mx-1 h-5 w-px bg-white/15" />
            {(["all", "confirmed", "cancelled"] as const).map((s) => (
              <button key={s} onClick={() => setStatus(s)} className={clsx("rounded-full px-3 py-1.5 text-[11.5px] capitalize", status === s ? "bg-white text-ink" : "bg-white/8 text-white/70")}>{s}</button>
            ))}
          </div>

          <div className={clsx("grid gap-4", selected && "lg:grid-cols-[1.5fr_1fr]")}>
            <div className="overflow-x-auto rounded-[22px] border border-white/8 thin-scrollbar">
              <table className="w-full min-w-[720px] text-left text-[12px]">
                <thead className="bg-white/[0.04] text-[10.5px] uppercase tracking-wider text-white/50">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">When</th>
                    <th className="px-3 py-2.5 font-medium">Court</th>
                    <th className="px-3 py-2.5 font-medium">Guest</th>
                    <th className="px-3 py-2.5 font-medium">Players</th>
                    <th className="px-3 py-2.5 font-medium">Kit locker</th>
                    <th className="px-3 py-2.5 font-medium">Source</th>
                    <th className="px-3 py-2.5 text-right font-medium">Paid</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => {
                    const c = db.customers.find((x) => x.id === b.customerId);
                    const live = b.status === "confirmed" && b.start <= now && b.start + b.durationMin * MIN > now;
                    const isNew = b.createdAt <= now && now - b.createdAt < NEW_MS;
                    return (
                      <tr key={b.id} onClick={() => setSel(b.id)} className={clsx("cursor-pointer border-t border-white/5 transition hover:bg-white/[0.06]", sel === b.id && "bg-white/[0.08]", isNew && "bg-sage/[0.08]")}>
                        <td className="px-3 py-2.5 tabular text-white">
                          <span className="flex items-center gap-1.5">{fmtDayLabel(b.start, now)} · {fmtRange(b.start, b.durationMin)} <NewChip at={b.createdAt} now={now} /></span>
                        </td>
                        <td className="px-3 py-2.5 text-white/80">{db.courts.find((x) => x.id === b.courtId)?.short}</td>
                        <td className="px-3 py-2.5">
                          <span className="flex items-center gap-2 text-white">{c && <Avatar name={c.name} hue={c.hue} size={22} />}{c?.name ?? "Walk-in"}</span>
                        </td>
                        <td className="px-3 py-2.5 text-white/65">{b.players.length + 1}{b.openMatchId ? " · open" : ""}</td>
                        <td className="px-3 py-2.5 font-mono text-[11.5px] text-white/75">{db.lockers.find((l) => l.id === b.lockerId)?.number ?? "–"}</td>
                        <td className="px-3 py-2.5 text-white/65">{b.source === "concierge" ? "AI concierge" : b.source === "desk" ? "Front desk" : b.source === "waitlist" ? "Waitlist" : "App"}{b.recurringGroupId ? " · weekly" : ""}</td>
                        <td className="px-3 py-2.5 text-right tabular text-white">${b.price.toFixed(2)}</td>
                        <td className="px-3 py-2.5">
                          {b.status === "cancelled" ? <Status tone="bad">Cancelled</Status> : live ? <Status tone="warn">In play</Status> : b.checkedInAt ? <Status tone="good">Checked in</Status> : b.payment.status === "pay-at-venue" ? <Status tone="info">Pay at desk</Status> : b.start < now ? <Status tone="neutral">Played</Status> : <Status tone="good">Confirmed</Status>}
                        </td>
                      </tr>
                    );
                  })}
                  {!bookings.length && (
                    <tr><td colSpan={8} className="px-3 py-6 text-center text-white/45">No bookings match these filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {selected && (
              <BookingDetail
                b={selected}
                now={now}
                pii={pii}
                writer={writer}
                onClose={() => setSel(null)}
                onAction={(msg) => toast({ tone: "success", title: msg })}
              />
            )}
          </div>
        </>
      )}


      {tab === "waitlist" && (
        <div className="space-y-1.5">
          {db.waitlist.length === 0 && <p className="rounded-2xl bg-white/5 p-4 text-[12.5px] text-white/55">Nobody is waiting. When a slot is full, guests can join from the booking screen.</p>}
          {db.waitlist.map((w) => {
            const c = db.customers.find((x) => x.id === w.customerId);
            return (
              <div key={w.id} className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-2.5">
                <span>
                  <span className="block text-[12.5px] font-semibold text-white">{c?.name} · {w.courtId ? db.courts.find((x) => x.id === w.courtId)?.short : "Any court"}</span>
                  <span className="block text-[11px] text-white/55">{fmtDayLabel(w.start, now)} {fmtRange(w.start, w.durationMin)} · joined {fmtAgo(w.createdAt, now)}</span>
                </span>
                <span className="flex items-center gap-2">
                  <Status tone={w.status === "offered" ? "good" : w.status === "converted" ? "info" : "warn"}>{w.status}</Status>
                  {w.status === "waiting" && writer && (
                    <button onClick={() => staffAction(staff!.id, `Offered a slot to ${c?.name}`, (d) => { const x = d.waitlist.find((y) => y.id === w.id)!; x.status = "offered"; x.offeredAt = Date.now(); d.notices.unshift({ id: `nt-${Date.now()}`, at: Date.now(), kind: "booking", title: "A court opened up for you", body: "The front desk is holding a slot for you.", severity: "success", read: false, audience: "customer", customerId: w.customerId }); }, "waitlist.offer", "waitlist")} className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-ink hover:bg-sage">
                      Offer slot
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BookingDetail({ b, now, pii, writer, onClose, onAction }: { b: Booking; now: number; pii: boolean; writer: boolean; onClose: () => void; onAction: (m: string) => void }) {
  const db = useStore((s) => s.db);
  const staff = useStaff();
  const c = db.customers.find((x) => x.id === b.customerId);
  const court = db.courts.find((x) => x.id === b.courtId)!;
  const pass = db.passes.find((p) => p.refId === b.id);
  const logs = pass ? db.accessLogs.filter((l) => l.passId === pass.id) : [];
  const orders = db.orders.filter((o) => o.customerId === b.customerId && o.deliverTo.refId === b.courtId && Math.abs(o.createdAt - b.start) < 3 * 60 * MIN);
  const [confirm, setConfirm] = useState(false);
  return (
    <Drawer title={`${court.short} · ${fmtDate(b.start)} ${fmtRange(b.start, b.durationMin)}`} onClose={onClose}>
      <div className="space-y-3 text-[12px]">
        <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-3">
          {c && <Avatar name={c.name} hue={c.hue} size={36} />}
          <div>
            <p className="text-[13px] font-semibold text-white">{c?.name}</p>
            <p className="text-white/55">{mask(c?.phone ?? "", pii)} · {mask(c?.email ?? "", pii)}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-white/5 p-2.5"><p className="text-white/45">Paid</p><p className="font-semibold tabular text-white">${b.price.toFixed(2)} <span className="font-normal text-white/50">of ${b.listPrice.toFixed(2)}</span></p><p className="text-white/50">{b.payment.method} · {b.payment.status}</p></div>
          <div className="rounded-xl bg-white/5 p-2.5"><p className="text-white/45">Booked</p><p className="font-semibold text-white">{fmtAgo(b.createdAt, now)}</p><p className="text-white/50">via {b.source === "concierge" ? "AI concierge" : b.source}</p></div>
        </div>
        {b.discountLabel && <p className="text-sage">Discount applied: {b.discountLabel}</p>}
        <div>
          <Label>Players</Label>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-white">{c?.name.split(" ")[0]} (host)</span>
            {b.players.map((p) => <span key={p.name} className="rounded-full bg-white/6 px-2.5 py-1 text-white/75">{p.name.split(" ")[0]} · {p.status}</span>)}
          </div>
        </div>
        <div>
          <Label>Kit locker & digital key</Label>
          <p className="mt-1 text-white/70">
            {b.lockerId ? `Locker ${db.lockers.find((l) => l.id === b.lockerId)?.number} · ${kitFor(b).rackets} rackets + balls` : "Locker assigned when the key is issued"} · key {fmtTime(b.start - KEY_WINDOW_MIN * MIN)} → {fmtTime(b.start + (b.durationMin + KEY_WINDOW_MIN) * MIN)}
          </p>
        </div>
        <div>
          <Label>Key usage</Label>
          <p className="mt-1 text-white/70">{pass ? `${pass.code} · ${pass.status} · ${logs.length ? `${logs.length} door event${logs.length > 1 ? "s" : ""}, last ${fmtAgo(logs[0].at, now)}` : "not used yet"}` : "No pass issued"}</p>
        </div>
        {orders.length > 0 && (
          <div>
            <Label>Sip orders to this court</Label>
            {orders.map((o) => <p key={o.id} className="mt-1 text-white/70">#{o.number} · {o.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")} · {orderStage(o, now)}</p>)}
          </div>
        )}
        {b.status === "confirmed" && writer && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button variant="sage" className="h-9 text-[12px]" disabled={!!b.checkedInAt} onClick={() => { staffAction(staff!.id, `Checked in ${c?.name} on ${court.short}`, (d) => { d.bookings.find((x) => x.id === b.id)!.checkedInAt = Date.now(); }, "booking.checkin", "booking"); onAction(`${c?.name.split(" ")[0]} checked in`); }}>
              <Check size={13} /> {b.checkedInAt ? "Checked in" : "Check in"}
            </Button>
            <Button variant="ghost" className="h-9 text-[12px]" disabled={b.payment.status !== "pay-at-venue"} onClick={() => { staffAction(staff!.id, `Payment taken at desk for ${c?.name}`, (d) => { const x = d.bookings.find((y) => y.id === b.id)!; x.payment = { ...x.payment, status: "paid", method: "Card at desk" }; }, "booking.payment", "booking"); onAction("Payment recorded"); }}>
              Take payment
            </Button>
            <Button variant="ghost" className="h-9 text-[12px]" onClick={() => onAction(`WhatsApp sent to ${c?.name.split(" ")[0]} (simulated)`)}>
              <MessageCircle size={13} /> Message guest
            </Button>
            {confirm ? (
              <Button variant="danger" className="h-9 text-[12px]" onClick={() => { const r = cancelBooking(b.id, { type: "staff", id: staff!.id }); setConfirm(false); if (r.ok) onAction(`Cancelled · $${r.value.refund.toFixed(2)} refunded${r.value.offeredTo ? ` · offered to ${r.value.offeredTo}` : ""}`); }}>
                Confirm cancel
              </Button>
            ) : (
              <Button variant="ghost" className="h-9 text-[12px] text-danger" onClick={() => setConfirm(true)}>Cancel booking</Button>
            )}
          </div>
        )}
        {b.status === "cancelled" && <p className="text-danger">Cancelled {b.cancelledAt ? fmtAgo(b.cancelledAt, now) : ""} · refunded ${b.payment.refunded.toFixed(2)}</p>}
      </div>
    </Drawer>
  );
}

function NewBooking({ onDone }: { onDone: () => void }) {
  const db = useStore((s) => s.db);
  const now = useNow(30_000);
  const toast = useFx((s) => s.toast);
  const [q, setQ] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [courtId, setCourtId] = useState("c1");
  const [day, setDay] = useState(startOfDay(now));
  const [dur, setDur] = useState(90);
  const [start, setStart] = useState<number | null>(null);
  const matches = db.customers.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase())).slice(0, 6);
  const slots = daySlots(db, courtId, day, dur, now).filter((s) => s.status === "free");
  const customer = db.customers.find((c) => c.id === customerId);
  return (
    <Drawer title="New booking · front desk" onClose={onDone}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Guest</Label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search member" className="h-10 w-full rounded-2xl border border-white/12 bg-white/6 px-3 text-[12.5px] text-white outline-none placeholder:text-white/35" />
          <div className="space-y-1">
            {matches.map((c) => (
              <button key={c.id} onClick={() => setCustomerId(c.id)} className={clsx("flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-[12px]", customerId === c.id ? "bg-sage/20 text-white" : "bg-white/[0.03] text-white/80 hover:bg-white/8")}>
                <Avatar name={c.name} hue={c.hue} size={22} /> {c.name}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label>Court · day · duration</Label>
          <div className="grid grid-cols-4 gap-1">
            {db.courts.map((c) => <button key={c.id} onClick={() => { setCourtId(c.id); setStart(null); }} className={clsx("rounded-xl py-1.5 text-[11.5px]", courtId === c.id ? "bg-white text-ink" : "bg-white/8 text-white/75")}>{c.short}</button>)}
          </div>
          <div className="no-scrollbar flex gap-1 overflow-x-auto">
            {Array.from({ length: 8 }, (_, i) => addDays(startOfDay(now), i)).map((d) => <button key={d} onClick={() => { setDay(d); setStart(null); }} className={clsx("shrink-0 rounded-xl px-2.5 py-1.5 text-[11px]", day === d ? "bg-white text-ink" : "bg-white/8 text-white/75")}>{fmtDayLabel(d, now)}</button>)}
          </div>
          <Segmented value={dur} onChange={(v) => { setDur(v); setStart(null); }} items={[60, 90, 120].map((d) => ({ id: d, label: `${d} min` }))} />
          <div className="grid max-h-32 grid-cols-5 gap-1 overflow-y-auto thin-scrollbar">
            {slots.map((s) => <button key={s.start} onClick={() => setStart(s.start)} className={clsx("rounded-lg py-1 text-[11px] tabular", start === s.start ? "bg-sage text-ink" : "bg-white/8 text-white/80")}>{fmtTime(s.start)}</button>)}
            {!slots.length && <p className="col-span-5 text-[11px] text-white/45">No free starts on this day.</p>}
          </div>
          <Button
            variant="sage"
            className="h-10 w-full text-[12.5px]"
            disabled={!customer || !start}
            onClick={() => {
              if (!customer || !start) return;
              const r = bookCourt({ customerId: customer.id, courtId, start, durationMin: dur, players: [], splitPayment: false, weeks: 1, paymentMethod: "Pay at venue", openMatch: false, source: "desk" });
              if (!r.ok) return toast({ tone: "error", title: r.error });
              toast({ tone: "success", title: `Booked ${customer.name.split(" ")[0]} on ${db.courts.find((c) => c.id === courtId)?.short}`, body: `${fmtDayLabel(start, now)} ${fmtRange(start, dur)} · pay at desk` });
              onDone();
            }}
          >
            Create booking{customer && start ? ` · ${customer.name.split(" ")[0]} ${fmtTime(start)}` : ""}
          </Button>
        </div>
      </div>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Orders: every Sip order
// ---------------------------------------------------------------------------

const STAGE_TONE: Record<OrderStage, "good" | "warn" | "bad" | "info" | "neutral"> = {
  received: "info",
  preparing: "warn",
  ready: "good",
  delivering: "good",
  delivered: "neutral",
  cancelled: "bad",
};

const NEXT: Partial<Record<OrderStage, OrderStage>> = { received: "preparing", preparing: "ready", ready: "delivering", delivering: "delivered" };

export function Orders() {
  const db = useStore((s) => s.db);
  const staff = useStaff();
  const now = useNow(2_000);
  const toast = useFx((s) => s.toast);
  const [scope, setScope] = useState<"live" | "today" | "all">("live");
  const [dest, setDest] = useState<"all" | "court" | "suite" | "pickup">("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const today = startOfDay(now);
  const writer = can(staff?.role, "cafe:write");

  const orders = useMemo(
    () =>
      db.orders
        .filter((o) => {
          const st = orderStage(o, now);
          if (scope === "live" && (st === "delivered" || st === "cancelled")) return false;
          if (scope === "today" && o.createdAt < today) return false;
          if (dest !== "all" && o.deliverTo.kind !== dest) return false;
          if (q) {
            const c = db.customers.find((x) => x.id === o.customerId);
            if (!c?.name.toLowerCase().includes(q.toLowerCase()) && !String(o.number).includes(q)) return false;
          }
          return true;
        })
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 150),
    [db, scope, dest, q, now, today],
  );
  const todays = db.orders.filter((o) => o.createdAt >= today);
  const live = db.orders.filter((o) => !["delivered", "cancelled"].includes(orderStage(o, now)));
  const selected = sel ? db.orders.find((o) => o.id === sel) : undefined;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Live in the kitchen" value={String(live.length)} sub={`${live.filter((o) => o.deliverTo.kind === "court").length} going to courts`} />
        <Stat label="Orders today" value={String(todays.length)} />
        <Stat label="Sip sales today" value={`$${Math.round(cafeRevenue(db, today, today + DAY)).toLocaleString()}`} />
        <Stat label="Avg ticket today" value={`$${todays.length ? (todays.reduce((s, o) => s + o.total, 0) / todays.length).toFixed(2) : "0"}`} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-3">
          <Search size={14} className="text-white/45" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Guest or order #" className="h-9 w-40 bg-transparent text-[12.5px] text-white outline-none placeholder:text-white/35" />
        </div>
        {(["live", "today", "all"] as const).map((s) => <button key={s} onClick={() => setScope(s)} className={clsx("rounded-full px-3 py-1.5 text-[11.5px] capitalize", scope === s ? "bg-white text-ink" : "bg-white/8 text-white/70")}>{s === "live" ? "Live" : s === "today" ? "Today" : "Last 3 weeks"}</button>)}
        <span className="mx-1 h-5 w-px bg-white/15" />
        {(["all", "court", "pickup"] as const).map((d) => <button key={d} onClick={() => setDest(d)} className={clsx("rounded-full px-3 py-1.5 text-[11.5px] capitalize", dest === d ? "bg-white text-ink" : "bg-white/8 text-white/70")}>{d === "all" ? "All destinations" : d === "court" ? "To courts" : "Pickup"}</button>)}
      </div>
      <div className={clsx("grid gap-4", selected && "lg:grid-cols-[1.5fr_1fr]")}>
        <div className="overflow-x-auto rounded-[22px] border border-white/8 thin-scrollbar">
          <table className="w-full min-w-[700px] text-left text-[12px]">
            <thead className="bg-white/[0.04] text-[10.5px] uppercase tracking-wider text-white/50">
              <tr>
                <th className="px-3 py-2.5 font-medium">Order</th>
                <th className="px-3 py-2.5 font-medium">Placed</th>
                <th className="px-3 py-2.5 font-medium">Guest</th>
                <th className="px-3 py-2.5 font-medium">Items</th>
                <th className="px-3 py-2.5 font-medium">Deliver to</th>
                <th className="px-3 py-2.5 text-right font-medium">Total</th>
                <th className="px-3 py-2.5 font-medium">Stage</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const c = db.customers.find((x) => x.id === o.customerId);
                const st = orderStage(o, now);
                return (
                  <tr key={o.id} onClick={() => setSel(o.id)} className={clsx("cursor-pointer border-t border-white/5 transition hover:bg-white/[0.06]", sel === o.id && "bg-white/[0.08]", o.createdAt <= now && now - o.createdAt < NEW_MS && "bg-sage/[0.08]")}>
                    <td className="px-3 py-2.5 font-semibold tabular text-white"><span className="flex items-center gap-1.5">#{o.number} <NewChip at={o.createdAt} now={now} /></span></td>
                    <td className="px-3 py-2.5 text-white/65">{fmtDayLabel(o.createdAt, now) === "Today" ? fmtTime(o.createdAt) : `${fmtDate(o.createdAt).slice(4)} ${fmtTime(o.createdAt)}`}</td>
                    <td className="px-3 py-2.5 text-white">{c?.name}</td>
                    <td className="max-w-[220px] truncate px-3 py-2.5 text-white/75">{o.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}</td>
                    <td className="px-3 py-2.5"><span className={clsx("text-[11.5px] font-semibold", o.deliverTo.kind === "court" ? "text-sage" : "text-white/60")}>{o.deliverTo.label}</span></td>
                    <td className="px-3 py-2.5 text-right tabular text-white">${o.total.toFixed(2)}</td>
                    <td className="px-3 py-2.5"><Status tone={STAGE_TONE[st]}>{ORDER_FLOW.find((f) => f.stage === st)?.label ?? st}</Status></td>
                  </tr>
                );
              })}
              {!orders.length && <tr><td colSpan={7} className="px-3 py-6 text-center text-white/45">{scope === "live" ? "The kitchen is clear. New orders appear here instantly." : "No orders match these filters."}</td></tr>}
            </tbody>
          </table>
        </div>
        {selected && <OrderDetail o={selected} now={now} writer={writer} onClose={() => setSel(null)} onAction={(m) => toast({ tone: "success", title: m })} />}
      </div>
    </div>
  );
}

function OrderDetail({ o, now, writer, onClose, onAction }: { o: Order; now: number; writer: boolean; onClose: () => void; onAction: (m: string) => void }) {
  const db = useStore((s) => s.db);
  const staff = useStaff();
  const c = db.customers.find((x) => x.id === o.customerId);
  const st = orderStage(o, now);
  const next = o.deliverTo.kind === "pickup" && st === "ready" ? "delivered" : NEXT[st];
  return (
    <Drawer title={`Order #${o.number}`} onClose={onClose}>
      <div className="space-y-3 text-[12px]">
        <p className="text-white/70">{c?.name} · placed {fmtAgo(o.createdAt, now)} · {o.payment.method} ({o.payment.status})</p>
        <div className="rounded-2xl bg-white/5 p-3">
          {o.lines.map((l, i) => (
            <p key={i} className="flex justify-between text-white">
              <span>{l.qty}× {l.name}{l.optionsLabel && <span className="text-white/50"> · {l.optionsLabel}</span>}</span>
              <span className="tabular">${(l.qty * l.unitPrice).toFixed(2)}</span>
            </p>
          ))}
          <p className="mt-1.5 flex justify-between border-t border-white/10 pt-1.5 font-semibold text-white"><span>Total</span><span className="tabular">${o.total.toFixed(2)}</span></p>
        </div>
        <p><span className="text-white/45">Deliver to </span><span className="font-semibold text-sage">{o.deliverTo.label}</span></p>
        <div>
          <Label>Progress</Label>
          <div className="mt-1.5 flex gap-1">
            {ORDER_FLOW.filter((f) => !(f.stage === "delivering" && o.deliverTo.kind === "pickup")).map((f) => {
              const idx = ORDER_FLOW.findIndex((x) => x.stage === st);
              const fi = ORDER_FLOW.findIndex((x) => x.stage === f.stage);
              return <span key={f.stage} className={clsx("flex-1 rounded-full py-1 text-center text-[9.5px] font-semibold uppercase tracking-wider", st !== "cancelled" && fi <= idx ? "bg-sage text-ink" : "bg-white/8 text-white/45")}>{f.label}</span>;
            })}
          </div>
          {o.autoFlow && st !== "delivered" && <p className="mt-1.5 text-[10.5px] text-white/40">Demo clock is moving this order. Any action below hands it to staff.</p>}
        </div>
        {writer && st !== "delivered" && st !== "cancelled" && (
          <div className="grid grid-cols-2 gap-2">
            {next && (
              <Button variant="sage" className="h-9 text-[12px]" onClick={() => { setOrderStage(o.id, next, staff!.id); onAction(`#${o.number} → ${ORDER_FLOW.find((f) => f.stage === next)?.label}`); }}>
                Mark {ORDER_FLOW.find((f) => f.stage === next)?.label.toLowerCase()}
              </Button>
            )}
            <Button
              variant="ghost"
              className="h-9 text-[12px] text-danger"
              onClick={() => {
                staffAction(staff!.id, `Order #${o.number} cancelled and refunded`, (d) => {
                  const x = d.orders.find((y) => y.id === o.id)!;
                  x.autoFlow = false;
                  x.stage = "cancelled";
                  x.payment.status = "refunded";
                  x.history.push({ stage: "cancelled", at: Date.now(), by: staff!.id });
                }, "order.cancel", "order");
                onAction(`#${o.number} cancelled · $${o.total.toFixed(2)} refunded`);
              }}
            >
              Cancel & refund
            </Button>
          </div>
        )}
      </div>
    </Drawer>
  );
}

export function useOwnerKpis() {
  const db = useStore((s) => s.db);
  const now = useNow(10_000);
  const today = startOfDay(now);
  const court = courtRevenue(db, today, today + DAY);
  const cafe = cafeRevenue(db, today, today + DAY);
  const bookings = db.bookings.filter((b) => b.status === "confirmed" && b.kind !== "maintenance" && b.start >= today && b.start < today + DAY).length;
  const newBookings = db.bookings.filter((b) => b.kind !== "maintenance" && b.createdAt >= now - 60 * MIN).length;
  const orders = db.orders.filter((o) => o.createdAt >= today).length;
  const live = db.orders.filter((o) => !["delivered", "cancelled"].includes(orderStage(o, now))).length;
  const states = db.lockers.map((l) => lockerLive(db, l, now).state);
  const keysActive = states.filter((s) => s === "active").length;
  const lockersToCheck = states.filter((s) => s === "check").length;
  return { revenue: court + cafe, court, cafe, bookings, newBookings, orders, live, keysActive, lockersToCheck };
}
