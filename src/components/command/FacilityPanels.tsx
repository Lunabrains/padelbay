"use client";

import clsx from "clsx";
import { useState, type ReactNode } from "react";
import { Check, ChefHat, Lock, Minus, Plus, Sparkles, Wrench } from "lucide-react";
import { courtLive } from "@/components/three/Stage";
import { Avatar, Button, Label, SimBadge, Tabs, ZonePanel } from "@/components/ui/kit";
import { ORDER_FLOW, cancelBooking, checkLocker, kitFor, orderStage, setOrderStage, staffAction } from "@/lib/actions";
import { utilization } from "@/lib/engine/availability";
import { KEY_WINDOW_MIN, can, type Permission } from "@/lib/catalog";
import { useNow, useStaff } from "@/lib/hooks";
import { cafeRevenue, courtRevenue, lockerLive, topItems, type LockerLive } from "@/lib/ops";
import { useStore } from "@/lib/store";
import type { OrderStage } from "@/lib/types";
import { DAY, HOUR, MIN, addDays, atHour, fmtAgo, fmtDate, fmtDayLabel, fmtRange, fmtTime, fmtWeekday, startOfDay } from "@/lib/time";
import { HBars, Meter, SERIES, StackedBars } from "./charts";

export function Restricted({ perm }: { perm: Permission }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[22px] border border-white/10 bg-white/4 p-6 text-center">
      <Lock size={20} className="text-white/50" />
      <p className="text-[13px] font-semibold text-white">Restricted for your role</p>
      <p className="text-[11.5px] text-white/55">Needs the {perm} permission. Switch user to a role that has it.</p>
    </div>
  );
}

function Gate({ perm, children }: { perm: Permission; children: ReactNode }) {
  const staff = useStaff();
  return can(staff?.role, perm) ? <>{children}</> : <Restricted perm={perm} />;
}

function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "good" | "warn" | "bad" | "neutral" | "info" }) {
  return (
    <span
      className={clsx(
        "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        tone === "good" && "bg-sage/20 text-sage",
        tone === "warn" && "bg-gold/20 text-gold",
        tone === "bad" && "bg-danger/20 text-danger",
        tone === "info" && "bg-[#5a88e6]/25 text-[#9dbbff]",
        tone === "neutral" && "bg-white/10 text-white/70",
      )}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Court
// ---------------------------------------------------------------------------

export function CourtPanel({ courtId, onClose, onSwitch }: { courtId: string; onClose: () => void; onSwitch?: (id: string) => void }) {
  const db = useStore((s) => s.db);
  const staff = useStaff();
  const now = useNow(15_000);
  const [tab, setTab] = useState<"schedule" | "bookings" | "utilization" | "maintenance" | "revenue">("schedule");
  const [note, setNote] = useState("");
  const live = courtLive(db, courtId, now);
  const court = live.court;
  const today = startOfDay(now);
  const todays = db.bookings.filter((b) => b.courtId === courtId && b.status === "confirmed" && b.start >= today && b.start < today + DAY).sort((a, b) => a.start - b.start);
  const upcoming = db.bookings.filter((b) => b.courtId === courtId && b.status === "confirmed" && b.start >= now).sort((a, b) => a.start - b.start).slice(0, 20);
  const utilToday = utilization(db, courtId, atHour(today, 7), atHour(today, 24));
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)).map((d) => ({ label: fmtWeekday(d), values: { courts: utilization(db, courtId, atHour(d, 7), atHour(d, 24)) * 100 } }));
  const month = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13)).map((d) => ({ label: String(new Date(d).getDate()), values: { courts: courtRevenue(db, d, d + DAY, courtId) } }));
  const writer = can(staff?.role, "courts:write");

  // build a day timeline with gaps
  const blocks: { start: number; end: number; booking?: (typeof todays)[number] }[] = [];
  let t = atHour(today, 7);
  for (const b of todays) {
    if (b.start > t) blocks.push({ start: t, end: b.start });
    blocks.push({ start: b.start, end: b.start + b.durationMin * MIN, booking: b });
    t = Math.max(t, b.start + b.durationMin * MIN);
  }
  if (t < atHour(today, 24)) blocks.push({ start: t, end: atHour(today, 24) });

  return (
    <ZonePanel
      kicker={`${court.zone} · ${court.type}`}
      title={court.short.toLowerCase()}
      onBack={onClose}
      tabs={
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { id: "schedule", label: "Today" },
            { id: "bookings", label: "Bookings", badge: upcoming.length },
            { id: "utilization", label: "Utilization" },
            { id: "maintenance", label: "Maintenance" },
            { id: "revenue", label: "Revenue" },
          ]}
        />
      }
    >
      <Gate perm="courts:read">
        <div className="space-y-4">
          {onSwitch && (
            <div className="grid grid-cols-4 gap-1.5">
              {db.courts.map((c) => (
                <button key={c.id} onClick={() => onSwitch(c.id)} className={clsx("rounded-xl py-1.5 text-[11.5px] font-semibold transition", c.id === courtId ? "bg-white text-ink" : "bg-white/8 text-white/70 hover:bg-white/15")}>
                  {c.short}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-3">
            <Pill tone={live.state === "free" ? "good" : live.state === "maintenance" ? "bad" : "warn"}>{live.state === "play" ? "In play" : live.state}</Pill>
            <span className="flex-1 text-[12.5px] text-white/75">{live.label}</span>
            <span className="text-[12px] tabular text-white/60">{Math.round(utilToday * 100)}% booked today</span>
          </div>

          {tab === "schedule" && (
            <div className="space-y-1">
              {blocks.map((bl) => {
                const b = bl.booking;
                const c = b ? db.customers.find((x) => x.id === b.customerId) : undefined;
                const nowIn = bl.start <= now && bl.end > now;
                if (!b)
                  return (
                    <div key={bl.start} className={clsx("flex items-center justify-between rounded-xl border border-dashed px-3 py-1.5 text-[11.5px]", nowIn ? "border-sage/50 text-sage" : "border-white/10 text-white/40")}>
                      <span>Free {fmtTime(bl.start)}–{fmtTime(bl.end)}</span>
                      {nowIn && writer && bl.end - Math.max(now, bl.start) >= 60 * MIN && (
                        <button
                          onClick={() =>
                            staffAction(staff!.id, `Walk-in booking on ${court.short}`, (d) => {
                              const start = Math.ceil(now / (30 * MIN)) * 30 * MIN;
                              d.bookings.push({ id: `bk-walk-${Date.now()}`, courtId, customerId: d.customers[3].id, start, durationMin: 60, status: "confirmed", price: 40, listPrice: 40, players: [], splitPayment: false, createdAt: Date.now(), source: "desk", payment: { method: "Pay at venue", status: "pay-at-venue", refunded: 0 }, kind: "play" });
                            }, "booking.create", "booking")
                          }
                          className="rounded-full bg-sage px-2.5 py-0.5 text-[10.5px] font-semibold text-ink"
                        >
                          + Walk-in
                        </button>
                      )}
                    </div>
                  );
                return (
                  <div key={b.id} className={clsx("rounded-xl px-3 py-2", b.kind === "maintenance" ? "bg-danger/15" : nowIn ? "bg-sunset/20 ring-1 ring-sunset/50" : bl.end < now ? "bg-white/[0.03] opacity-60" : "bg-white/7")}>
                    <div className="flex items-center justify-between">
                      <span className="text-[12.5px] font-semibold tabular text-white">{fmtRange(b.start, b.durationMin)}</span>
                      <span className="flex items-center gap-1.5">
                        {b.source === "concierge" && <Pill tone="info">AI concierge</Pill>}
                        {b.openMatchId && <Pill>Open match</Pill>}
                        {nowIn && <Pill tone="warn">Live</Pill>}
                      </span>
                    </div>
                    <p className="text-[11.5px] text-white/65">{b.kind === "maintenance" ? "Maintenance block" : `${c?.name ?? "Guest"} · ${b.players.length + 1} players · $${b.price.toFixed(0)} · ${b.payment.method}`}</p>
                  </div>
                );
              })}
            </div>
          )}

          {tab === "bookings" && (
            <div className="space-y-1.5">
              {upcoming.map((b) => {
                const c = db.customers.find((x) => x.id === b.customerId);
                return (
                  <div key={b.id} className="rounded-2xl bg-white/5 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[12.5px] font-semibold text-white">{fmtDayLabel(b.start, now)} · {fmtRange(b.start, b.durationMin)}</span>
                      <span className="text-[12px] tabular text-white/70">${b.price.toFixed(2)}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      {c && <Avatar name={c.name} hue={c.hue} size={22} />}
                      <span className="flex-1 text-[11.5px] text-white/65">{b.kind === "maintenance" ? "Maintenance" : c?.name} · {b.source}{b.recurringGroupId ? " · weekly" : ""}</span>
                      {writer && b.kind !== "maintenance" && (
                        <button onClick={() => cancelBooking(b.id, { type: "staff", id: staff!.id })} className="text-[11px] font-medium text-danger hover:underline">Cancel</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === "utilization" && (
            <div className="space-y-4">
              <Meter value={utilToday} label="Today, 07:00–24:00" />
              <div>
                <Label>Last 7 days · % of court hours booked</Label>
                <div className="mt-2"><StackedBars data={week} series={[SERIES.courts]} format={(n) => `${Math.round(n)}%`} height={120} /></div>
              </div>
              <div>
                <Label>Busiest hours (last 14 days)</Label>
                <div className="mt-2">
                  <HBars
                    format={(n) => `${Math.round(n * 100)}%`}
                    items={[7, 9, 13, 17, 19, 21].map((h) => {
                      let s = 0;
                      for (let i = 1; i <= 14; i++) s += utilization(db, courtId, atHour(addDays(today, -i), h), atHour(addDays(today, -i), h + 2));
                      return { label: `${String(h).padStart(2, "0")}:00–${String(h + 2).padStart(2, "0")}:00`, value: s / 14 };
                    })}
                  />
                </div>
              </div>
            </div>
          )}

          {tab === "maintenance" && (
            <div className="space-y-3">
              <div className="rounded-2xl bg-white/5 p-3 text-[12.5px] text-white/75">
                <p>Status: <span className="font-semibold text-white">{court.status === "open" ? "Open" : "Closed for maintenance"}</span></p>
                <p>Last serviced {fmtDate(court.lastServicedAt)} ({Math.round((now - court.lastServicedAt) / DAY)} days ago)</p>
                {court.maintenanceNote && <p className="mt-1 text-gold">{court.maintenanceNote}</p>}
              </div>
              {writer ? (
                <>
                  <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note, e.g. glass panel cleaning" className="h-11 w-full rounded-2xl border border-white/12 bg-white/6 px-4 text-[13px] text-white placeholder:text-white/35 outline-none focus:border-sage/60" />
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant={court.status === "open" ? "danger" : "sage"}
                      className="h-10 text-[12.5px]"
                      onClick={() =>
                        staffAction(staff!.id, `${court.short} ${court.status === "open" ? "closed for maintenance" : "reopened"}`, (d) => {
                          const c = d.courts.find((x) => x.id === courtId)!;
                          c.status = c.status === "open" ? "maintenance" : "open";
                          c.maintenanceNote = c.status === "maintenance" ? note || "Closed by staff" : undefined;
                          c.maintenanceLog.unshift({ at: Date.now(), note: c.status === "maintenance" ? `Closed: ${note || "maintenance"}` : "Reopened", by: staff!.name });
                          if (c.status === "open") c.lastServicedAt = Date.now();
                        }, "court.status", "court")
                      }
                    >
                      <Wrench size={14} /> {court.status === "open" ? "Close court" : "Reopen court"}
                    </Button>
                    <Button
                      variant="ghost"
                      className="h-10 text-[12.5px]"
                      onClick={() =>
                        staffAction(staff!.id, `Logged maintenance on ${court.short}`, (d) => {
                          d.courts.find((x) => x.id === courtId)!.maintenanceLog.unshift({ at: Date.now(), note: note || "Routine check", by: staff!.name });
                        }, "court.maintenance", "court")
                      }
                    >
                      Log a check
                    </Button>
                  </div>
                </>
              ) : (
                <Restricted perm="courts:write" />
              )}
              <Label>Log</Label>
              {court.maintenanceLog.map((l, i) => (
                <div key={i} className="rounded-xl bg-white/4 px-3 py-2 text-[11.5px] text-white/70">
                  <span className="text-white">{l.note}</span> · {l.by} · {fmtAgo(l.at, now)}
                </div>
              ))}
            </div>
          )}

          {tab === "revenue" && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {[
                  ["Today", courtRevenue(db, today, today + DAY, courtId)],
                  ["7 days", courtRevenue(db, today - 6 * DAY, today + DAY, courtId)],
                  ["30 days", courtRevenue(db, today - 29 * DAY, today + DAY, courtId)],
                ].map(([l, v]) => (
                  <div key={l as string} className="rounded-2xl bg-white/5 p-3">
                    <p className="text-[10.5px] uppercase tracking-wider text-white/50">{l}</p>
                    <p className="text-[17px] font-semibold tabular text-white">${Math.round(v as number).toLocaleString()}</p>
                  </div>
                ))}
              </div>
              <div>
                <Label>Daily revenue · last 14 days</Label>
                <div className="mt-2"><StackedBars data={month} series={[SERIES.courts]} height={130} /></div>
              </div>
            </div>
          )}
        </div>
      </Gate>
    </ZonePanel>
  );
}

// ---------------------------------------------------------------------------
// Sip café
// ---------------------------------------------------------------------------

const NEXT: Partial<Record<OrderStage, OrderStage>> = { received: "preparing", preparing: "ready", ready: "delivering", delivering: "delivered" };

export function CafePanel({ onClose }: { onClose: () => void }) {
  const db = useStore((s) => s.db);
  const staff = useStaff();
  const now = useNow(2_000);
  const [tab, setTab] = useState<"queue" | "menu" | "inventory" | "sales">("queue");
  const today = startOfDay(now);
  const live = db.orders.filter((o) => !["delivered", "cancelled"].includes(orderStage(o, now))).sort((a, b) => a.createdAt - b.createdAt);
  const writer = can(staff?.role, "cafe:write");
  const salesToday = cafeRevenue(db, today, today + DAY);
  const ordersToday = db.orders.filter((o) => o.createdAt >= today).length;
  const byHour = Array.from({ length: 17 }, (_, i) => 7 + i).map((h) => ({ label: String(h), values: { cafe: cafeRevenue(db, atHour(today, h), atHour(today, h + 1)) } }));
  const low = db.inventory.filter((i) => i.qty <= i.reorderAt);

  return (
    <ZonePanel
      kicker="Sip · kitchen & bar"
      title="sip café."
      onBack={onClose}
      tabs={<Tabs value={tab} onChange={setTab} items={[{ id: "queue", label: "Live queue", badge: live.length }, { id: "menu", label: "Menu" }, { id: "inventory", label: "Inventory", badge: low.length }, { id: "sales", label: "Sales" }]} />}
    >
      <Gate perm="cafe:read">
        {tab === "queue" && (
          <div className="space-y-3">
            {(["received", "preparing", "ready", "delivering"] as OrderStage[]).map((stage) => {
              const list = live.filter((o) => orderStage(o, now) === stage);
              return (
                <div key={stage}>
                  <div className="flex items-center gap-2">
                    <Label>{ORDER_FLOW.find((f) => f.stage === stage)?.label}</Label>
                    <span className="rounded-full bg-white/10 px-1.5 text-[10px] font-bold text-white/70">{list.length}</span>
                  </div>
                  <div className="mt-1.5 space-y-1.5">
                    {list.map((o) => {
                      const c = db.customers.find((x) => x.id === o.customerId);
                      return (
                        <div key={o.id} className={clsx("rounded-2xl p-3", o.deliverTo.kind === "court" ? "bg-sage/10 ring-1 ring-sage/25" : "bg-white/5")}>
                          <div className="flex items-center justify-between">
                            <span className="text-[12.5px] font-semibold text-white">#{o.number} · {c?.name.split(" ")[0]}</span>
                            <span className="text-[10.5px] text-white/50">{fmtAgo(o.createdAt, now)}</span>
                          </div>
                          <p className="text-[11.5px] text-white/75">{o.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}</p>
                          <div className="mt-1.5 flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-sage">→ {o.deliverTo.label}</span>
                            {writer && NEXT[stage] && !(stage === "ready" && o.deliverTo.kind === "pickup" && false) && (
                              <button onClick={() => setOrderStage(o.id, o.deliverTo.kind === "pickup" && stage === "ready" ? "delivered" : NEXT[stage]!, staff!.id)} className="rounded-full bg-white px-2.5 py-1 text-[10.5px] font-semibold text-ink hover:bg-sage">
                                {o.deliverTo.kind === "pickup" && stage === "ready" ? "Picked up" : `→ ${ORDER_FLOW.find((f) => f.stage === NEXT[stage])?.label}`}
                              </button>
                            )}
                          </div>
                          {o.autoFlow && <p className="mt-1 text-[9.5px] uppercase tracking-wider text-white/35">Demo clock running · tap to take over</p>}
                        </div>
                      );
                    })}
                    {!list.length && <p className="text-[11px] text-white/35">Nothing here</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {tab === "menu" && (
          <div className="space-y-1.5">
            {db.menu.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-2xl bg-white/5 px-3 py-2">
                <span className="text-[20px]">{m.emoji}</span>
                <span className="flex-1 text-[12.5px] text-white">{m.name}</span>
                {can(staff?.role, "menu:write") ? (
                  <>
                    <span className="flex items-center gap-1">
                      <button onClick={() => staffAction(staff!.id, `${m.name} price −$0.50`, (d) => { const x = d.menu.find((y) => y.id === m.id)!; x.price = Math.max(1, Math.round((x.price - 0.5) * 100) / 100); }, "menu.price", "menu")} className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-white" aria-label="Lower price"><Minus size={11} /></button>
                      <span className="w-12 text-center text-[12px] tabular text-white">${m.price.toFixed(2)}</span>
                      <button onClick={() => staffAction(staff!.id, `${m.name} price +$0.50`, (d) => { const x = d.menu.find((y) => y.id === m.id)!; x.price = Math.round((x.price + 0.5) * 100) / 100; }, "menu.price", "menu")} className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-white" aria-label="Raise price"><Plus size={11} /></button>
                    </span>
                    <button onClick={() => staffAction(staff!.id, `${m.name} ${m.available ? "marked sold out" : "back on the menu"}`, (d) => { const x = d.menu.find((y) => y.id === m.id)!; x.available = !x.available; }, "menu.availability", "menu")} className={clsx("w-[74px] rounded-full py-1 text-[10.5px] font-semibold", m.available ? "bg-sage/20 text-sage" : "bg-danger/20 text-danger")}>
                      {m.available ? "Available" : "Sold out"}
                    </button>
                  </>
                ) : (
                  <span className="text-[12px] tabular text-white/70">${m.price.toFixed(2)}</span>
                )}
              </div>
            ))}
          </div>
        )}
        {tab === "inventory" && (
          <div className="space-y-2">
            {low.length > 0 && (
              <div className="rounded-2xl bg-gold/10 p-3 text-[12px] text-gold ring-1 ring-gold/30">
                <p className="flex items-center gap-1.5 font-semibold"><Sparkles size={12} /> Reorder suggestion <SimBadge /></p>
                <p className="mt-1 text-gold/90">{low.map((i) => `${i.name}: order ${Math.round(i.par - i.qty)} ${i.unit}`).join(" · ")}. Based on the last 7 days of Sip orders.</p>
              </div>
            )}
            {db.inventory.map((i) => {
              const pct = i.qty / i.par;
              return (
                <div key={i.id} className="rounded-2xl bg-white/5 px-3 py-2.5">
                  <div className="flex items-center justify-between text-[12.5px]">
                    <span className="text-white">{i.name}</span>
                    <span className="tabular text-white/70">{i.qty} / {i.par} {i.unit}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 rounded-full bg-white/[0.07]"><div className="h-full rounded-full" style={{ width: `${Math.min(100, pct * 100)}%`, background: i.qty <= i.reorderAt ? "#f6b26b" : "#36a678" }} /></div>
                    {i.qty <= i.reorderAt && can(staff?.role, "inventory:write") && (
                      <button
                        onClick={() =>
                          staffAction(staff!.id, `Reordered ${i.name} to par`, (d) => {
                            const x = d.inventory.find((y) => y.id === i.id)!;
                            x.qty = x.par;
                            d.tasks.unshift({ id: `tk-${Date.now()}`, title: `Receive ${i.name} delivery`, area: "cafe", assigneeId: "s-cafe", due: Date.now() + 4 * HOUR, status: "todo", priority: "normal", createdBy: staff!.id, createdAt: Date.now() });
                          }, "inventory.reorder", "inventory")
                        }
                        className="rounded-full bg-gold px-2.5 py-0.5 text-[10.5px] font-semibold text-ink"
                      >
                        Reorder
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {tab === "sales" && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {[
                ["Sales today", `$${Math.round(salesToday)}`],
                ["Orders", String(ordersToday)],
                ["Avg ticket", `$${ordersToday ? (salesToday / ordersToday).toFixed(2) : "0"}`],
              ].map(([l, v]) => (
                <div key={l} className="rounded-2xl bg-white/5 p-3">
                  <p className="text-[10.5px] uppercase tracking-wider text-white/50">{l}</p>
                  <p className="text-[17px] font-semibold tabular text-white">{v}</p>
                </div>
              ))}
            </div>
            <div>
              <Label>Today by hour</Label>
              <div className="mt-2"><StackedBars data={byHour} series={[SERIES.cafe]} height={110} /></div>
            </div>
            <div>
              <Label>Top items · last 7 days</Label>
              <div className="mt-2"><HBars color="#dc6d34" format={(n) => `$${Math.round(n)}`} items={topItems(db, today - 6 * DAY).slice(0, 6).map((t) => ({ label: t.name, value: t.revenue, sub: `${t.qty} sold` }))} /></div>
            </div>
            <p className="flex items-center gap-1.5 text-[10.5px] text-white/40"><ChefHat size={11} /> Court deliveries are flagged green in the queue</p>
          </div>
        )}
      </Gate>
    </ZonePanel>
  );
}

// ---------------------------------------------------------------------------
// Kit lockers
// ---------------------------------------------------------------------------

const LOCKER_STATE: Record<LockerLive, { label: string; tone: "good" | "warn" | "bad" | "info" | "neutral"; color: string }> = {
  ready: { label: "Ready", tone: "good", color: "#82be9d" },
  assigned: { label: "Assigned", tone: "warn", color: "#f6b26b" },
  active: { label: "Key active", tone: "info", color: "#3fd6c8" },
  check: { label: "Check kit", tone: "warn", color: "#f28a3b" },
  maintenance: { label: "Maintenance", tone: "bad", color: "#ef6b5b" },
};

export function LockersPanel({ lockerId, onClose, onSelect }: { lockerId?: string; onClose: () => void; onSelect: (id?: string) => void }) {
  const db = useStore((s) => s.db);
  const staff = useStaff();
  const now = useNow(5_000);
  const [tab, setTab] = useState<"lockers" | "keys" | "log">("lockers");
  const live = db.lockers.map((l) => ({ l, ...lockerLive(db, l, now) }));
  const counts = (Object.keys(LOCKER_STATE) as LockerLive[]).map((k) => [k, live.filter((x) => x.state === k).length] as const);
  const sel = live.find((x) => x.l.id === lockerId);
  const writer = can(staff?.role, "kit:write");
  const today = startOfDay(now);
  const windows = db.bookings
    .filter((b) => b.status === "confirmed" && b.lockerId && b.start + (b.durationMin + KEY_WINDOW_MIN) * MIN > now && b.start < today + DAY + 6 * HOUR)
    .sort((a, b) => a.start - b.start)
    .slice(0, 30);
  const logs = db.accessLogs.filter((l) => l.door.startsWith("Locker")).slice(0, 30);

  return (
    <ZonePanel
      kicker="Self-service · rackets & balls"
      title="kit lockers."
      onBack={onClose}
      tabs={<Tabs value={tab} onChange={setTab} items={[{ id: "lockers", label: "Lockers" }, { id: "keys", label: "Key windows", badge: live.filter((x) => x.state === "active").length }, { id: "log", label: "Access log" }]} />}
    >
      <Gate perm="lockers:read">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {counts.map(([k, n]) => (
              <span key={k} className="flex items-center gap-1.5 rounded-full bg-white/6 px-2.5 py-1 text-[11px] text-white/75">
                <span className="h-2 w-2 rounded-full" style={{ background: LOCKER_STATE[k].color }} /> {LOCKER_STATE[k].label} <span className="font-semibold tabular text-white">{n}</span>
              </span>
            ))}
          </div>

          {tab === "lockers" && (
            <>
              {(["Hall", "Sea side"] as const).map((bank) => (
                <div key={bank}>
                  <Label>{bank} bank</Label>
                  <div className="mt-1.5 grid grid-cols-6 gap-1.5">
                    {live.filter((x) => x.l.bank === bank).map(({ l, state }) => (
                      <button
                        key={l.id}
                        onClick={() => onSelect(l.id)}
                        className={clsx("flex aspect-square flex-col items-center justify-center rounded-xl text-[12px] font-bold tabular transition", lockerId === l.id ? "ring-2 ring-white" : "hover:brightness-110")}
                        style={{ background: `${LOCKER_STATE[state].color}33`, color: LOCKER_STATE[state].color }}
                        title={`Locker ${l.number} · ${LOCKER_STATE[state].label}`}
                      >
                        {l.number}
                        <span className="mt-0.5 h-1 w-4 rounded-full" style={{ background: LOCKER_STATE[state].color }} />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {sel ? (
                <div className="rounded-[22px] border border-white/10 bg-ink/40 p-4 text-[12px]">
                  <div className="flex items-center justify-between">
                    <p className="text-[15px] font-semibold text-white">Locker {sel.l.number} · {sel.l.bank}</p>
                    <Pill tone={LOCKER_STATE[sel.state].tone}>{LOCKER_STATE[sel.state].label}</Pill>
                  </div>
                  <p className="mt-1 text-white/60">Kit: {sel.l.kit.rackets} rackets · {sel.l.kit.balls} balls · last checked {fmtAgo(sel.l.lastCheckedAt, now)}</p>
                  {sel.l.note && <p className="mt-1 text-gold">{sel.l.note}</p>}
                  {[sel.booking, sel.next].filter(Boolean).map((b, i) => {
                    const c = db.customers.find((x) => x.id === b!.customerId);
                    const from = b!.start - KEY_WINDOW_MIN * MIN;
                    const to = b!.start + (b!.durationMin + KEY_WINDOW_MIN) * MIN;
                    return (
                      <div key={b!.id} className="mt-2 rounded-xl bg-white/5 p-2.5">
                        <p className="text-[10.5px] uppercase tracking-wider text-white/45">{i === 0 && sel.booking ? (sel.state === "active" ? "Key active now" : "Last session") : "Next session"}</p>
                        <p className="font-semibold text-white">{c?.name} · {db.courts.find((x) => x.id === b!.courtId)?.short}</p>
                        <p className="text-white/60">{fmtDayLabel(b!.start, now)} · key {fmtTime(from)} → {fmtTime(to)} · {kitFor(b!).rackets} rackets</p>
                      </div>
                    );
                  })}
                  {writer ? (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button variant="sage" className="h-9 text-[12px]" onClick={() => checkLocker(sel.l.id, staff!.id, "ready")}>
                        <Check size={13} /> Kit checked
                      </Button>
                      {sel.l.status === "maintenance" ? (
                        <Button variant="ghost" className="h-9 text-[12px]" onClick={() => checkLocker(sel.l.id, staff!.id, "ready")}>Back in service</Button>
                      ) : (
                        <Button variant="ghost" className="h-9 text-[12px]" onClick={() => checkLocker(sel.l.id, staff!.id, "maintenance", "Taken out of service by staff")}>
                          <Wrench size={13} /> Maintenance
                        </Button>
                      )}
                    </div>
                  ) : (
                    <p className="mt-3 text-[11px] text-white/45">Kit actions need the kit:write permission.</p>
                  )}
                </div>
              ) : (
                <p className="text-[11.5px] text-white/45">Tap a locker for its kit, key windows and actions.</p>
              )}
            </>
          )}

          {tab === "keys" && (
            <div className="space-y-1.5">
              <p className="text-[11px] text-white/45">Every paid booking: locker + court gate, open from {KEY_WINDOW_MIN} min before to {KEY_WINDOW_MIN} min after.</p>
              {windows.map((b) => {
                const c = db.customers.find((x) => x.id === b.customerId);
                const from = b.start - KEY_WINDOW_MIN * MIN;
                const to = b.start + (b.durationMin + KEY_WINDOW_MIN) * MIN;
                const activeNow = now >= from && now <= to;
                const locker = db.lockers.find((l) => l.id === b.lockerId);
                return (
                  <button key={b.id} onClick={() => { setTab("lockers"); onSelect(b.lockerId); }} className={clsx("flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left", activeNow ? "bg-[#3fd6c8]/12 ring-1 ring-[#3fd6c8]/40" : "bg-white/5 hover:bg-white/8")}>
                    <span className="w-10 text-center text-[13px] font-bold tabular text-white">{locker?.number}</span>
                    <span className="flex-1">
                      <span className="block text-[12.5px] font-semibold text-white">{c?.name} · {db.courts.find((x) => x.id === b.courtId)?.short}</span>
                      <span className="block font-mono text-[10.5px] text-white/55">{fmtDayLabel(b.start, now)} {fmtTime(from)} → {fmtTime(to)}</span>
                    </span>
                    <Pill tone={activeNow ? "info" : "neutral"}>{activeNow ? "Active" : `in ${Math.max(1, Math.round((from - now) / MIN))} min`}</Pill>
                  </button>
                );
              })}
            </div>
          )}

          {tab === "log" && (
            <div className="space-y-1">
              {logs.length === 0 && <p className="text-[12px] text-white/45">No locker openings yet.</p>}
              {logs.map((l) => (
                <p key={l.id} className="text-[11.5px] text-white/70">
                  {fmtTime(l.at)} · {l.door} · {db.customers.find((c) => c.id === l.holderId)?.name ?? "Unknown"} · <span className={l.result === "granted" ? "text-sage" : "text-danger"}>{l.result}</span>
                  {l.reason ? <span className="text-white/45"> · {l.reason}</span> : null}
                </p>
              ))}
            </div>
          )}
        </div>
      </Gate>
    </ZonePanel>
  );
}
