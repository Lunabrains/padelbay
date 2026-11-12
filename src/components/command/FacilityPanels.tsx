"use client";

import clsx from "clsx";
import { useState, type ReactNode } from "react";
import { ChefHat, Lock, Minus, Plus, Sparkles, Wrench } from "lucide-react";
import { courtLive } from "@/components/three/Stage";
import { Avatar, Button, Label, SimBadge, Tabs, ZonePanel } from "@/components/ui/kit";
import { ORDER_FLOW, cancelBooking, orderStage, revokePass, setOrderStage, staffAction } from "@/lib/actions";
import { utilization } from "@/lib/engine/availability";
import { can, type Permission } from "@/lib/catalog";
import { useNow, useStaff } from "@/lib/hooks";
import { cafeRevenue, courtRevenue, mask, occupancy, topItems } from "@/lib/ops";
import { useStore } from "@/lib/store";
import type { OrderStage, Unit } from "@/lib/types";
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
                        <div key={o.id} className={clsx("rounded-2xl p-3", o.deliverTo.kind === "court" ? "bg-sage/10 ring-1 ring-sage/25" : o.deliverTo.kind === "suite" ? "bg-[#5a88e6]/12 ring-1 ring-[#5a88e6]/30" : "bg-white/5")}>
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
// Bay Suites
// ---------------------------------------------------------------------------

const HK: Unit["housekeeping"][] = ["clean", "dirty", "inspecting", "out-of-order"];

export function SuitesPanel({ unitId, onClose }: { unitId?: string; onClose: () => void }) {
  const db = useStore((s) => s.db);
  const staff = useStaff();
  const now = useNow(10_000);
  const [tab, setTab] = useState<"reservations" | "occupancy" | "housekeeping" | "guests" | "access">("reservations");
  const today = startOfDay(now);
  const unit = unitId ? db.units.find((u) => u.id === unitId) : undefined;
  const stays = db.stays.filter((s) => s.status !== "cancelled" && (!unitId || s.unitId === unitId)).sort((a, b) => a.checkIn - b.checkIn);
  const pii = can(staff?.role, "guests:pii");
  const nights = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const keys = db.passes.filter((p) => p.kind === "suite");
  const suiteLogs = db.accessLogs.filter((l) => / door$/.test(l.door)).slice(0, 12);

  return (
    <ZonePanel
      kicker="Bay Suites · concept operations"
      title={unit ? unit.name.toLowerCase() : "bay suites."}
      onBack={onClose}
      tabs={<Tabs value={tab} onChange={setTab} items={[{ id: "reservations", label: "Reservations", badge: stays.filter((s) => s.status !== "checked-out").length }, { id: "occupancy", label: "Occupancy" }, { id: "housekeeping", label: "Housekeeping" }, { id: "guests", label: "Guests" }, { id: "access", label: "Access" }]} />}
    >
      <Gate perm="stays:read">
        {tab === "reservations" && (
          <div className="space-y-1.5">
            {stays.map((s) => {
              const c = db.customers.find((x) => x.id === s.customerId);
              const u = db.units.find((x) => x.id === s.unitId);
              return (
                <div key={s.id} className="rounded-2xl bg-white/5 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[12.5px] font-semibold text-white">{u?.name} · {c?.name}</span>
                    <Pill tone={s.status === "checked-in" ? "warn" : s.status === "checked-out" ? "neutral" : "good"}>{s.status}</Pill>
                  </div>
                  <p className="text-[11.5px] text-white/60">{fmtDate(s.checkIn)} → {fmtDate(s.checkOut)} · ${s.total} {s.packageId ? `· ${db.packages.find((p) => p.id === s.packageId)?.name}` : ""}</p>
                  <p className="text-[11px] text-white/45">{s.registration ? `Registered · arrival ${s.registration.arrivalTime} · ID verified` : "Registration pending"}{s.keyPassId ? " · smart key issued" : ""}</p>
                </div>
              );
            })}
          </div>
        )}
        {tab === "occupancy" && (
          <div className="space-y-3 overflow-x-auto thin-scrollbar">
            <div className="min-w-[380px]">
              <div className="flex pl-24">
                {nights.map((n) => <span key={n} className="flex-1 text-center text-[9px] text-white/45">{new Date(n).getDate()}</span>)}
              </div>
              {db.units.map((u) => (
                <div key={u.id} className="mt-[2px] flex items-center">
                  <span className="w-24 shrink-0 truncate text-[10.5px] text-white/65">{u.name}</span>
                  {nights.map((n) => {
                    const s = db.stays.find((x) => x.unitId === u.id && x.status !== "cancelled" && x.checkIn < n + DAY && x.checkOut > n + 12 * HOUR);
                    return <div key={n} className="flex-1 px-[1px]"><div className="h-5 rounded-[4px]" title={s ? db.customers.find((c) => c.id === s.customerId)?.name : "Free"} style={{ background: s ? "#5a88e6" : "rgba(255,255,255,0.05)" }} /></div>;
                  })}
                </div>
              ))}
              <div className="mt-2 flex items-center pl-24">
                {nights.map((n) => <span key={n} className="flex-1 text-center text-[9px] tabular text-white/55">{Math.round(occupancy(db, n) * 100)}</span>)}
              </div>
              <p className="mt-1 pl-24 text-[10px] text-white/40">% occupancy per night · simulated reservations</p>
            </div>
          </div>
        )}
        {tab === "housekeeping" && (
          <div className="space-y-2">
            {db.units.map((u) => (
              <div key={u.id} className="rounded-2xl bg-white/5 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] font-semibold text-white">{u.name}</span>
                  <Pill tone={u.housekeeping === "clean" ? "good" : u.housekeeping === "dirty" ? "bad" : "warn"}>{u.housekeeping}</Pill>
                </div>
                {can(staff?.role, "housekeeping:write") && (
                  <div className="mt-2 flex gap-1">
                    {HK.map((h) => (
                      <button key={h} onClick={() => staffAction(staff!.id, `${u.name} → ${h}`, (d) => { d.units.find((x) => x.id === u.id)!.housekeeping = h; if (h === "clean") d.tasks.filter((t) => t.refId === u.id && t.status !== "done").forEach((t) => (t.status = "done")); }, "housekeeping.status", "unit")} className={clsx("flex-1 rounded-full py-1 text-[10px] font-semibold capitalize", u.housekeeping === h ? "bg-white text-ink" : "bg-white/8 text-white/70")}>
                        {h.replace("-", " ")}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {tab === "guests" && (
          <div className="space-y-2">
            {!pii && <p className="rounded-2xl bg-white/5 p-3 text-[11.5px] text-white/60"><Lock size={12} className="mr-1 inline" /> Contact details are masked for your role (needs guests:pii).</p>}
            {stays.filter((s) => s.status !== "checked-out").map((s) => {
              const c = db.customers.find((x) => x.id === s.customerId);
              return (
                <div key={s.id} className="rounded-2xl bg-white/5 p-3">
                  <p className="text-[12.5px] font-semibold text-white">{c?.name} · {db.units.find((u) => u.id === s.unitId)?.name}</p>
                  <p className="text-[11.5px] text-white/60">{mask(c?.phone ?? "", pii)} · {mask(c?.email ?? "", pii)}</p>
                  <p className="mt-1 text-[11px] text-white/50">Guests: {s.guests.map((g) => g.name).join(", ")}</p>
                </div>
              );
            })}
          </div>
        )}
        {tab === "access" && (
          <div className="space-y-2">
            <Label>Smart keys</Label>
            {keys.length === 0 && <p className="text-[11.5px] text-white/45">No digital keys issued yet. They appear at check-in.</p>}
            {keys.map((k) => (
              <div key={k.id} className="flex items-center justify-between rounded-2xl bg-white/5 px-3 py-2.5">
                <span>
                  <span className="block text-[12.5px] font-semibold text-white">{k.door}</span>
                  <span className="block text-[11px] text-white/55">{db.customers.find((c) => c.id === k.holderId)?.name} · until {fmtDate(k.validTo)}</span>
                </span>
                {k.status === "active" && can(staff?.role, "access:manage") ? (
                  <button onClick={() => revokePass(k.id, staff!.id)} className="rounded-full bg-danger/20 px-2.5 py-1 text-[10.5px] font-semibold text-danger">Revoke</button>
                ) : (
                  <Pill tone={k.status === "active" ? "good" : "neutral"}>{k.status}</Pill>
                )}
              </div>
            ))}
            <Label className="pt-2">Recent door events</Label>
            {suiteLogs.map((l) => (
              <p key={l.id} className="text-[11.5px] text-white/65">{fmtTime(l.at)} · {l.door} · <span className={l.result === "granted" ? "text-sage" : "text-danger"}>{l.result}</span> · {l.method}</p>
            ))}
          </div>
        )}
      </Gate>
    </ZonePanel>
  );
}
