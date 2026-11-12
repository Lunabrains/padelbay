"use client";

import clsx from "clsx";
import { QRCodeSVG } from "qrcode.react";
import { useRef, useState } from "react";
import { BedDouble, Check, Loader2, Nfc, RotateCcw, Square, Wallet, X } from "lucide-react";
import { LogoDuoLight } from "@/components/brand/Logo";
import { ensureCourtPass, unlockDoor } from "@/lib/actions";
import { memberNumber, nextTier, tierFor } from "@/lib/catalog";
import { useFx } from "@/lib/fx";
import { useNow } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import type { AccessPass, Customer } from "@/lib/types";
import { fmtDate, fmtDayLabel, fmtTime } from "@/lib/time";

// The Padel Bay Club card: membership ID, loyalty level and the key to every door the member
// has booked. One credential: it opens the court gate during a booking and the Bay Suite
// door after check-in. Door hardware is simulated until it is selected.

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
            <span className="mt-1 block text-[11px] leading-snug text-ink/60">Opens your booked court and your Bay Suite. Show it at Sip to earn double points.</span>
          </span>
        </span>
      </button>
      <p className="mt-2 flex items-center justify-center gap-1.5 text-[10.5px] text-white/45"><RotateCcw size={11} /> Tap the card to flip it</p>
    </div>
  );
}

function doorState(p: AccessPass, now: number) {
  if (now < p.validFrom) return { label: `Opens ${fmtDayLabel(p.validFrom, now) === "Today" ? "" : fmtDayLabel(p.validFrom, now) + " "}${fmtTime(p.validFrom)}`, live: false };
  return { label: p.kind === "suite" ? `Open until ${fmtDate(p.validTo)} ${fmtTime(p.validTo)}` : `Open now · until ${fmtTime(p.validTo)}`, live: true };
}

/** The doors this member's card opens right now or later today, with tap-to-open. */
export function CardAccess({ customer }: { customer: Customer }) {
  const passes = useStore((s) => s.db.passes);
  const bookings = useStore((s) => s.db.bookings);
  const courts = useStore((s) => s.db.courts);
  const now = useNow(15_000);
  const celebrate = useFx((s) => s.celebrate);
  const toast = useFx((s) => s.toast);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, "open" | "denied">>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Every confirmed court booking in the next two days and every active suite key.
  const issued = passes.filter((p) => p.holderId === customer.id && p.status === "active" && p.validTo > now);
  const pending: AccessPass[] = bookings
    .filter((b) => b.customerId === customer.id && b.status === "confirmed" && b.kind !== "maintenance" && !b.passId && b.start + b.durationMin * 60_000 > now && b.start - now < 48 * 3_600_000)
    .map((b) => {
      const court = courts.find((c) => c.id === b.courtId)!;
      return { id: `pending:${b.id}`, holderId: customer.id, kind: "court", refId: b.id, label: `${court.short} · ${fmtDate(b.start)} ${fmtTime(b.start)}–${fmtTime(b.start + b.durationMin * 60_000)}`, door: `${court.short} gate`, code: "", validFrom: b.start - 15 * 60_000, validTo: b.start + b.durationMin * 60_000, status: "active", issuedAt: now };
    });
  const doors = [...issued, ...pending].sort((a, b) => a.validFrom - b.validFrom).slice(0, 5);
  const tier = tierFor(customer.loyalty.lifetime);
  const next = nextTier(customer.loyalty.lifetime);

  const tap = (door: AccessPass) => {
    setBusy(door.id);
    timer.current = setTimeout(() => {
      const ensured = door.id.startsWith("pending:") ? ensureCourtPass(door.refId) : ({ ok: true, value: door.id } as const);
      if (!ensured.ok) {
        setBusy(null);
        return toast({ tone: "error", title: ensured.error });
      }
      const p = { ...door, id: ensured.value };
      const res = unlockDoor(p.id, "Card");
      setBusy(null);
      if (!res.ok) return toast({ tone: "error", title: res.error });
      setResult((r) => ({ ...r, [p.id]: res.value.granted ? "open" : "denied", [door.id]: res.value.granted ? "open" : "denied" }));
      if (res.value.granted) celebrate(res.reward);
      setTimeout(() => setResult((r) => { const c = { ...r }; delete c[p.id]; delete c[door.id]; return c; }), 3500);
    }, 1100);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="label-caps text-white/55">Your card opens</p>
        <span className="text-[10.5px] text-white/40">Simulated doors · no hardware yet</span>
      </div>
      {doors.length === 0 && (
        <p className="rounded-2xl bg-white/5 p-3.5 text-[12.5px] text-white/60">
          Nothing booked yet. Book a court or a Bay Suites stay and this card opens the gate or the door, no extra pass needed.
        </p>
      )}
      {doors.map((p) => {
        const st = doorState(p, now);
        const r = result[p.id];
        const Icon = p.kind === "suite" ? BedDouble : Square;
        return (
          <div key={p.id} className={clsx("flex items-center gap-3 rounded-2xl px-3.5 py-3", st.live ? "bg-sage/12 ring-1 ring-sage/30" : "bg-white/5")}>
            <span className={clsx("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", st.live ? "bg-sage text-ink" : "bg-white/10 text-white/70")}>
              <Icon size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-white">{p.door}</span>
              <span className="block truncate text-[11px] text-white/55">{p.label.split(" · ").slice(1).join(" · ") || p.label} · {st.label}</span>
            </span>
            <button
              onClick={() => tap(p)}
              disabled={busy === p.id}
              className={clsx(
                "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[11.5px] font-semibold transition",
                r === "open" ? "bg-teal text-white" : r === "denied" ? "bg-danger text-white" : "bg-white text-ink hover:bg-sage",
              )}
            >
              {busy === p.id ? <Loader2 size={13} className="animate-spin" /> : r === "open" ? <Check size={13} /> : r === "denied" ? <X size={13} /> : <Nfc size={13} />}
              {busy === p.id ? "Reading card…" : r === "open" ? "Door open" : r === "denied" ? "Refused" : "Tap card"}
            </button>
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
        {tier.name} card{next ? ` · ${next.min - customer.loyalty.lifetime} points to upgrade to ${next.name}` : " · top level"} · reads in about a second at the gate
      </p>
    </div>
  );
}
