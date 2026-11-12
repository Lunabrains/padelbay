"use client";

import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import * as Icons from "lucide-react";
import { POSES } from "@/components/three/rig";
import { JoinCard, Label, Tabs, ZonePanel, useZone } from "@/components/ui/kit";
import { ACHIEVEMENTS, CHALLENGES, SEASON, TIERS, nextTier, skillLabel, tierFor } from "@/lib/catalog";
import { useCustomer, useNow } from "@/lib/hooks";
import { onPick } from "@/lib/stage";
import { useStore } from "@/lib/store";
import type { TierId } from "@/lib/types";
import { DAY, MIN, fmtDate, startOfDay } from "@/lib/time";

type Tab = "levels" | "achievements" | "season";

export default function Club() {
  const db = useStore((s) => s.db);
  const customer = useCustomer();
  const now = useNow(30_000);
  const [tab, setTab] = useState<Tab>("levels");
  const mine = customer ? tierFor(customer.loyalty.lifetime) : TIERS[0];
  const [focus, setFocus] = useState<TierId>(mine.id);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tier") as TierId | null;
    if (t && TIERS.some((x) => x.id === t)) setFocus(t);
  }, []);
  useEffect(
    () =>
      onPick((kind, id) => {
        if (kind !== "tier") return false;
        setFocus(id as TierId);
        setTab("levels");
        return true;
      }),
    [],
  );
  useZone("club", POSES.club, focus);

  const tier = TIERS.find((t) => t.id === focus)!;
  const next = customer ? nextTier(customer.loyalty.lifetime) : TIERS[1];
  const progress = customer && next ? (customer.loyalty.lifetime - mine.min) / (next.min - mine.min) : customer ? 1 : 0;

  // weekly challenge progress from real activity
  const weekStart = startOfDay(now) - ((new Date(now).getDay() + 6) % 7) * DAY;
  const challengeProgress = useMemo(() => {
    if (!customer) return {} as Record<string, number>;
    const bookings = db.bookings.filter((b) => b.customerId === customer.id && b.status === "confirmed" && b.createdAt >= weekStart);
    const orders = db.orders.filter((o) => o.customerId === customer.id && o.createdAt >= weekStart);
    const players = new Set(bookings.flatMap((b) => b.players.map((p) => p.name)));
    return { "bookings-week": bookings.length, "cafe-week": orders.length, "players-week": players.size, "early-week": bookings.filter((b) => new Date(b.start).getHours() < 9).length } as Record<string, number>;
  }, [db, customer, weekStart]);

  const visits = customer ? db.bookings.filter((b) => b.customerId === customer.id && b.status === "confirmed").length : 0;

  return (
    <ZonePanel
      kicker="The Padel Bay Club"
      title={<>from rookie<br />to legend.</>}
      tabs={
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { id: "levels", label: "Levels" },
            { id: "achievements", label: "Achievements", badge: customer?.achievements.length },
            { id: "season", label: `Season ${SEASON.code}` },
          ]}
        />
      }
    >
      <div className="space-y-5">
        {customer ? (
          <div className="relative overflow-hidden rounded-[26px] p-4" style={{ background: `linear-gradient(140deg, ${mine.color}cc, #0f3a3f 75%)` }}>
            <div className="flex items-start justify-between">
              <div>
                <p className="label-caps text-white/80">{customer.name}</p>
                <p className="mt-1 font-display text-[34px] font-bold lowercase leading-none text-white">{mine.name}</p>
                <p className="text-[12px] text-white/80">with {mine.character} · member since {fmtDate(customer.createdAt)}</p>
              </div>
              <div className="text-right">
                <p className="text-[26px] font-bold tabular leading-none text-white">{customer.loyalty.points.toLocaleString()}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/70">points</p>
              </div>
            </div>
            <div className="mt-4">
              <div className="h-2 overflow-hidden rounded-full bg-white/20">
                <div className="h-full rounded-full bg-white transition-all duration-1000" style={{ width: `${Math.min(100, progress * 100)}%` }} />
              </div>
              <p className="mt-1.5 text-[11.5px] text-white/80">
                {next ? `${(next.min - customer.loyalty.lifetime).toLocaleString()} points to ${next.name} (${next.character})` : "Top of the bay. Legend status."}
              </p>
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-2xl bg-ink/30 px-3 py-2 text-[11.5px] text-white/85">
              <Icons.Activity size={13} />
              Skill rating <span className="font-semibold">{customer.skill.rating.toFixed(1)} · {skillLabel(customer.skill.rating)}</span>
              <span className="ml-auto text-white/55">separate from loyalty</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              {[
                [visits, "sessions"],
                [customer.achievements.length, "badges"],
                [db.orders.filter((o) => o.customerId === customer.id).length, "Sip orders"],
              ].map(([v, l]) => (
                <div key={l as string} className="rounded-2xl bg-ink/25 py-2">
                  <p className="text-[16px] font-bold tabular text-white">{v}</p>
                  <p className="text-[9.5px] font-semibold uppercase tracking-wider text-white/60">{l}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <JoinCard reason="and start as a Rookie" />
        )}

        {tab === "levels" && (
          <>
            <div className="grid grid-cols-4 gap-1.5">
              {TIERS.map((t) => (
                <button key={t.id} onClick={() => setFocus(t.id)} className={clsx("rounded-2xl border p-2 text-center transition", focus === t.id ? "border-white/60 bg-white/12" : "border-white/8 bg-white/4 hover:bg-white/8")}>
                  <span className="mx-auto block h-8 w-8 rounded-full shadow-[inset_0_-5px_10px_rgba(0,0,0,0.3)]" style={{ background: t.color }} />
                  <span className="mt-1.5 block text-[11px] font-semibold text-white">{t.name}</span>
                  {t.id === mine.id && customer && <span className="block text-[9px] font-bold uppercase tracking-wider text-sage">You</span>}
                </button>
              ))}
            </div>
            <div className="rounded-[24px] border border-white/10 p-4">
              <div className="flex items-baseline justify-between">
                <p className="font-display text-[26px] font-bold lowercase leading-none" style={{ color: tier.color }}>{tier.character}</p>
                <p className="text-[11px] tabular text-white/55">{tier.min ? `from ${tier.min.toLocaleString()} pts` : "day one"}</p>
              </div>
              <p className="mt-1.5 text-[13px] text-white/75">{tier.tagline}</p>
              <ul className="mt-3 space-y-1.5">
                {tier.privileges.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-[12.5px] text-white/85">
                    <Icons.Check size={14} className="mt-0.5 shrink-0" style={{ color: tier.color }} /> {p}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[10.5px] text-white/45">Earn 1 pt per $1 on courts and stays, 2 pts per $1 at Sip, plus achievement bonuses. Tap a character on the club deck to meet it.</p>
            </div>
            <div>
              <Label>Weekly challenges</Label>
              <div className="mt-2 space-y-1.5">
                {CHALLENGES.map((c) => {
                  const v = Math.min(c.goal, challengeProgress[c.metric] ?? 0);
                  return (
                    <div key={c.id} className="rounded-2xl bg-white/5 px-3.5 py-2.5">
                      <div className="flex items-center justify-between text-[12.5px]">
                        <span className="font-semibold text-white">{c.name}</span>
                        <span className="tabular text-sage">+{c.points}</span>
                      </div>
                      <p className="text-[11px] text-white/55">{c.description}</p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-sage" style={{ width: `${(v / c.goal) * 100}%` }} /></div>
                        <span className="text-[10.5px] tabular text-white/60">{v}/{c.goal}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {tab === "achievements" && (
          <div className="grid grid-cols-2 gap-2">
            {ACHIEVEMENTS.map((a) => {
              const got = customer?.achievements.find((x) => x.id === a.id);
              const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[a.icon] ?? Icons.Award;
              return (
                <div key={a.id} className={clsx("rounded-[20px] p-3 transition", got ? "bg-gradient-to-br from-sage/30 to-teal/30 ring-1 ring-sage/40" : "bg-white/4 opacity-60")}>
                  <span className={clsx("flex h-9 w-9 items-center justify-center rounded-full", got ? "bg-sage text-ink" : "bg-white/10 text-white/60")}>
                    {got ? <Icon size={17} /> : <Icons.Lock size={15} />}
                  </span>
                  <p className="mt-2 text-[13px] font-semibold text-white">{a.name}</p>
                  <p className="text-[11px] leading-snug text-white/60">{a.description}</p>
                  <p className="mt-1 text-[10.5px] font-semibold tabular text-sage">{got ? `Unlocked ${fmtDate(got.at)}` : `+${a.points} pts`}</p>
                </div>
              );
            })}
          </div>
        )}

        {tab === "season" && (
          <div className="space-y-3">
            <div className="rounded-[24px] bg-gradient-to-br from-teal to-deep p-4">
              <p className="label-caps text-sage">Season {SEASON.code}</p>
              <p className="mt-1 font-display text-[28px] font-bold lowercase leading-none text-white">{SEASON.name}</p>
              <p className="mt-1.5 text-[12px] text-white/70">Ends in {Math.ceil((startOfDay(now) + 47 * DAY - now) / DAY)} days. Your level at the end of the season unlocks the reward below.</p>
            </div>
            {SEASON.rewards.map((r) => {
              const t = TIERS.find((x) => x.id === r.tier)!;
              const reached = customer ? customer.loyalty.lifetime >= t.min : false;
              return (
                <div key={r.tier} className="flex items-center gap-3 rounded-2xl bg-white/5 p-3">
                  <span className="h-9 w-9 shrink-0 rounded-full" style={{ background: t.color }} />
                  <span className="flex-1">
                    <span className="block text-[13px] font-semibold text-white">{t.name}</span>
                    <span className="block text-[11.5px] text-white/60">{r.reward}</span>
                  </span>
                  {reached ? <Icons.CheckCircle2 size={18} className="text-sage" /> : <Icons.Lock size={15} className="text-white/35" />}
                </div>
              );
            })}
            <p className="text-[10.5px] text-white/40">Updated {Math.round((now % (60 * MIN)) / MIN)} min ago</p>
          </div>
        )}
      </div>
    </ZonePanel>
  );
}
