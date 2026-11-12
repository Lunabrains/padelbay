"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BedDouble, Check, Minus, Plus, ScanFace, Sparkles, Star, Users } from "lucide-react";
import { POSES } from "@/components/three/rig";
import { Button, Field, JoinCard, Label, SimBadge, Tabs, Toggle, ZonePanel, useZone } from "@/components/ui/kit";
import { CardAccess, MemberCard } from "./MemberCard";
import { bookStay, checkInStay, checkOutStay, registerGuests, unitAvailable } from "@/lib/actions";
import { stayPackageFor } from "@/lib/ai";
import { useFx } from "@/lib/fx";
import { useCustomer, useNow } from "@/lib/hooks";
import { onPick } from "@/lib/stage";
import { useStore } from "@/lib/store";
import type { Stay as StayT, Unit } from "@/lib/types";
import { DAY, addDays, atHour, fmtDate, fmtDayLabel, startOfDay } from "@/lib/time";

type Tab = "explore" | "mine";

const TYPE_INFO: Record<Unit["type"], { emoji: string; blurb: string }> = {
  "sea-pod": { emoji: "🌊", blurb: "A rounded pod on stilts above the sand, a sunset deck facing the Mediterranean." },
  loft: { emoji: "🎾", blurb: "Two levels next to the hall with a recovery corner and a view of Court 1." },
  villa: { emoji: "🌴", blurb: "Two bedrooms, a plunge pool on the sand and a private chef on request." },
};

export default function Stay() {
  const db = useStore((s) => s.db);
  const customer = useCustomer();
  const now = useNow(10_000);
  const celebrate = useFx((s) => s.celebrate);
  const toast = useFx((s) => s.toast);
  const [tab, setTab] = useState<Tab>("explore");
  const [unitId, setUnitId] = useState("sp2");
  const [arrival, setArrival] = useState(() => addDays(startOfDay(), 1));
  const [nights, setNights] = useState(2);
  const [guests, setGuests] = useState(2);
  const [packageId, setPackageId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const u = q.get("unit");
    const p = q.get("package");
    if (u && db.units.some((x) => x.id === u)) setUnitId(u);
    if (p) {
      const pk = db.packages.find((x) => x.id === p);
      if (pk) {
        setPackageId(pk.id);
        setNights(pk.nights);
        const unit = db.units.find((x) => x.type === pk.unitType);
        if (unit) setUnitId(unit.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () =>
      onPick((kind, id) => {
        if (kind !== "suite") return false;
        setUnitId(id);
        setTab("explore");
        return true;
      }),
    [],
  );

  useZone("suites", POSES[unitId] ?? POSES.suites, unitId);

  // when a suite is picked, jump to its first free arrival date
  useEffect(() => {
    const d0 = useStore.getState().db;
    if (unitAvailable(d0, unitId, atHour(arrival, 15), atHour(addDays(arrival, nights), 11))) return;
    for (let i = 0; i < 21; i++) {
      const d = addDays(startOfDay(), i);
      if (unitAvailable(d0, unitId, atHour(d, 15), atHour(addDays(d, nights), 11))) {
        setArrival(d);
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId]);

  const unit = db.units.find((u) => u.id === unitId)!;
  const myStays = customer ? db.stays.filter((s) => s.customerId === customer.id && s.status !== "cancelled").sort((a, b) => b.createdAt - a.createdAt) : [];
  const current = myStays.find((s) => s.status === "checked-in") ?? myStays.find((s) => s.status === "reserved") ?? myStays[0];
  const rec = useMemo(() => stayPackageFor(db, customer), [db, customer]);
  const pkg = db.packages.find((p) => p.id === packageId);
  const checkIn = atHour(arrival, 15);
  const checkOut = atHour(addDays(arrival, nights), 11);
  const available = unitAvailable(db, unit.id, checkIn, checkOut);
  const total = pkg && pkg.unitType === unit.type ? pkg.price : unit.nightly * nights;

  const reserve = () => {
    if (!customer) return;
    setBusy(true);
    setTimeout(() => {
      const res = bookStay({ customerId: customer.id, unitId, arrivalDay: arrival, nights, guests, packageId: pkg && pkg.unitType === unit.type ? pkg.id : undefined, method: "Apple Pay" });
      setBusy(false);
      if (!res.ok) return toast({ tone: "error", title: res.error });
      celebrate(res.reward);
      toast({ tone: "success", title: `${unit.name} reserved`, body: "Complete digital check-in from My stay" });
      setTab("mine");
    }, 1000);
  };

  return (
    <ZonePanel
      kicker="Bay Suites · future experience"
      title={tab === "mine" ? "your stay." : <>stay &amp;<br />play.</>}
      tabs={<Tabs value={tab} onChange={setTab} items={[{ id: "explore", label: "Explore" }, { id: "mine", label: "My stay", badge: current ? 1 : 0 }]} />}
      footer={
        tab === "explore" && customer ? (
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <p className="text-[11px] text-white/55">{nights} night{nights > 1 ? "s" : ""} · {unit.name}{pkg && pkg.unitType === unit.type ? ` · ${pkg.name}` : ""}</p>
              <p className="text-[20px] font-semibold tabular text-white">${total.toFixed(0)}</p>
            </div>
            <Button variant="sage" className="px-6" disabled={!available || guests > unit.capacity} loading={busy} onClick={reserve}>
              {available ? "Reserve" : "Unavailable"}
            </Button>
          </div>
        ) : undefined
      }
    >
      {tab === "explore" ? (
        <div className="space-y-5">
          <div className="rounded-2xl border border-gold/30 bg-gold/10 p-3 text-[11.5px] leading-relaxed text-gold">
            <span className="font-semibold">Concept preview.</span> Bay Suites are a planned addition to Padel Bay. Reservations here are simulated to show the guest journey.
          </div>
          <button
            onClick={() => {
              setPackageId(rec.pkg.id);
              setNights(rec.pkg.nights);
              const u = db.units.find((x) => x.type === rec.pkg.unitType);
              if (u) setUnitId(u.id);
            }}
            className={clsx("w-full rounded-[24px] bg-gradient-to-br from-sunset/80 to-ember/70 p-4 text-left text-white ring-1 ring-white/10 transition hover:brightness-110", packageId === rec.pkg.id && "ring-2 ring-white/70")}
          >
            <span className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-white/90"><Sparkles size={12} /> Picked for you</span>
              <SimBadge />
            </span>
            <span className="mt-1.5 block font-display text-[22px] font-bold lowercase leading-none">{rec.pkg.name}</span>
            <span className="mt-1 block text-[12px] text-white/85">{rec.reason}</span>
            <span className="mt-2 flex flex-wrap gap-1">
              {rec.pkg.perks.map((p) => <span key={p} className="rounded-full bg-white/20 px-2 py-0.5 text-[10.5px]">{p}</span>)}
            </span>
            <span className="mt-2 block text-[15px] font-semibold tabular">${rec.pkg.price}</span>
          </button>

          <div>
            <Label>Choose your suite</Label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {db.units.map((u) => {
                const free = unitAvailable(db, u.id, checkIn, checkOut);
                return (
                  <button key={u.id} onClick={() => setUnitId(u.id)} className={clsx("rounded-[20px] border p-3 text-left transition", u.id === unitId ? "border-sage bg-sage/15" : "border-white/10 bg-white/5 hover:bg-white/10")}>
                    <span className="flex items-center justify-between">
                      <span className="text-[20px]">{TYPE_INFO[u.type].emoji}</span>
                      <span className={clsx("text-[10px] font-semibold uppercase tracking-wider", free ? "text-sage" : "text-white/40")}>{free ? "Free" : "Booked"}</span>
                    </span>
                    <span className="mt-1 block text-[13px] font-semibold text-white">{u.name}</span>
                    <span className="block text-[11px] text-white/55">Sleeps {u.capacity} · ${u.nightly}/night</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-[22px] bg-white/5 p-4">
            <p className="text-[15px] font-semibold text-white">{unit.name}</p>
            <p className="mt-1 text-[12px] leading-relaxed text-white/65">{TYPE_INFO[unit.type].blurb} {unit.view}. {unit.sqm} m².</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {unit.features.map((f) => <span key={f} className="rounded-full bg-white/8 px-2 py-0.5 text-[10.5px] text-white/75">{f}</span>)}
            </div>
          </div>

          <div>
            <Label>Arrival</Label>
            <div className="no-scrollbar -mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {Array.from({ length: 21 }, (_, i) => addDays(startOfDay(now), i)).map((d) => {
                const free = unitAvailable(db, unit.id, atHour(d, 15), atHour(addDays(d, nights), 11));
                return (
                  <button key={d} onClick={() => setArrival(d)} className={clsx("flex w-[54px] shrink-0 flex-col items-center rounded-2xl py-2 transition", d === arrival ? "bg-white text-ink" : free ? "bg-white/6 text-white hover:bg-white/12" : "bg-white/[0.02] text-white/30")}>
                    <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{fmtDate(d).slice(0, 3)}</span>
                    <span className={clsx("text-[17px] font-semibold tabular", !free && d !== arrival && "line-through")}>{new Date(d).getDate()}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Stepper label="Nights" value={nights} min={1} max={7} onChange={setNights} />
            <Stepper label="Guests" value={guests} min={1} max={unit.capacity} onChange={setGuests} />
          </div>
          <p className="text-[12px] text-white/60">
            {fmtDayLabel(checkIn, now)} 15:00 → {fmtDate(checkOut)} 11:00 · {available ? <span className="text-sage">available</span> : <span className="text-danger">taken on these nights</span>}
          </p>
          {!customer && <JoinCard reason="to reserve" />}
        </div>
      ) : (
        <MyStay stay={current} now={now} />
      )}
    </ZonePanel>
  );
}

function MemberCardFor({ customerId }: { customerId: string }) {
  const c = useStore((s) => s.db.customers.find((x) => x.id === customerId));
  if (!c) return null;
  return (
    <>
      <MemberCard customer={c} compact />
      <CardAccess customer={c} />
    </>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-white/6 px-3 py-2.5">
      <span className="text-[12.5px] text-white/70">{label}</span>
      <span className="flex items-center gap-2">
        <button onClick={() => onChange(Math.max(min, value - 1))} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white" aria-label={`Fewer ${label}`}><Minus size={13} /></button>
        <span className="w-4 text-center text-[14px] font-semibold tabular text-white">{value}</span>
        <button onClick={() => onChange(Math.min(max, value + 1))} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white" aria-label={`More ${label}`}><Plus size={13} /></button>
      </span>
    </div>
  );
}

function MyStay({ stay, now }: { stay?: StayT; now: number }) {
  const db = useStore((s) => s.db);
  const celebrate = useFx((s) => s.celebrate);
  const toast = useFx((s) => s.toast);
  const [extra, setExtra] = useState<string[]>([""]);
  const [arrivalTime, setArrivalTime] = useState("16:00");
  const [idVerified, setIdVerified] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [rules, setRules] = useState(false);
  const [rating, setRating] = useState(5);
  const [busy, setBusy] = useState(false);
  if (!stay) return <p className="rounded-2xl bg-white/5 p-4 text-[13px] text-white/60">No stay yet. Reserve a Sea Pod and your digital check-in will live here.</p>;
  const unit = db.units.find((u) => u.id === stay.unitId)!;
  const pass = stay.keyPassId ? db.passes.find((p) => p.id === stay.keyPassId) : undefined;
  const steps = [
    { id: "reserved", label: "Reserved", done: true },
    { id: "registered", label: "Registered", done: !!stay.registration },
    { id: "in", label: "Checked in", done: stay.status === "checked-in" || stay.status === "checked-out" },
    { id: "out", label: "Checked out", done: stay.status === "checked-out" },
  ];
  const folioTotal = stay.folio.reduce((s, f) => s + f.amount, 0);
  return (
    <div className="space-y-4">
      <div className="rounded-[24px] bg-white/6 p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[16px] font-semibold text-white">{unit.name}</p>
            <p className="text-[12px] text-white/60">{fmtDate(stay.checkIn)} 15:00 → {fmtDate(stay.checkOut)} 11:00 · {Math.round((stay.checkOut - stay.checkIn) / DAY + 0.2)} nights</p>
          </div>
          <BedDouble className="text-sage" size={20} />
        </div>
        <div className="mt-4 flex items-center">
          {steps.map((s, i) => (
            <div key={s.id} className="flex flex-1 items-center">
              <span className={clsx("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold", s.done ? "bg-sage text-ink" : "bg-white/10 text-white/50")}>{s.done ? <Check size={13} /> : i + 1}</span>
              {i < steps.length - 1 && <span className={clsx("mx-1 h-0.5 flex-1 rounded-full", steps[i + 1].done ? "bg-sage" : "bg-white/10")} />}
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[9.5px] font-semibold uppercase tracking-wider text-white/50">
          {steps.map((s) => <span key={s.id}>{s.label}</span>)}
        </div>
      </div>

      {stay.status === "reserved" && !stay.registration && (
        <div className="space-y-3 rounded-[24px] border border-white/10 p-4">
          <p className="text-[15px] font-semibold text-white">Guest registration</p>
          <p className="text-[12px] text-white/60">Lead guest: {stay.guests[0]?.name}. Add everyone staying with you.</p>
          {extra.map((g, i) => (
            <Field key={i} label={`Guest ${i + 2}`} value={g} onChange={(v) => setExtra((e) => e.map((x, j) => (j === i ? v : x)))} placeholder="Full name" />
          ))}
          {extra.length < unit.capacity - 1 && (
            <button onClick={() => setExtra((e) => [...e, ""])} className="flex items-center gap-1.5 text-[12px] font-medium text-sage"><Users size={13} /> Add a guest</button>
          )}
          <div>
            <Label>Arrival time</Label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {["15:00", "16:00", "18:00", "20:00", "22:00"].map((t) => (
                <button key={t} onClick={() => setArrivalTime(t)} className={clsx("rounded-full px-3 py-1.5 text-[12px] font-medium", arrivalTime === t ? "bg-white text-ink" : "bg-white/8 text-white/75")}>{t}</button>
              ))}
            </div>
          </div>
          <button
            onClick={() => {
              setScanning(true);
              setTimeout(() => {
                setScanning(false);
                setIdVerified(true);
              }, 1600);
            }}
            disabled={idVerified || scanning}
            className={clsx("flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition", idVerified ? "bg-sage/15 ring-1 ring-sage/40" : "bg-white/6 hover:bg-white/10")}
          >
            <ScanFace size={20} className={idVerified ? "text-sage" : scanning ? "animate-pulse text-gold" : "text-white/70"} />
            <span className="flex-1">
              <span className="block text-[13px] font-semibold text-white">{idVerified ? "ID verified" : scanning ? "Scanning ID and matching selfie…" : "Verify lead guest ID"}</span>
              <span className="block text-[11px] text-white/50">Simulated verification · no document is stored in this demo</span>
            </span>
            {idVerified && <Check size={16} className="text-sage" />}
          </button>
          <Toggle checked={rules} onChange={setRules} label="I accept the house rules" hint="Quiet hours 23:00–07:00 · no glass on courts" />
          <Button
            variant="sage"
            className="w-full"
            disabled={!idVerified || !rules}
            onClick={() => {
              const res = registerGuests(stay.id, { guests: extra.map((name) => ({ name, adult: true })), arrivalTime, idVerified, rulesAccepted: rules });
              if (!res.ok) return toast({ tone: "error", title: res.error });
              toast({ tone: "success", title: "Registration complete", body: "Digital check-in is unlocked" });
            }}
          >
            Complete registration
          </Button>
        </div>
      )}

      {stay.status === "reserved" && stay.registration && (
        <div className="space-y-3 rounded-[24px] border border-sage/30 bg-sage/10 p-4">
          <p className="text-[15px] font-semibold text-white">Ready for digital check-in</p>
          <p className="text-[12px] text-white/65">Skip the desk. Your smart key is issued to this phone and opens {unit.name} from 15:00.</p>
          <Button
            variant="sage"
            className="w-full"
            loading={busy}
            onClick={() => {
              setBusy(true);
              setTimeout(() => {
                setBusy(false);
                const res = checkInStay(stay.id);
                if (!res.ok) return toast({ tone: "error", title: res.error });
                celebrate(res.reward);
                toast({ tone: "success", title: `Welcome to ${unit.name}`, body: "Your smart key is live" });
              }, 1200);
            }}
          >
            Check in now
          </Button>
          <p className="text-[10.5px] text-white/45">Demo: check-in is open early so the journey can be shown end to end.</p>
        </div>
      )}

      {pass && pass.status === "active" && (
        <div className="space-y-3">
          <p className="flex items-center gap-2 rounded-2xl bg-white/6 px-3.5 py-2.5 text-[12.5px] text-white/80">
            <span className="h-2 w-2 rounded-full bg-sage" /> Your Padel Bay Club card is now the key to <span className="font-semibold text-white">{unit.name}</span>.
          </p>
          <MemberCardFor customerId={stay.customerId} />
        </div>
      )}

      {stay.status === "checked-in" && (
        <>
          <Link href="/cafe" className="flex items-center justify-between rounded-[22px] bg-gradient-to-r from-timber to-sunset p-4 text-white">
            <span>
              <span className="block text-[14px] font-semibold">Breakfast to {unit.name}</span>
              <span className="block text-[11.5px] text-white/80">Charge it to your suite</span>
            </span>
            <span className="text-2xl">🥐</span>
          </Link>
          <div className="rounded-[22px] bg-white/5 p-4">
            <Label>Folio</Label>
            <div className="mt-2 space-y-1 text-[12.5px] text-white/75">
              {stay.folio.map((f, i) => (
                <div key={i} className="flex justify-between"><span>{f.label}</span><span className="tabular">${f.amount.toFixed(2)}</span></div>
              ))}
              <div className="flex justify-between border-t border-white/10 pt-1.5 font-semibold text-white"><span>Total</span><span className="tabular">${folioTotal.toFixed(2)}</span></div>
            </div>
            <div className="mt-4">
              <Label>How was your stay?</Label>
              <div className="mt-1.5 flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} onClick={() => setRating(n)} aria-label={`${n} stars`}><Star size={22} className={n <= rating ? "fill-gold text-gold" : "text-white/25"} /></button>
                ))}
              </div>
            </div>
            <Button
              variant="primary"
              className="mt-4 w-full"
              onClick={() => {
                const res = checkOutStay(stay.id, rating);
                if (!res.ok) return toast({ tone: "error", title: res.error });
                toast({ tone: "success", title: "Checked out. See you on court soon", body: "Key returned · housekeeping notified" });
              }}
            >
              Check out & return key
            </Button>
          </div>
        </>
      )}
      {stay.status === "checked-out" && (
        <p className="rounded-2xl bg-white/5 p-4 text-[13px] text-white/65">Checked out {fmtDate(stay.checkedOutAt ?? now)}. You rated it {stay.rating}/5. Thank you!</p>
      )}
    </div>
  );
}
