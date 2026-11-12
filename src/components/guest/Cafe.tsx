"use client";

import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import { Bike, Check, ChefHat, Minus, Plus, ShoppingBag, Sparkles, X } from "lucide-react";
import { POSES } from "@/components/three/rig";
import { Button, JoinCard, Label, Tabs, ZonePanel, useZone } from "@/components/ui/kit";
import { ORDER_FLOW, linePrice, orderStage, placeOrder, upcomingFor } from "@/lib/actions";
import { MENU_CATEGORIES, OPTION_GROUPS } from "@/lib/catalog";
import { useFx } from "@/lib/fx";
import { useCustomer, useNow } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import type { MenuItem, Order, OrderLine } from "@/lib/types";
import { HOUR, fmtAgo, fmtDayLabel, fmtTime } from "@/lib/time";

type Tab = "menu" | "cart" | "orders";

function optionsLabel(opts: OrderLine["options"]) {
  return opts
    .flatMap((o) => o.choiceIds.map((c) => OPTION_GROUPS[o.groupId]?.choices.find((x) => x.id === c)?.label).filter(Boolean))
    .join(" · ");
}

export default function Cafe() {
  useZone("cafe", POSES.cafe, "cafe");
  const db = useStore((s) => s.db);
  const customer = useCustomer();
  const now = useNow(2_000);
  const celebrate = useFx((s) => s.celebrate);
  const toast = useFx((s) => s.toast);
  const [tab, setTab] = useState<Tab>("menu");
  const [cat, setCat] = useState<MenuItem["category"]>("coffee");
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [cart, setCart] = useState<OrderLine[]>([]);
  const [deliver, setDeliver] = useState<string>("pickup");
  const [method, setMethod] = useState("Apple Pay");
  const [placing, setPlacing] = useState(false);
  const [trackId, setTrackId] = useState<string | null>(null);

  const bookings = customer ? upcomingFor(db, customer.id, now).filter((b) => b.start - now < 36 * HOUR).slice(0, 3) : [];
  const stay = customer ? db.stays.find((s) => s.customerId === customer.id && s.status === "checked-in") : undefined;

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const d = q.get("deliver");
    if (d) setDeliver(`court:${d}`);
    const item = q.get("item");
    const it = item && db.menu.find((m) => m.id === item);
    if (it) {
      setCat(it.category);
      setEditing(it);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (deliver === "pickup" && bookings[0]) setDeliver(`court:${bookings[0].id}`);
    else if (deliver === "pickup" && stay) setDeliver(`suite:${stay.id}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings.length, stay?.id]);

  const items = db.menu.filter((m) => m.category === cat);
  const cartTotal = Math.round(cart.reduce((s, l) => s + l.qty * l.unitPrice, 0) * 100) / 100;
  const cartCount = cart.reduce((s, l) => s + l.qty, 0);
  const myOrders = customer ? db.orders.filter((o) => o.customerId === customer.id).sort((a, b) => b.createdAt - a.createdAt) : [];
  const active = myOrders.filter((o) => !["delivered", "cancelled"].includes(orderStage(o, now)));
  const tracked = myOrders.find((o) => o.id === trackId) ?? active[0];

  const deliverTo = (): Order["deliverTo"] => {
    if (deliver.startsWith("court:")) {
      const b = db.bookings.find((x) => x.id === deliver.slice(6));
      const c = db.courts.find((x) => x.id === b?.courtId);
      if (b && c) return { kind: "court", refId: c.id, label: c.short };
    }
    if (deliver.startsWith("suite:")) {
      const s = db.stays.find((x) => x.id === deliver.slice(6));
      const u = db.units.find((x) => x.id === s?.unitId);
      if (s && u) return { kind: "suite", refId: s.id, label: u.name };
    }
    return { kind: "pickup", label: "Pickup at Sip" };
  };

  const order = () => {
    if (!customer) return;
    setPlacing(true);
    setTimeout(() => {
      const res = placeOrder({ customerId: customer.id, lines: cart, deliverTo: deliverTo(), method });
      setPlacing(false);
      if (!res.ok) return toast({ tone: "error", title: res.error });
      setCart([]);
      setTrackId(res.value.id);
      setTab("orders");
      celebrate(res.reward);
    }, 900);
  };

  return (
    <ZonePanel
      kicker="Sip · specialty coffee"
      title={tab === "orders" ? "your orders." : tab === "cart" ? "your tray." : <>refuel your<br />energy.</>}
      tabs={
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { id: "menu", label: "Menu" },
            { id: "cart", label: "Tray", badge: cartCount },
            { id: "orders", label: "Orders", badge: active.length },
          ]}
        />
      }
      footer={
        tab !== "orders" && cartCount > 0 ? (
          tab === "menu" ? (
            <Button variant="sage" className="w-full" onClick={() => setTab("cart")}>
              <ShoppingBag size={16} /> View tray · {cartCount} item{cartCount > 1 ? "s" : ""} · ${cartTotal.toFixed(2)}
            </Button>
          ) : customer ? (
            <div>
              <Button variant="sage" className="w-full" loading={placing} onClick={order}>
                {placing ? "Sending to the kitchen…" : `Place order · $${cartTotal.toFixed(2)}`}
              </Button>
              <p className="mt-2 text-center text-[10.5px] text-white/45">You confirm before anything is charged · demo payment</p>
            </div>
          ) : undefined
        ) : undefined
      }
    >
      {tab === "menu" && (
        <div className="space-y-4">
          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
            {MENU_CATEGORIES.map((c) => (
              <button key={c.id} onClick={() => setCat(c.id)} className={clsx("shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-medium transition", cat === c.id ? "bg-timber text-white" : "bg-white/8 text-white/75 hover:bg-white/14")}>
                {c.label}
              </button>
            ))}
          </div>
          <p className="font-display text-[15px] lowercase text-white/70">{MENU_CATEGORIES.find((c) => c.id === cat)?.blurb}</p>
          <div className="space-y-2">
            {items.map((m) => (
              <button
                key={m.id}
                disabled={!m.available}
                onClick={() => setEditing(m)}
                className="group flex w-full items-center gap-3 rounded-[22px] bg-white/5 p-2.5 text-left transition hover:bg-white/10 disabled:opacity-40"
              >
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[18px] text-[34px] transition group-hover:scale-105" style={{ background: `linear-gradient(150deg, hsl(${m.hue} 70% 84%), hsl(${(m.hue + 25) % 360} 60% 66%))` }}>
                  {m.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-[14px] font-semibold text-white">{m.name}</span>
                    {m.tags[0] && <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-gold">{m.tags[0]}</span>}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-[11.5px] leading-snug text-white/55">{m.available ? m.description : "Sold out for today"}</span>
                  <span className="mt-1 block text-[13px] font-semibold tabular text-white">${m.price.toFixed(2)}</span>
                </span>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-ink transition group-hover:bg-sage"><Plus size={16} /></span>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === "cart" && (
        <div className="space-y-4">
          {!cart.length && <p className="rounded-2xl bg-white/5 p-4 text-[13px] text-white/60">Your tray is empty. Add a flat white, you&apos;ve earned it.</p>}
          {cart.map((l, i) => (
            <div key={i} className="flex items-center gap-3 rounded-2xl bg-white/5 p-3">
              <span className="text-[26px]">{db.menu.find((m) => m.id === l.itemId)?.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold text-white">{l.name}</span>
                {l.optionsLabel && <span className="block truncate text-[11px] text-white/55">{l.optionsLabel}</span>}
                <span className="block text-[12px] tabular text-white/75">${(l.unitPrice * l.qty).toFixed(2)}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <button onClick={() => setCart((c) => c.flatMap((x, j) => (j === i ? (x.qty > 1 ? [{ ...x, qty: x.qty - 1 }] : []) : [x])))} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white" aria-label="Less"><Minus size={13} /></button>
                <span className="w-5 text-center text-[13px] font-semibold tabular text-white">{l.qty}</span>
                <button onClick={() => setCart((c) => c.map((x, j) => (j === i ? { ...x, qty: x.qty + 1 } : x)))} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white" aria-label="More"><Plus size={13} /></button>
              </span>
            </div>
          ))}
          {cart.length > 0 && (
            <>
              <div>
                <Label>Deliver to</Label>
                <div className="mt-2 space-y-1.5">
                  {bookings.map((b) => {
                    const c = db.courts.find((x) => x.id === b.courtId)!;
                    const id = `court:${b.id}`;
                    return (
                      <DeliverOption key={id} on={deliver === id} onClick={() => setDeliver(id)} title={`${c.short} gate`} sub={`${fmtDayLabel(b.start, now)} ${fmtTime(b.start)} · we bring it to your court`} icon="🎾" />
                    );
                  })}
                  {stay && <DeliverOption on={deliver === `suite:${stay.id}`} onClick={() => setDeliver(`suite:${stay.id}`)} title={db.units.find((u) => u.id === stay.unitId)?.name ?? "Your suite"} sub="Room delivery · charge to your suite" icon="🛏️" />}
                  <DeliverOption on={deliver === "pickup"} onClick={() => setDeliver("pickup")} title="Pickup at Sip" sub="We'll ping you when it's ready" icon="☕" />
                </div>
              </div>
              {customer ? (
                <div>
                  <Label>Pay with</Label>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {["Apple Pay", "Card •••• 4242", ...(stay ? ["Charge to suite"] : [])].map((m) => (
                      <button key={m} onClick={() => setMethod(m)} className={clsx("rounded-full px-3.5 py-2 text-[12px] font-medium transition", method === m ? "bg-white text-ink" : "bg-white/8 text-white/75")}>
                        {m}
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-sage"><Sparkles size={12} /> You earn {Math.round(cartTotal * 2)} points (double points at Sip){deliverTo().kind === "court" && !customer.achievements.some((a) => a.id === "sip-and-play") ? " + Sip & Play achievement" : ""}</p>
                </div>
              ) : (
                <JoinCard reason="to order" />
              )}
            </>
          )}
        </div>
      )}

      {tab === "orders" && (
        <div className="space-y-4">
          {tracked ? <OrderTracker order={tracked} now={now} /> : <p className="rounded-2xl bg-white/5 p-4 text-[13px] text-white/60">No orders yet. Your history will live here.</p>}
          {myOrders.length > 0 && (
            <div>
              <Label>History</Label>
              <div className="mt-2 space-y-1.5">
                {myOrders.map((o) => (
                  <button key={o.id} onClick={() => setTrackId(o.id)} className={clsx("flex w-full items-center justify-between rounded-2xl px-3.5 py-2.5 text-left transition", tracked?.id === o.id ? "bg-white/12" : "bg-white/5 hover:bg-white/10")}>
                    <span>
                      <span className="block text-[13px] font-semibold text-white">#{o.number} · {o.lines.map((l) => l.name).join(", ")}</span>
                      <span className="block text-[11px] text-white/50">{fmtAgo(o.createdAt, now)} · {o.deliverTo.label}</span>
                    </span>
                    <span className="text-[12.5px] font-semibold tabular text-white">${o.total.toFixed(2)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {editing && (
        <Customize
          item={editing}
          onClose={() => setEditing(null)}
          onAdd={(line) => {
            setCart((c) => [...c, line]);
            setEditing(null);
            toast({ tone: "success", title: `${line.name} added`, body: line.optionsLabel || "Straight up" });
          }}
        />
      )}
    </ZonePanel>
  );
}

function DeliverOption({ on, onClick, title, sub, icon }: { on: boolean; onClick: () => void; title: string; sub: string; icon: string }) {
  return (
    <button onClick={onClick} className={clsx("flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition", on ? "border-sage bg-sage/12" : "border-white/10 bg-white/4 hover:bg-white/8")}>
      <span className="text-[20px]">{icon}</span>
      <span className="flex-1">
        <span className="block text-[13px] font-semibold text-white">{title}</span>
        <span className="block text-[11px] text-white/55">{sub}</span>
      </span>
      {on && <Check size={16} className="text-sage" />}
    </button>
  );
}

function Customize({ item, onClose, onAdd }: { item: MenuItem; onClose: () => void; onAdd: (l: OrderLine) => void }) {
  const [sel, setSel] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(item.options.map((g) => [g, OPTION_GROUPS[g]?.defaultId ? [OPTION_GROUPS[g].defaultId!] : []])),
  );
  const [qty, setQty] = useState(1);
  const options = useMemo(() => Object.entries(sel).filter(([, v]) => v.length).map(([groupId, choiceIds]) => ({ groupId, choiceIds })), [sel]);
  const unit = linePrice(item.price, options);
  return (
    <div className="animate-rise absolute inset-0 z-10 flex flex-col bg-night/95 backdrop-blur-xl">
      <div className="relative flex h-40 shrink-0 items-center justify-center" style={{ background: `linear-gradient(150deg, hsl(${item.hue} 70% 84%), hsl(${(item.hue + 25) % 360} 60% 64%))` }}>
        <span className="text-[92px] drop-shadow-[0_18px_24px_rgba(0,0,0,0.25)]">{item.emoji}</span>
        <button onClick={onClose} className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-ink/70 text-white" aria-label="Close"><X size={16} /></button>
      </div>
      <div className="thin-scrollbar flex-1 space-y-4 overflow-y-auto p-5">
        <div>
          <p className="font-display text-[26px] font-bold lowercase leading-none text-white">{item.name}</p>
          <p className="mt-1.5 text-[12.5px] text-white/60">{item.description}</p>
        </div>
        {item.options.map((gid) => {
          const g = OPTION_GROUPS[gid];
          if (!g) return null;
          return (
            <div key={gid}>
              <Label>{g.label}{g.type === "multi" ? " · pick any" : ""}</Label>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {g.choices.map((c) => {
                  const on = sel[gid]?.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSel((s) => ({ ...s, [gid]: g.type === "single" ? [c.id] : on ? s[gid].filter((x) => x !== c.id) : [...(s[gid] ?? []), c.id] }))}
                      className={clsx("rounded-full px-3.5 py-2 text-[12.5px] font-medium transition", on ? "bg-sage text-ink" : "bg-white/8 text-white/80 hover:bg-white/14")}
                    >
                      {c.label}{c.price ? ` +$${c.price.toFixed(2)}` : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3 border-t border-white/10 p-4">
        <span className="flex items-center gap-2">
          <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white" aria-label="Less"><Minus size={14} /></button>
          <span className="w-5 text-center text-[14px] font-semibold tabular text-white">{qty}</span>
          <button onClick={() => setQty((q) => q + 1)} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white" aria-label="More"><Plus size={14} /></button>
        </span>
        <Button variant="sage" className="flex-1" onClick={() => onAdd({ itemId: item.id, name: item.name, qty, unitPrice: unit, options, optionsLabel: optionsLabel(options) })}>
          Add · ${(unit * qty).toFixed(2)}
        </Button>
      </div>
    </div>
  );
}

function OrderTracker({ order, now }: { order: Order; now: number }) {
  const stage = orderStage(order, now);
  const flow = ORDER_FLOW.filter((f) => !(f.stage === "delivering" && order.deliverTo.kind === "pickup"));
  const idx = flow.findIndex((f) => f.stage === stage);
  const icons = { received: Check, preparing: ChefHat, ready: Sparkles, delivering: Bike, delivered: Check, cancelled: X };
  const eta = Math.max(0, Math.round((flow[flow.length - 1].at - (now - order.createdAt) / 1000) / 6) / 10);
  return (
    <div className="rounded-[26px] bg-gradient-to-br from-timber/90 to-sunset/80 p-4 text-white">
      <div className="flex items-start justify-between">
        <div>
          <p className="label-caps text-white/80">Order #{order.number}</p>
          <p className="mt-1 text-[18px] font-bold leading-tight">{flow[idx]?.label ?? "Delivered"}</p>
          <p className="text-[12px] text-white/80">→ {order.deliverTo.label}{stage !== "delivered" && order.autoFlow ? ` · about ${Math.max(1, Math.ceil(eta))} min (demo clock)` : ""}</p>
        </div>
        <span className="text-[36px]">{stage === "delivered" ? "🙌" : stage === "delivering" ? "🛵" : "☕"}</span>
      </div>
      <div className="mt-4 flex items-center gap-1">
        {flow.map((f, i) => {
          const Icon = icons[f.stage];
          return (
            <div key={f.stage} className="flex flex-1 flex-col items-center gap-1.5">
              <span className={clsx("flex h-8 w-8 items-center justify-center rounded-full transition-all duration-700", i <= idx ? "bg-white text-timber" : "bg-white/20 text-white/70", i === idx && stage !== "delivered" && "ring-4 ring-white/30")}>
                <Icon size={14} />
              </span>
              <span className="text-center text-[9.5px] font-semibold uppercase tracking-wider text-white/85">{f.label}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 space-y-1 border-t border-white/20 pt-3 text-[12.5px]">
        {order.lines.map((l, i) => (
          <div key={i} className="flex justify-between">
            <span>{l.qty}× {l.name}{l.optionsLabel ? <span className="text-white/70"> · {l.optionsLabel}</span> : null}</span>
            <span className="tabular">${(l.unitPrice * l.qty).toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
