"use client";

import clsx from "clsx";
import { QRCodeSVG } from "qrcode.react";
import { useRef, useState } from "react";
import { Check, KeyRound, Loader2, Nfc, RotateCcw, Wallet, X } from "lucide-react";
import { LogoDuoLight } from "@/components/brand/Logo";
import { ensureCourtPass, kitFor, unlockDoor } from "@/lib/actions";
import { KEY_WINDOW_MIN, memberNumber, nextTier, tierFor } from "@/lib/catalog";
import { useFx } from "@/lib/fx";
import { useNow } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import type { Customer } from "@/lib/types";
import { fmtDate, fmtDayLabel, fmtTime } from "@/lib/time";

// The Padel Bay Club card: membership ID, loyalty level and the key to every door the member
// has booked: for every paid session it opens the kit locker (rackets + balls) and the court gate
// from 10 minutes before until 10 minutes after. Door hardware is simulated until it is selected.

export function MemberCard({ customer, compact = false }: { customer: Customer; compact?: boolean }) {
  const [flipped, setFlipped] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const tier = tierFor(customer.loyalty.lifetime);
  const no = memberNumber(customer.id);
  const credential = `PADELBAY-CLUB:${no}:${customer.id}`;
  return (
    <div className="[perspective:1200px]">
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setTilt({ x: ((e.clientY - r.top) / r.height - 0.5) * -10, y: ((e.clientX - r.left) / r.width - 0.5) * 12 });
        }}
        onPointerLeave={() => setTilt({ x: 0, y: 0 })}
        className="relative block aspect-[1.586] w-full text-left transition-transform duration-700 [transform-style:preserve-3d]"
        style={{ transform: `rotateX(${tilt.x}deg) rotateY(${(flipped ? 180 : 0) + tilt.y}deg)` }}
        aria-label="Padel Bay Club card, tap to flip"
      >
        {/* front */}
        <span
          className="absolute inset-0 overflow-hidden rounded-[22px] p-5 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.7)] [backface-visibility:hidden]"
          style={{ background: `radial-gradient(120% 140% at 0% 0%, ${tier.color} 0%, #1f5a60 45%, #071315 100%)` }}
        >
          <span className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full border-[26px] border-white/10" />
          <span className="pointer-events-none absolute -bottom-24 right-10 h-56 w-56 rounded-full border-[18px] border-white/5" />
          <span
            className="pointer-events-none absolute inset-0 opacity-60 mix-blend-overlay"
            style={{ background: `linear-gradient(${115 + tilt.y * 3}deg, transparent 30%, rgba(255,255,255,0.55) 48%, transparent 62%)` }}
          />
          <span className="relative flex h-full flex-col justify-between">
            <span className="flex items-start justify-between">
              <LogoDuoLight className={compact ? "w-24" : "w-28"} />
              <span className="text-right">
                <span className="block text-[9px] font-semibold uppercase tracking-[0.22em] text-white/70">Padel Bay Club</span>
                <span className="mt-0.5 flex items-center justify-end gap-1 text-white/80"><Nfc size={14} /></span>
              </span>
            </span>
            <span>
              <span className="block font-display text-[30px] font-bold lowercase leading-none text-white">{tier.name}</span>
              <span className="mt-0.5 block text-[11px] text-white/75">with {tier.character} · {customer.loyalty.points.toLocaleString()} pts</span>
            </span>
            <span className="flex items-end justify-between">
              <span>
                <span className="block text-[13px] font-semibold uppercase tracking-[0.08em] text-white">{customer.name}</span>
                <span className="block font-mono text-[11px] tracking-[0.18em] text-white/70">{no}</span>
              </span>
              <span className="text-right text-[9.5px] uppercase tracking-[0.16em] text-white/60">
                Member since
                <span className="block font-mono text-[11px] tracking-normal text-white/85">{fmtDate(customer.enrolledAt ?? customer.createdAt).slice(4)}</span>
              </span>
            </span>
          </span>
        </span>
        {/* back */}
        <span className="absolute inset-0 flex items-center gap-4 overflow-hidden rounded-[22px] bg-cream p-5 text-ink shadow-[0_30px_60px_-20px_rgba(0,0,0,0.7)] [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <span className="rounded-2xl bg-white p-2 shadow">
            <QRCodeSVG value={credential} size={compact ? 92 : 112} fgColor="#071315" level="M" />
          </span>
          <span className="flex-1">
            <span className="block text-[9.5px] font-semibold uppercase tracking-[0.2em] text-teal">Scan or tap at any gate</span>
            <span className="mt-1 block font-mono text-[15px] font-semibold tracking-[0.14em]">{no}</span>
            <span className="mt-1 block text-[11px] leading-snug text-ink/60">Holds your digital keys: kit locker and court gate, 10 min before to 10 min after each session.</span>
          </span>
        </span>
      </button>
      <p className="mt-2 flex items-center justify-center gap-1.5 text-[10.5px] text-white/45"><RotateCcw size={11} /> Tap the card to flip it</p>
    </div>
  );
}

function countdown(ms: number) {
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}

interface KeyRow {
  bookingId: string;
  passId?: string;
  court: string;
  locker?: string;
  start: number;
  end: number;
  from: number;
  to: number;
  rackets: number;
}

/**
 * Digital keys on the club card: one per paid booking. Each opens the assigned kit locker
 * (rackets + balls) and the court gate, from exactly 10 minutes before the session until
 * 10 minutes after it ends.
 */
export function CardAccess({ customer }: { customer: Customer }) {
  const db = useStore((s) => s.db);
  const now = useNow(5_000);
  const celebrate = useFx((s) => s.celebrate);
  const toast = useFx((s) => s.toast);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, { ok: boolean; text: string }>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const keys: KeyRow[] = db.bookings
    .filter((b) => b.customerId === customer.id && b.status === "confirmed" && b.kind !== "maintenance")
    .map((b) => ({
      bookingId: b.id,
      passId: b.passId,
      court: db.courts.find((c) => c.id === b.courtId)?.short ?? "Court",
      locker: db.lockers.find((l) => l.id === b.lockerId)?.number,
      start: b.start,
      end: b.start + b.durationMin * 60_000,
      from: b.start - KEY_WINDOW_MIN * 60_000,
      to: b.start + (b.durationMin + KEY_WINDOW_MIN) * 60_000,
      rackets: kitFor(b).rackets,
    }))
    .filter((k) => k.to > now && k.start - now < 3 * 24 * 3_600_000)
    .sort((a, b) => a.start - b.start)
    .slice(0, 4);

  const open = (k: KeyRow, door: "locker" | "gate", demo: boolean) => {
    const id = `${k.bookingId}:${door}`;
    setBusy(id);
    timer.current = setTimeout(() => {
      const key = ensureCourtPass(k.bookingId);
      if (!key.ok) {
        setBusy(null);
        return toast({ tone: "error", title: key.error });
      }
      const res = unlockDoor(key.value, "Card", { door, demoAt: demo ? k.from + 60_000 : undefined });
      setBusy(null);
      if (!res.ok) return toast({ tone: "error", title: res.error });
      const text = res.value.granted ? `${res.value.door} open` : res.value.reason ?? "Refused";
      setResult((r) => ({ ...r, [id]: { ok: res.value.granted, text } }));
      if (res.value.granted) celebrate(res.reward);
      else toast({ tone: "warning", title: `${res.value.door}: ${text}`, body: "Keys work from 10 minutes before until 10 minutes after your session." });
      setTimeout(() => setResult((r) => { const c = { ...r }; delete c[id]; return c; }), 3800);
    }, 1000);
  };

  const tier = tierFor(customer.loyalty.lifetime);
  const next = nextTier(customer.loyalty.lifetime);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="label-caps text-white/55">Your digital keys</p>
        <span className="text-[10.5px] text-white/40">Active 10 min before → 10 min after</span>
      </div>
      {keys.length === 0 && (
        <p className="rounded-2xl bg-white/5 p-3.5 text-[12.5px] text-white/60">
          No upcoming sessions. Book and pay for a court and a key appears here: it opens your kit locker (rackets + balls) and the court gate 10 minutes before you play.
        </p>
      )}
      {keys.map((k) => {
        const live = now >= k.from && now <= k.to;
        const pct = Math.min(100, Math.max(0, ((now - k.from) / (k.to - k.from)) * 100));
        return (
          <div key={k.bookingId} className={clsx("rounded-[22px] p-3.5", live ? "bg-[#3fd6c8]/12 ring-1 ring-[#3fd6c8]/40" : "bg-white/5")}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className={clsx("flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl", live ? "bg-[#3fd6c8] text-ink" : "bg-white/10 text-white/70")}>
                  <KeyRound size={18} />
                </span>
                <span>
                  <span className="block text-[13.5px] font-semibold text-white">{k.locker ? `Locker ${k.locker}` : "Kit locker"} · {k.court}</span>
                  <span className="block text-[11.5px] text-white/60">{fmtDayLabel(k.start, now)} {fmtTime(k.start)}–{fmtTime(k.end)} · {k.rackets} rackets + balls</span>
                </span>
              </div>
              <span className={clsx("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", live ? "bg-[#3fd6c8] text-ink" : "bg-white/10 text-white/70")}>
                {live ? "Active" : `in ${countdown(k.from - now)}`}
              </span>
            </div>
            <div className="mt-3">
              <div className="flex justify-between font-mono text-[10.5px] text-white/50">
                <span>{fmtTime(k.from)}</span>
                <span>{live ? `expires in ${countdown(k.to - now)}` : `key activates ${fmtDayLabel(k.from, now) === "Today" ? "" : fmtDayLabel(k.from, now).toLowerCase() + " "}at ${fmtTime(k.from)}`}</span>
                <span>{fmtTime(k.to)}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-[#3fd6c8] transition-all" style={{ width: `${live ? pct : 0}%` }} />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(["locker", "gate"] as const).map((door) => {
                const id = `${k.bookingId}:${door}`;
                const r = result[id];
                return (
                  <button
                    key={door}
                    onClick={() => open(k, door, false)}
                    disabled={busy === id}
                    className={clsx(
                      "flex h-10 items-center justify-center gap-1.5 rounded-full text-[12px] font-semibold transition",
                      r ? (r.ok ? "bg-teal text-white" : "bg-danger/90 text-white") : live ? "bg-white text-ink hover:bg-[#3fd6c8]" : "bg-white/10 text-white/70 hover:bg-white/15",
                    )}
                  >
                    {busy === id ? <Loader2 size={13} className="animate-spin" /> : r ? (r.ok ? <Check size={13} /> : <X size={13} />) : <Nfc size={13} />}
                    {busy === id ? "Reading card…" : r ? r.text : door === "locker" ? "Open locker" : `Open ${k.court} gate`}
                  </button>
                );
              })}
            </div>
            {!live && (
              <button onClick={() => open(k, "locker", true)} className="mt-2 w-full text-center text-[10.5px] font-medium text-gold hover:underline">
                Demo: simulate arriving at {fmtTime(k.from + 60_000)} and open the locker
              </button>
            )}
          </div>
        );
      })}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button onClick={() => toast({ tone: "success", title: "Added to Apple Wallet", body: "Demo: your Padel Bay Club card is in Wallet" })} className="flex h-10 items-center justify-center gap-1.5 rounded-full bg-black text-[12px] font-semibold text-white ring-1 ring-white/15 hover:bg-white/10">
          <Wallet size={14} /> Add to Apple Wallet
        </button>
        <button onClick={() => toast({ tone: "success", title: "Saved to Google Wallet", body: "Demo: your Padel Bay Club card is saved" })} className="flex h-10 items-center justify-center gap-1.5 rounded-full bg-white/10 text-[12px] font-semibold text-white ring-1 ring-white/15 hover:bg-white/15">
          <Wallet size={14} /> Google Wallet
        </button>
      </div>
      <p className="pt-1 text-center text-[10.5px] text-white/40">
        {tier.name} card{next ? ` · ${next.min - customer.loyalty.lifetime} points to ${next.name}` : " · top level"} · lockers and doors are simulated until hardware is selected
      </p>
    </div>
  );
}
