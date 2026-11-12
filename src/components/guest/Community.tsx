"use client";

import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import { Crown, Share2, Sparkles, Trophy, UserPlus } from "lucide-react";
import { POSES } from "@/components/three/rig";
import { Avatar, Button, JoinCard, Label, Segmented, SimBadge, Tabs, ZonePanel, useZone } from "@/components/ui/kit";
import { joinMatch, registerTournament, sendInvite } from "@/lib/actions";
import { matchmaking } from "@/lib/ai";
import { skillLabel } from "@/lib/catalog";
import { useFx } from "@/lib/fx";
import { useCustomer, useNow } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { DAY, fmtDayLabel, fmtTime } from "@/lib/time";

type Tab = "matches" | "players" | "tournaments" | "leaderboard";

async function share(text: string, toast: ReturnType<typeof useFx.getState>["toast"]) {
  try {
    if (navigator.share) await navigator.share({ title: "Padel Bay", text });
    else {
      await navigator.clipboard.writeText(text);
      toast({ tone: "success", title: "Copied to share", body: "Paste it in your group chat" });
    }
  } catch {}
}

export default function Community() {
  useZone("community", POSES.community);
  const db = useStore((s) => s.db);
  const customer = useCustomer();
  const now = useNow(30_000);
  const toast = useFx((s) => s.toast);
  const celebrate = useFx((s) => s.celebrate);
  const [tab, setTab] = useState<Tab>("matches");
  const [level, setLevel] = useState<"mine" | "all">("mine");
  const [partner, setPartner] = useState<Record<string, string>>({});

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (t) setTab(t);
  }, []);

  const matches = useMemo(
    () =>
      db.matches
        .filter((m) => m.start > now && (level === "all" || !customer || (customer.skill.rating >= m.level[0] - 0.5 && customer.skill.rating <= m.level[1] + 0.5)))
        .sort((a, b) => a.start - b.start),
    [db, now, level, customer],
  );
  const suggestions = useMemo(() => matchmaking(db, customer, 8), [db, customer]);
  const leaders = useMemo(() => [...db.customers].filter((c) => !c.isDemoGuest).sort((a, b) => b.skill.rating - a.skill.rating).slice(0, 10), [db]);
  const active = useMemo(() => {
    const counts = new Map<string, number>();
    db.bookings.filter((b) => b.status === "confirmed" && b.start > now - 30 * DAY && b.start < now).forEach((b) => counts.set(b.customerId, (counts.get(b.customerId) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, n]) => ({ c: db.customers.find((x) => x.id === id)!, n })).filter((x) => x.c);
  }, [db, now]);

  return (
    <ZonePanel
      kicker="Community · find your four"
      title={<>join the<br />tribe.</>}
      tabs={
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { id: "matches", label: "Open matches", badge: matches.filter((m) => m.playerIds.length < 4).length },
            { id: "players", label: "Players" },
            { id: "tournaments", label: "Tournaments" },
            { id: "leaderboard", label: "Leaderboard" },
          ]}
        />
      }
    >
      <div className="space-y-4">
        {!customer && <JoinCard reason="to join matches" />}

        {tab === "matches" && (
          <>
            <Segmented value={level} onChange={setLevel} items={[{ id: "mine", label: "Around my level" }, { id: "all", label: "All levels" }]} />
            {matches.length === 0 && <p className="rounded-2xl bg-white/5 p-4 text-[13px] text-white/60">No open matches at your level yet. Host one from a booking.</p>}
            {matches.map((m) => {
              const host = db.customers.find((c) => c.id === m.hostId);
              const court = db.courts.find((c) => c.id === m.courtId);
              const joined = customer && m.playerIds.includes(customer.id);
              const full = m.playerIds.length >= 4;
              return (
                <div key={m.id} className="rounded-[22px] bg-white/5 p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[14.5px] font-semibold text-white">{fmtDayLabel(m.start, now)} · {fmtTime(m.start)} · {court?.short}</p>
                      <p className="text-[11.5px] text-white/55">Level {m.level[0].toFixed(1)}–{m.level[1].toFixed(1)} · {skillLabel(m.level[0])} · ${m.pricePerPlayer.toFixed(0)} each</p>
                      {m.note && <p className="mt-1 text-[12px] italic text-white/70">&ldquo;{m.note}&rdquo;</p>}
                    </div>
                    <button onClick={() => share(`Open padel match at Padel Bay, ${fmtDayLabel(m.start, now)} ${fmtTime(m.start)} on ${court?.short}. ${4 - m.playerIds.length} spots left!`, toast)} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/8 text-white/70 hover:bg-white/15" aria-label="Share match">
                      <Share2 size={14} />
                    </button>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex -space-x-2">
                        {m.playerIds.map((pid) => {
                          const p = db.customers.find((c) => c.id === pid);
                          return p ? <Avatar key={pid} name={p.name} hue={p.hue} size={28} ring="#0a1d20" /> : null;
                        })}
                        {Array.from({ length: 4 - m.playerIds.length }, (_, i) => (
                          <span key={i} className="h-7 w-7 rounded-full border-2 border-dashed border-white/25 bg-night" />
                        ))}
                      </div>
                      <span className="text-[11.5px] text-white/55">Host {host?.name.split(" ")[0]}</span>
                    </div>
                    <Button
                      variant={joined ? "ghost" : "sage"}
                      className="h-9 px-4 text-[12.5px]"
                      disabled={!customer || full || !!joined}
                      onClick={() => {
                        if (!customer) return;
                        const res = joinMatch(m.id, customer.id);
                        if (!res.ok) return toast({ tone: "error", title: res.error });
                        toast({ tone: "success", title: "You're in", body: `${court?.short} · ${fmtDayLabel(m.start, now)} ${fmtTime(m.start)}. Pay your share at the gate.` });
                        celebrate(res.reward);
                      }}
                    >
                      {joined ? "Joined" : full ? "Full" : "Join"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {tab === "players" && (
          <>
            <div className="flex items-center justify-between">
              <Label>Your best matches</Label>
              <SimBadge>AI matchmaking · simulated</SimBadge>
            </div>
            {!customer && <p className="text-[12px] text-white/55">Join to get matched by level, side and play style.</p>}
            {suggestions.map((m) => (
              <div key={m.customer.id} className="flex items-center gap-3 rounded-[20px] bg-white/5 p-3">
                <Avatar name={m.customer.name} hue={m.customer.hue} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold text-white">{m.customer.name}</p>
                  <p className="text-[11px] text-white/55">{m.customer.skill.rating.toFixed(1)} {skillLabel(m.customer.skill.rating)} · {m.customer.skill.side} side · {m.customer.skill.style}</p>
                  <p className="mt-0.5 truncate text-[10.5px] text-sage">{m.reasons.join(" · ")}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className="text-[14px] font-bold tabular text-sage">{m.score}%</span>
                  <button
                    onClick={() => {
                      if (!customer) return;
                      sendInvite(customer.id, m.customer.id, "Fancy a game this week?");
                      toast({ tone: "success", title: `Invite sent to ${m.customer.name.split(" ")[0]}`, body: "Simulated push + WhatsApp" });
                    }}
                    className="flex h-8 items-center gap-1 rounded-full bg-white px-3 text-[11.5px] font-semibold text-ink transition hover:bg-sage"
                  >
                    <UserPlus size={12} /> Invite
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {tab === "tournaments" &&
          db.tournaments
            .filter((t) => t.start > now)
            .sort((a, b) => a.start - b.start)
            .map((t) => {
              const registered = customer && t.teams.some((tm) => tm.players.includes(customer.id));
              const partnerId = partner[t.id] ?? suggestions[0]?.customer.id;
              return (
                <div key={t.id} className="rounded-[24px] bg-gradient-to-br from-sunset/25 via-white/5 to-transparent p-4 ring-1 ring-sunset/25">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-gold"><Trophy size={12} /> {t.format}</p>
                      <p className="mt-1 text-[16px] font-semibold text-white">{t.name}</p>
                      <p className="text-[11.5px] text-white/60">{fmtDayLabel(t.start, now)} · {fmtTime(t.start)} · level {t.level[0]}–{t.level[1]} · ${t.entryFee} per player</p>
                      <p className="mt-1 text-[11.5px] text-white/75">Prize: {t.prize}</p>
                    </div>
                    <button onClick={() => share(`${t.name} at Padel Bay, ${fmtDayLabel(t.start, now)}. ${t.maxTeams - t.teams.length} team spots left.`, toast)} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/8 text-white/70" aria-label="Share tournament">
                      <Share2 size={14} />
                    </button>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gold" style={{ width: `${(t.teams.length / t.maxTeams) * 100}%` }} /></div>
                  <p className="mt-1 text-[10.5px] tabular text-white/55">{t.teams.length}/{t.maxTeams} teams{t.plan ? " · groups published" : ""}</p>
                  {t.plan && (
                    <div className="mt-3 grid grid-cols-2 gap-1.5">
                      {t.plan.groups.map((g) => (
                        <div key={g.name} className="rounded-xl bg-ink/30 p-2 text-[10.5px] text-white/75">
                          <p className="font-semibold text-white">{g.name}</p>
                          {g.teamIds.map((tid) => {
                            const team = t.teams.find((x) => x.id === tid);
                            return <p key={tid} className="truncate">{team?.players.map((p) => db.customers.find((c) => c.id === p)?.name.split(" ")[0]).join(" & ")}</p>;
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                  {customer && !registered && suggestions.length > 0 && (
                    <div className="mt-3">
                      <Label>Partner</Label>
                      <div className="no-scrollbar -mx-1 mt-1.5 flex gap-1.5 overflow-x-auto px-1">
                        {suggestions.slice(0, 5).map((s) => (
                          <button key={s.customer.id} onClick={() => setPartner((p) => ({ ...p, [t.id]: s.customer.id }))} className={clsx("flex shrink-0 items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-[11.5px]", partnerId === s.customer.id ? "bg-white text-ink" : "bg-white/8 text-white/80")}>
                            <Avatar name={s.customer.name} hue={s.customer.hue} size={22} /> {s.customer.name.split(" ")[0]}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <Button
                    variant={registered ? "ghost" : "primary"}
                    className="mt-3 h-10 w-full text-[13px]"
                    disabled={!customer || !!registered || t.teams.length >= t.maxTeams}
                    onClick={() => {
                      if (!customer || !partnerId) return;
                      const res = registerTournament(t.id, customer.id, partnerId);
                      if (!res.ok) return toast({ tone: "error", title: res.error });
                      toast({ tone: "success", title: `Registered for ${t.name}`, body: "Groups are published by the team. You'll be notified." });
                      celebrate(res.reward);
                    }}
                  >
                    {registered ? "Registered" : `Register as a pair · $${t.entryFee * 2}`}
                  </Button>
                </div>
              );
            })}

        {tab === "leaderboard" && (
          <>
            <div className="flex items-center justify-between">
              <Label>Skill ranking</Label>
              <span className="text-[10.5px] text-white/45">Ratings, not loyalty points</span>
            </div>
            <div className="space-y-1">
              {leaders.map((c, i) => (
                <div key={c.id} className={clsx("flex items-center gap-3 rounded-2xl px-3 py-2", i < 3 ? "bg-white/8" : "bg-white/[0.03]")}>
                  <span className={clsx("w-6 text-center text-[13px] font-bold tabular", i === 0 ? "text-gold" : i < 3 ? "text-sage" : "text-white/45")}>{i === 0 ? <Crown size={15} className="mx-auto" /> : i + 1}</span>
                  <Avatar name={c.name} hue={c.hue} size={28} />
                  <span className="flex-1 text-[13px] font-medium text-white">{c.name}</span>
                  <span className="text-[13px] font-semibold tabular text-white">{c.skill.rating.toFixed(1)}</span>
                  <span className="w-16 text-right text-[10.5px] text-white/45">{c.skill.wins}W {c.skill.matches - c.skill.wins}L</span>
                </div>
              ))}
            </div>
            <Label className="pt-2">Most sessions this month</Label>
            <div className="grid grid-cols-5 gap-1.5">
              {active.map(({ c, n }) => (
                <div key={c.id} className="flex flex-col items-center gap-1 rounded-2xl bg-white/5 py-2">
                  <Avatar name={c.name} hue={c.hue} size={30} />
                  <span className="text-[10.5px] text-white/75">{c.name.split(" ")[0]}</span>
                  <span className="text-[11px] font-bold tabular text-sage">{n}</span>
                </div>
              ))}
            </div>
            <p className="flex items-center gap-1.5 text-[10.5px] text-white/40"><Sparkles size={11} /> Ratings update after each recorded match</p>
          </>
        )}
      </div>
    </ZonePanel>
  );
}
