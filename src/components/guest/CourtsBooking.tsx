"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Apple, Check, Clock, CreditCard, Minus, Plus, Repeat, Share2, Sparkles, Sun, UserPlus, Users, Wallet, X } from "lucide-react";
import { POSES } from "@/components/three/rig";
import { courtLive } from "@/components/three/Stage";
import { Avatar, Button, Field, JoinCard, Label, Segmented, SimBadge, Toggle, ZonePanel, useZone } from "@/components/ui/kit";
import { CardAccess, MemberCard } from "./MemberCard";
import { bookCourt, holdSlot, joinWaitlist, refundFor, releaseHold, slotConflict } from "@/lib/actions";
import { matchmaking, recommendSlots } from "@/lib/ai";
import { CANCELLATION, DURATIONS, skillLabel, tierFor } from "@/lib/catalog";
import { daySlots } from "@/lib/engine/availability";
import { quote } from "@/lib/engine/pricing";
import { useFx } from "@/lib/fx";
import { useCustomer, useNow } from "@/lib/hooks";
import { onPick } from "@/lib/stage";
import { useStore } from "@/lib/store";
import type { InvitedPlayer } from "@/lib/types";
import { HOUR, MIN, addDays, fmtDate, fmtDayLabel, fmtRange, fmtTime, startOfDay } from "@/lib/time";

type Step = "pick" | "players" | "review" | "done";

function ownerKey() {
  try {
    let k = sessionStorage.getItem("pb-owner");
    if (!k) {
      k = Math.random().toString(36).slice(2);
      sessionStorage.setItem("pb-owner", k);
    }
    return k;
  } catch {
    return "tab";
  }
}

export default function CourtsBooking() {
  const db = useStore((s) => s.db);
  const customer = useCustomer();
  const now = useNow(15_000);
  const toast = useFx((s) => s.toast);
  const celebrate = useFx((s) => s.celebrate);

  const [courtId, setCourtId] = useState("c3");
  const [day, setDay] = useState(() => startOfDay());
  const [duration, setDuration] = useState<number>(90);
  const [start, setStart] = useState<number | null>(null);
  const [step, setStep] = useState<Step>("pick");
  const [players, setPlayers] = useState<InvitedPlayer[]>([]);
  const [split, setSplit] = useState(true);
  const [openMatch, setOpenMatch] = useState(false);
  const [weeks, setWeeks] = useState(1);
  const [method, setMethod] = useState("Apple Pay");
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [holdUntil, setHoldUntil] = useState<number | null>(null);
  const [result, setResult] = useState<{ bookingId: string; passId: string } | null>(null);
  const [inviteName, setInviteName] = useState("");
  const [invitePhone, setInvitePhone] = useState("");
  const key = useRef("");

  // deep links: /courts?court=c3&t=…
  useEffect(() => {
    key.current = ownerKey();
    const q = new URLSearchParams(window.location.search);
    const c = q.get("court");
    const t = Number(q.get("t"));
    if (c && db.courts.some((x) => x.id === c)) setCourtId(c);
    if (t) {
      setDay(startOfDay(t));
      setStart(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // clicking a court in 3D picks it here instead of navigating
  useEffect(
    () =>
      onPick((kind, id) => {
        if (kind !== "court" || step === "done") return false;
        setCourtId(id);
        setStart(null);
        setStep("pick");
        return true;
      }),
    [step],
  );

  useZone(step === "pick" && !start ? "courts" : "court", step === "pick" && !start ? POSES.courts : POSES[courtId], courtId);

  useEffect(() => () => releaseHold(key.current), []);

  const tier = customer ? tierFor(customer.loyalty.lifetime) : null;
  const days = useMemo(() => Array.from({ length: (tier?.bookAheadDays ?? 7) + 1 }, (_, i) => addDays(startOfDay(now), i)), [now, tier]);
  const court = db.courts.find((c) => c.id === courtId)!;
  const live = courtLive(db, courtId, now);
  const slots = useMemo(() => daySlots(db, courtId, day, duration, now, customer, key.current).filter((s) => s.status !== "past"), [db, courtId, day, duration, now, customer]);
  const recs = useMemo(() => recommendSlots(db, customer, now), [db, customer, now]);
  const squad = useMemo(() => matchmaking(db, customer, 5), [db, customer]);
  const q = start ? quote(court, start, duration, { customer, promos: db.promos, now }) : null;
  const total = q ? Math.round(q.price * weeks * 100) / 100 : 0;
  const share = split ? Math.round((total / Math.max(1, players.length + 1)) * 100) / 100 : total;
  const occurrences = useMemo(
    () => (start ? Array.from({ length: weeks }, (_, i) => addDays(start, i * 7)).map((t) => ({ t, conflict: slotConflict(db, courtId, t, duration, key.current) })) : []),
    [start, weeks, db, courtId, duration],
  );
  const refund = start && q ? refundFor({ start, price: q.price } as never, now, tier?.freeCancelHours) : null;

  const goReview = () => {
    if (!start) return;
    const res = holdSlot(courtId, start, duration, key.current);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    setHoldUntil(Date.now() + 5 * MIN);
    setStep("review");
  };

  const confirm = () => {
    if (!customer || !start) return;
    setPaying(true);
    setError(null);
    setTimeout(() => {
      const res = bookCourt({ customerId: customer.id, courtId, start, durationMin: duration, players, splitPayment: split, weeks, paymentMethod: method, openMatch, source: "app", ownerKey: key.current });
      setPaying(false);
      if (!res.ok) {
        setError(res.error);
        setStep("pick");
        setStart(null);
        return;
      }
      setResult({ bookingId: res.value.bookings[0].id, passId: res.value.passId });
      setStep("done");
      celebrate(res.reward);
    }, 1200);
  };

  const pass = result ? db.passes.find((p) => p.id === result.passId) : undefined;

  // ---- step: done -------------------------------------------------------------
  if (step === "done" && result && start) {
    return (
      <ZonePanel kicker="Booking confirmed" title={<>you&apos;re on<br />{court.short.toLowerCase()}.</>}>
        <div className="animate-rise space-y-4">
          <div className="flex items-center gap-3 rounded-2xl bg-sage/15 p-3 ring-1 ring-sage/30">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sage text-ink"><Check size={20} strokeWidth={3} /></span>
            <div className="text-[13px] text-white">
              <p className="font-semibold">{fmtDayLabel(start, now)} · {fmtRange(start, duration)}{weeks > 1 ? ` · weekly ×${weeks}` : ""}</p>
              <p className="text-white/65">Paid ${total.toFixed(2)} with {method}{split && players.length ? ` · players owe $${share.toFixed(2)} each` : ""}</p>
            </div>
          </div>
          {pass && customer && (
            <div className="space-y-3">
              <p className="flex items-center gap-2 rounded-2xl bg-white/6 px-3.5 py-2.5 text-[12.5px] text-white/80">
                <span className="h-2 w-2 rounded-full bg-sage" /> Your digital key opens <span className="font-semibold text-white">{pass.door}</span> (rackets + balls) and the {court.short} gate from <span className="font-semibold text-white">{fmtTime(pass.validFrom)}</span> until {fmtTime(pass.validTo)}.
              </p>
              <MemberCard customer={customer} compact />
              <CardAccess customer={customer} />
            </div>
          )}
          <Link href={`/cafe?deliver=${result.bookingId}`} className="group flex items-center justify-between rounded-[24px] bg-gradient-to-r from-timber to-sunset p-4 text-white transition hover:brightness-110">
            <span>
              <span className="block text-[15px] font-semibold">Order Sip to {court.short}</span>
              <span className="block text-[12px] text-white/80">Waiting for you at the gate when you arrive</span>
            </span>
            <span className="text-3xl transition group-hover:rotate-12">☕</span>
          </Link>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="ghost"
              className="h-11 text-[13px]"
              onClick={async () => {
                const text = `Padel at Padel Bay · ${court.short} · ${fmtDate(start)} ${fmtRange(start, duration)}. Join me!`;
                try {
                  if (navigator.share) await navigator.share({ title: "Padel Bay", text });
                  else {
                    await navigator.clipboard.writeText(text);
                    toast({ tone: "success", title: "Invite copied", body: "Paste it in your WhatsApp group" });
                  }
                } catch {}
              }}
            >
              <Share2 size={15} /> Share
            </Button>
            <Link href="/me" className="flex h-11 items-center justify-center rounded-full border border-white/20 bg-white/5 text-[13px] font-semibold text-white transition hover:bg-white/12">
              My club card
            </Link>
          </div>
          <Button variant="ghost" className="w-full text-[13px]" onClick={() => { setStep("pick"); setStart(null); setResult(null); setPlayers([]); setWeeks(1); }}>
            Book another court
          </Button>
        </div>
      </ZonePanel>
    );
  }

  // ---- step: review & pay ---------------------------------------------------
  if (step === "review" && start && q) {
    const left = holdUntil ? Math.max(0, holdUntil - now) : 0;
    return (
      <ZonePanel
        kicker="Review & pay"
        title="almost there."
        onBack={() => { releaseHold(key.current); setStep("players"); }}
        footer={
          customer ? (
            <div>
              <Button variant="sage" className="w-full" loading={paying} onClick={confirm} disabled={occurrences.some((o) => o.conflict)}>
                {paying ? "Confirming payment…" : `Confirm & pay $${total.toFixed(2)}`}
              </Button>
              <p className="mt-2 text-center text-[10.5px] text-white/45">Nothing is charged until you confirm. Demo payment, no real card is used.</p>
            </div>
          ) : undefined
        }
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-2xl bg-white/6 px-4 py-2.5 text-[12px] text-white/70">
            <span className="flex items-center gap-1.5"><Clock size={13} className="text-gold" /> Slot held for you</span>
            <span className="font-mono tabular text-white">{Math.floor(left / 60000)}:{String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}</span>
          </div>
          <div className="rounded-[24px] bg-white/6 p-4">
            <p className="text-[17px] font-semibold text-white">{court.name}</p>
            <p className="mt-0.5 text-[13px] text-white/70">{fmtDate(start)} · {fmtRange(start, duration)} · {court.type === "indoor" ? "Indoor" : "Sea side"}</p>
            {players.length > 0 && (
              <div className="mt-3 flex items-center gap-2">
                <div className="flex -space-x-2">
                  {customer && <Avatar name={customer.name} hue={customer.hue} size={28} ring="#0a1d20" />}
                  {players.map((p) => <Avatar key={p.name} name={p.name} hue={(p.name.length * 47) % 360} size={28} ring="#0a1d20" />)}
                </div>
                <span className="text-[12px] text-white/65">{players.length + 1} players{openMatch ? " · open match" : ""}</span>
              </div>
            )}
            <div className="mt-4 space-y-1.5 border-t border-white/10 pt-3 text-[13px]">
              {q.breakdown.map((b) => (
                <div key={b.label} className="flex justify-between text-white/75">
                  <span>{b.label}</span>
                  <span className="tabular">{b.amount < 0 ? "−" : ""}${Math.abs(b.amount).toFixed(2)}</span>
                </div>
              ))}
              {weeks > 1 && <div className="flex justify-between text-white/75"><span>Weekly ×{weeks}</span><span className="tabular">×{weeks}</span></div>}
              <div className="flex justify-between pt-1 text-[15px] font-semibold text-white"><span>Total</span><span className="tabular">${total.toFixed(2)}</span></div>
              {split && players.length > 0 && <p className="text-[11.5px] text-sage">Split {players.length + 1} ways: invited players get a ${share.toFixed(2)} payment link each.</p>}
            </div>
          </div>
          {!customer && <JoinCard reason="to confirm" />}
          {customer && (
            <div>
              <Label>Pay with</Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {[
                  { id: "Apple Pay", icon: Apple, sub: "Demo wallet" },
                  { id: "Card •••• 4242", icon: CreditCard, sub: "Test card" },
                  { id: "Club credit", icon: Wallet, sub: `$${customer.credit.toFixed(2)} available`, disabled: customer.credit < total },
                  { id: "Pay at venue", icon: Sun, sub: "Front desk" },
                ].map((m) => (
                  <button
                    key={m.id}
                    disabled={m.disabled}
                    onClick={() => setMethod(m.id)}
                    className={clsx("flex items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left transition disabled:opacity-40", method === m.id ? "border-sage bg-sage/15" : "border-white/10 bg-white/5 hover:bg-white/10")}
                  >
                    <m.icon size={17} className="text-white/80" />
                    <span>
                      <span className="block text-[12.5px] font-semibold text-white">{m.id}</span>
                      <span className="block text-[10.5px] text-white/50">{m.sub}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="rounded-2xl border border-white/10 p-3.5 text-[11.5px] leading-relaxed text-white/60">
            <p className="font-semibold text-white/80">Cancellation · {refund?.label} if you cancel now</p>
            <p className="mt-1">{tier && tier.freeCancelHours < 24 ? `${tier.name} perk: free cancellation up to ${tier.freeCancelHours}h before play. ` : ""}{CANCELLATION.summary}</p>
          </div>
          {error && <p className="rounded-2xl bg-danger/15 p-3 text-[12.5px] text-danger">{error}</p>}
        </div>
      </ZonePanel>
    );
  }

  // ---- step: players & options ------------------------------------------------
  if (step === "players" && start && q) {
    const toggleSquad = (id: string, name: string) => {
      setPlayers((ps) => (ps.some((p) => p.customerId === id) ? ps.filter((p) => p.customerId !== id) : ps.length >= 3 ? ps : [...ps, { customerId: id, name, status: "pending" }]));
    };
    return (
      <ZonePanel
        kicker={`${court.short} · ${fmtDayLabel(start, now)} ${fmtTime(start)}`}
        title="who's playing?"
        onBack={() => setStep("pick")}
        footer={
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <p className="text-[11px] text-white/55">{weeks > 1 ? `${weeks} sessions` : "1 session"}{split && players.length ? " · your share" : ""}</p>
              <p className="text-[20px] font-semibold tabular text-white">${(split && players.length ? share : total).toFixed(2)}</p>
            </div>
            <Button variant="sage" className="px-7" onClick={goReview} disabled={occurrences.some((o) => o.conflict)}>Review</Button>
          </div>
        }
      >
        <div className="space-y-5">
          <div>
            <div className="flex items-center justify-between">
              <Label>Suggested for you</Label>
              <SimBadge>AI matchmaking · simulated</SimBadge>
            </div>
            {!customer && <p className="mt-2 text-[12px] text-white/55">Join to see players at your level. You can still invite friends below.</p>}
            <div className="mt-2 space-y-1.5">
              {squad.slice(0, 4).map((m) => {
                const on = players.some((p) => p.customerId === m.customer.id);
                return (
                  <button key={m.customer.id} onClick={() => toggleSquad(m.customer.id, m.customer.name)} className={clsx("flex w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left transition", on ? "border-sage bg-sage/12" : "border-white/8 bg-white/4 hover:bg-white/8")}>
                    <Avatar name={m.customer.name} hue={m.customer.hue} size={34} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold text-white">{m.customer.name}</span>
                      <span className="block truncate text-[11px] text-white/55">{m.customer.skill.rating.toFixed(1)} {skillLabel(m.customer.skill.rating)} · {m.reasons.slice(1, 3).join(" · ")}</span>
                    </span>
                    <span className="text-right">
                      <span className="block text-[13px] font-bold tabular text-sage">{m.score}%</span>
                      <span className="block text-[9.5px] uppercase tracking-wider text-white/40">fit</span>
                    </span>
                    <span className={clsx("flex h-7 w-7 items-center justify-center rounded-full", on ? "bg-sage text-ink" : "bg-white/10 text-white")}>{on ? <Check size={14} /> : <Plus size={14} />}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <Label>Invite by phone</Label>
            <div className="mt-2 flex gap-2">
              <div className="flex-1"><Field label="Name" value={inviteName} onChange={setInviteName} placeholder="Friend's name" /></div>
              <div className="flex-1"><Field label="Mobile" value={invitePhone} onChange={setInvitePhone} placeholder="+961 …" type="tel" /></div>
            </div>
            <Button
              variant="ghost"
              className="mt-2 h-10 w-full text-[12.5px]"
              disabled={!inviteName.trim() || players.length >= 3}
              onClick={() => {
                setPlayers((ps) => [...ps, { name: inviteName.trim(), phone: invitePhone.trim(), status: "pending" }]);
                toast({ tone: "info", title: `WhatsApp invite ready for ${inviteName.trim()}`, body: "Sent when you confirm the booking (simulated)" });
                setInviteName("");
                setInvitePhone("");
              }}
            >
              <UserPlus size={15} /> Add player ({players.length}/3)
            </Button>
            {players.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {players.map((p) => (
                  <span key={p.name} className="flex items-center gap-1.5 rounded-full bg-white/10 py-1 pl-1 pr-2 text-[12px] text-white">
                    <Avatar name={p.name} hue={(p.name.length * 47) % 360} size={22} /> {p.name.split(" ")[0]}
                    <button onClick={() => setPlayers((ps) => ps.filter((x) => x.name !== p.name))} aria-label={`Remove ${p.name}`}><X size={12} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Toggle checked={split} onChange={setSplit} label="Split the bill" hint="Everyone pays their share by link" />
            <Toggle checked={openMatch} onChange={setOpenMatch} label="Make it an open match" hint="Players at your level can request the empty spots" />
            <div className="rounded-2xl bg-white/6 px-4 py-3">
              <div className="flex items-center justify-between">
                <span>
                  <span className="flex items-center gap-1.5 text-[13.5px] font-medium text-white"><Repeat size={14} className="text-sage" /> Repeat weekly</span>
                  <span className="mt-0.5 block text-[11.5px] text-white/55">Same court, same time, every {fmtDate(start).split(" ")[0]}</span>
                </span>
                <span className="flex items-center gap-2">
                  <button onClick={() => setWeeks((w) => Math.max(1, w - 1))} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white" aria-label="Fewer weeks"><Minus size={14} /></button>
                  <span className="w-12 text-center text-[13px] font-semibold tabular text-white">{weeks === 1 ? "Once" : `${weeks} wks`}</span>
                  <button onClick={() => setWeeks((w) => Math.min(8, w + 1))} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white" aria-label="More weeks"><Plus size={14} /></button>
                </span>
              </div>
              {weeks > 1 && (
                <div className="mt-3 grid grid-cols-4 gap-1.5">
                  {occurrences.map((o) => (
                    <span key={o.t} className={clsx("rounded-xl px-2 py-1.5 text-center text-[10.5px]", o.conflict ? "bg-danger/20 text-danger" : "bg-sage/15 text-sage")} title={o.conflict ?? "Available"}>
                      {fmtDate(o.t).slice(4)} {o.conflict ? "✕" : "✓"}
                    </span>
                  ))}
                </div>
              )}
              {occurrences.some((o) => o.conflict) && <p className="mt-2 text-[11.5px] text-danger">One of the weeks is taken. Reduce the number of weeks or pick another time.</p>}
            </div>
          </div>
        </div>
      </ZonePanel>
    );
  }

  // ---- step: pick court & time -----------------------------------------------------
  return (
    <ZonePanel
      kicker="Courts · live availability"
      title={<>pick your<br />court.</>}
      footer={
        start && q ? (
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11.5px] text-white/60">{court.short} · {fmtDayLabel(start, now)} {fmtRange(start, duration)}</p>
              <p className="text-[20px] font-semibold tabular text-white">
                ${q.price.toFixed(2)} {q.listPrice !== q.price && <span className="ml-1 text-[13px] font-normal text-white/45 line-through">${q.listPrice.toFixed(2)}</span>}
              </p>
            </div>
            <Button variant="sage" className="px-7" onClick={() => setStep("players")}>Continue</Button>
          </div>
        ) : (
          <p className="text-center text-[12px] text-white/55">Tap a court in 3D or below, then choose a time</p>
        )
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-2">
          {db.courts.map((c) => {
            const l = courtLive(db, c.id, now);
            const on = c.id === courtId;
            return (
              <button
                key={c.id}
                onClick={() => { setCourtId(c.id); setStart(null); }}
                className={clsx("rounded-[20px] border p-3 text-left transition", on ? "border-sage bg-sage/15" : "border-white/10 bg-white/5 hover:bg-white/10")}
              >
                <span className="flex items-center justify-between">
                  <span className="text-[14px] font-semibold text-white">{c.short}</span>
                  <span className="h-2 w-2 rounded-full" style={{ background: l.state === "free" ? "#82be9d" : l.state === "play" ? "#f28a3b" : l.state === "maintenance" ? "#ef6b5b" : "#f6b26b" }} />
                </span>
                <span className="mt-0.5 block text-[11px] text-white/55">{c.type === "indoor" ? "The Hall · indoor" : "Sea side · outdoor"}</span>
                <span className="mt-1 block truncate text-[10.5px] text-white/45">{l.label}</span>
              </button>
            );
          })}
        </div>

        {recs.length > 0 && (
          <div>
            <div className="flex items-center justify-between">
              <Label>Picked for you</Label>
              <SimBadge>Personalised · simulated AI</SimBadge>
            </div>
            <div className="no-scrollbar -mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1">
              {recs.map((r) => (
                <button
                  key={`${r.courtId}-${r.start}`}
                  onClick={() => { setCourtId(r.courtId); setDay(startOfDay(r.start)); setDuration(r.durationMin); setStart(r.start); }}
                  className="w-[200px] shrink-0 rounded-[20px] bg-gradient-to-br from-teal/70 to-deep/70 p-3 text-left ring-1 ring-sage/25 transition hover:ring-sage/60"
                >
                  <span className="flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wider text-sage"><Sparkles size={11} /> {db.courts.find((c) => c.id === r.courtId)?.short}</span>
                  <span className="mt-1 block text-[15px] font-semibold text-white">{fmtDayLabel(r.start, now)} · {fmtTime(r.start)}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-white/65">{r.reason}</span>
                  <span className="mt-1.5 block text-[12px] font-semibold tabular text-white">${r.price.toFixed(2)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <Label>Day</Label>
          <div className="no-scrollbar -mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {days.map((d) => (
              <button
                key={d}
                onClick={() => { setDay(d); setStart(null); }}
                className={clsx("flex w-[58px] shrink-0 flex-col items-center rounded-2xl py-2 transition", d === day ? "bg-white text-ink" : "bg-white/6 text-white hover:bg-white/12")}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{fmtDayLabel(d, now) === "Today" ? "Today" : fmtDate(d).slice(0, 3)}</span>
                <span className="text-[18px] font-semibold tabular">{new Date(d).getDate()}</span>
              </button>
            ))}
          </div>
          {tier && <p className="mt-1.5 text-[10.5px] text-white/45">{tier.name} members can book {tier.bookAheadDays} days ahead</p>}
        </div>

        <div>
          <Label>Duration</Label>
          <div className="mt-2">
            <Segmented value={duration} onChange={(v) => { setDuration(v); setStart(null); }} items={DURATIONS.map((d) => ({ id: d, label: `${d} min` }))} />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label>Start time</Label>
            <span className="flex items-center gap-3 text-[10.5px] text-white/50">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-gold" /> offer</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-white/25" /> taken</span>
            </span>
          </div>
          {court.status === "maintenance" ? (
            <p className="mt-2 rounded-2xl bg-danger/15 p-3 text-[12.5px] text-danger">{court.short} is closed for maintenance. {court.maintenanceNote}</p>
          ) : (
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {slots.map((s) => {
                const sel = start === s.start;
                const taken = s.status !== "free";
                return (
                  <button
                    key={s.start}
                    onClick={() => {
                      if (!taken) return setStart(s.start);
                      if (s.status === "booked") {
                        if (!customer) return toast({ tone: "info", title: "Join to use the waitlist", body: "Create your profile first, then tap the slot again" });
                        const res = joinWaitlist(customer.id, courtId, s.start, duration);
                        toast(res.ok ? { tone: "success", title: "You're on the waitlist", body: `We'll offer you ${court.short} ${fmtTime(s.start)} the moment it frees up` } : { tone: "info", title: res.error });
                      }
                    }}
                    className={clsx(
                      "relative rounded-2xl px-1 py-2 text-center transition",
                      sel ? "bg-sage text-ink" : taken ? "bg-white/[0.03] text-white/30" : "bg-white/8 text-white hover:bg-white/16",
                    )}
                    title={taken ? (s.status === "booked" ? "Booked · tap to join the waitlist" : s.status === "held" ? "Someone is checking out" : "Unavailable") : undefined}
                  >
                    <span className={clsx("block text-[13px] font-semibold tabular", taken && "line-through")}>{fmtTime(s.start)}</span>
                    <span className={clsx("block text-[10px] tabular", sel ? "text-ink/70" : "text-white/50")}>{taken ? (s.status === "held" ? "held" : "waitlist") : `$${s.price.toFixed(0)}`}</span>
                    {s.promo && !taken && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-gold" />}
                  </button>
                );
              })}
              {slots.length === 0 && <p className="col-span-4 text-[12px] text-white/55">No more start times today. Pick another day.</p>}
            </div>
          )}
        </div>
        {error && <p className="rounded-2xl bg-danger/15 p-3 text-[12.5px] text-danger">{error}</p>}
        <p className="flex items-center gap-1.5 text-[10.5px] text-white/40"><Users size={12} /> Prices per court. {live.state === "play" ? `${court.short} is in play right now.` : ""} Peak: weekdays from 17:00, weekends from 10:00.</p>
        <p className="text-[10.5px] text-white/35">Hold time {HOUR / MIN / 12} min at checkout · conflict-checked against every live booking</p>
      </div>
    </ZonePanel>
  );
}
