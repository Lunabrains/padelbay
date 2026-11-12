"use client";

import clsx from "clsx";
import { useMemo, useState, type ReactNode } from "react";
import { Check, Download, Search, Send, Sparkles, X } from "lucide-react";
import { Avatar, Button, Label, SimBadge, Toggle } from "@/components/ui/kit";
import { revokePass, staffAction } from "@/lib/actions";
import { churnRisk, forecast, tierDistribution } from "@/lib/ai";
import { PERMISSIONS, ROLE_LABEL, ROLE_PERMISSIONS, TIERS, can, skillLabel, type Permission } from "@/lib/catalog";
import { useNow, useStaff } from "@/lib/hooks";
import { SEGMENTS, cafeRevenue, courtRevenue, customerStats, mask, revenueByDay, segmentMembers, stayRevenue } from "@/lib/ops";
import { useStore } from "@/lib/store";
import type { Campaign, Task } from "@/lib/types";
import { DAY, addDays, fmtAgo, fmtDate, fmtDayLabel, fmtHour, fmtTime, fmtWeekday, startOfDay } from "@/lib/time";
import { Heatmap, HBars, SERIES, StackedBars } from "./charts";
import { Restricted } from "./FacilityPanels";

export type ModuleId = "crm" | "analytics" | "forecast" | "marketing" | "tasks" | "access" | "members" | "finance" | "team";

export const MODULES: { id: ModuleId; label: string; perm: Permission }[] = [
  { id: "crm", label: "CRM", perm: "crm:read" },
  { id: "analytics", label: "Analytics", perm: "analytics:read" },
  { id: "forecast", label: "AI forecast", perm: "analytics:read" },
  { id: "marketing", label: "Marketing", perm: "marketing:write" },
  { id: "tasks", label: "Tasks", perm: "tasks:write" },
  { id: "access", label: "Access & audit", perm: "audit:read" },
  { id: "members", label: "Members", perm: "membership:write" },
  { id: "finance", label: "Finance", perm: "finance:read" },
  { id: "team", label: "Team & roles", perm: "courts:read" },
];

export function ModuleWindow({ id, onClose }: { id: ModuleId; onClose: () => void }) {
  const staff = useStaff();
  const mod = MODULES.find((m) => m.id === id)!;
  const allowed = id === "team" || can(staff?.role, mod.perm);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-2 backdrop-blur-[3px] md:items-center md:p-8" onClick={onClose}>
      <div className="glass-dark animate-rise flex h-[86dvh] w-full max-w-5xl flex-col overflow-hidden rounded-[30px]" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <p className="label-caps text-sage">Command Center</p>
            <h2 className="font-display text-[28px] font-bold lowercase leading-none text-white">{mod.label}</h2>
          </div>
          <button onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Close"><X size={17} /></button>
        </header>
        <div className="thin-scrollbar flex-1 overflow-y-auto p-5 md:p-6">
          {!allowed ? (
            <Restricted perm={mod.perm} />
          ) : id === "crm" ? (
            <CRM />
          ) : id === "analytics" ? (
            <Analytics />
          ) : id === "forecast" ? (
            <Forecast />
          ) : id === "marketing" ? (
            <Marketing />
          ) : id === "tasks" ? (
            <Tasks />
          ) : id === "access" ? (
            <Access />
          ) : id === "members" ? (
            <Members />
          ) : id === "finance" ? (
            <Finance />
          ) : (
            <Team />
          )}
        </div>
      </div>
    </div>
  );
}

function Card({ title, children, right, className }: { title?: string; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <section className={clsx("rounded-[24px] border border-white/8 bg-white/[0.04] p-4", className)}>
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <p className="text-[13px] font-semibold text-white">{title}</p>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------

function CRM() {
  const db = useStore((s) => s.db);
  const staff = useStaff();
  const now = useNow(30_000);
  const [q, setQ] = useState("");
  const [seg, setSeg] = useState("all");
  const [sel, setSel] = useState<string | null>(null);
  const pii = can(staff?.role, "guests:pii");
  const members = useMemo(
    () =>
      segmentMembers(db, seg, now)
        .filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()))
        .map((c) => ({ c, s: customerStats(db, c, now) }))
        .sort((a, b) => (b.c.isDemoGuest ? 1 : 0) - (a.c.isDemoGuest ? 1 : 0) || b.s.spend - a.s.spend),
    [db, seg, q, now],
  );
  const picked = sel ? db.customers.find((c) => c.id === sel) : undefined;
  const ps = picked ? customerStats(db, picked, now) : undefined;
  const timeline = picked
    ? [
        ...db.bookings.filter((b) => b.customerId === picked.id).map((b) => ({ at: b.createdAt, text: `${b.status === "cancelled" ? "Cancelled" : "Booked"} ${db.courts.find((c) => c.id === b.courtId)?.short} · ${fmtDate(b.start)} ${fmtTime(b.start)} · $${b.price.toFixed(0)}${b.source === "concierge" ? " · via AI concierge" : ""}` })),
        ...db.orders.filter((o) => o.customerId === picked.id).map((o) => ({ at: o.createdAt, text: `Sip #${o.number} · ${o.lines.map((l) => l.name).join(", ")} → ${o.deliverTo.label}` })),
        ...db.stays.filter((s) => s.customerId === picked.id).map((s) => ({ at: s.createdAt, text: `Stay · ${db.units.find((u) => u.id === s.unitId)?.name} · ${s.status}` })),
        ...picked.achievements.map((a) => ({ at: a.at, text: `Achievement · ${a.id.replace(/-/g, " ")}` })),
      ].sort((a, b) => b.at - a.at).slice(0, 14)
    : [];
  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-4">
          <Search size={15} className="text-white/50" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search members" className="h-11 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/35" />
        </div>
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {SEGMENTS.map((s) => (
            <button key={s.id} onClick={() => setSeg(s.id)} className={clsx("shrink-0 rounded-full px-3 py-1.5 text-[11.5px] font-medium", seg === s.id ? "bg-white text-ink" : "bg-white/8 text-white/75")}>{s.label}</button>
          ))}
        </div>
        <p className="text-[11px] text-white/45">{members.length} members · {SEGMENTS.find((s) => s.id === seg)?.description}</p>
        <div className="space-y-1">
          {members.slice(0, 40).map(({ c, s }) => (
            <button key={c.id} onClick={() => setSel(c.id)} className={clsx("flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition", sel === c.id ? "bg-white/12" : "bg-white/[0.03] hover:bg-white/8")}>
              <Avatar name={c.name} hue={c.hue} size={30} ring={s.tier.color} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-white">{c.name}{c.isDemoGuest && <span className="rounded-full bg-sage px-1.5 text-[9px] font-bold text-ink">NEW</span>}</span>
                <span className="block text-[10.5px] text-white/50">{s.tier.name} · skill {c.skill.rating.toFixed(1)} · last visit {fmtAgo(c.lastVisitAt, now)}</span>
              </span>
              <span className="text-right">
                <span className="block text-[12px] font-semibold tabular text-white">${Math.round(s.spend).toLocaleString()}</span>
                <span className={clsx("block text-[10px] font-semibold", s.churn.label === "High" ? "text-danger" : s.churn.label === "Medium" ? "text-gold" : "text-sage")}>{s.churn.label} risk</span>
              </span>
            </button>
          ))}
        </div>
      </div>
      <div>
        {picked && ps ? (
          <Card>
            <div className="flex items-center gap-3">
              <Avatar name={picked.name} hue={picked.hue} size={48} ring={ps.tier.color} />
              <div>
                <p className="text-[16px] font-semibold text-white">{picked.name}</p>
                <p className="text-[11.5px] text-white/55">{mask(picked.phone, pii)} · {mask(picked.email, pii)}</p>
                <p className="text-[11px] text-white/45">Member since {fmtDate(picked.createdAt)}</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-1.5 text-center">
              {[[ps.sessions, "sessions"], [ps.orders, "Sip orders"], [ps.stays, "stays"], [`$${Math.round(ps.spend)}`, "lifetime"]].map(([v, l]) => (
                <div key={l as string} className="rounded-xl bg-white/5 py-2"><p className="text-[14px] font-bold tabular text-white">{v}</p><p className="text-[9px] uppercase tracking-wider text-white/45">{l}</p></div>
              ))}
            </div>
            <div className="mt-3 rounded-2xl bg-white/5 p-3 text-[11.5px] text-white/70">
              <p className="flex items-center justify-between"><span className="font-semibold text-white">Churn risk · {ps.churn.label}</span><SimBadge /></p>
              <div className="mt-1.5 h-1.5 rounded-full bg-white/8"><div className="h-full rounded-full" style={{ width: `${ps.churn.score * 100}%`, background: ps.churn.label === "High" ? "#ef6b5b" : ps.churn.label === "Medium" ? "#f6b26b" : "#36a678" }} /></div>
              <p className="mt-1.5">{ps.churn.reasons.join(" · ")}</p>
              <p className="mt-1">{ps.tier.name} · {picked.loyalty.points} pts · skill {picked.skill.rating.toFixed(1)} {skillLabel(picked.skill.rating)}</p>
            </div>
            {can(staff?.role, "marketing:write") && (
              <Button
                variant="sage"
                className="mt-3 h-10 w-full text-[12.5px]"
                onClick={() =>
                  staffAction(staff!.id, `Personal win-back sent to ${picked.name}`, (d) => {
                    d.campaigns.unshift({ id: `cp-${Date.now()}`, name: `Win-back · ${picked.name}`, kind: "reactivation", segmentId: "lapsed", channel: "WhatsApp", message: `Hey ${picked.name.split(" ")[0]}, your court misses you. 25% off any weekday afternoon this week.`, offer: "−25%", status: "sent", createdBy: "ai", createdAt: Date.now(), sentAt: Date.now(), stats: { audience: 1, delivered: 1, opened: 0, converted: 0, revenue: 0 } });
                  }, "campaign.send", "campaign")
                }
              >
                <Send size={14} /> Send AI win-back message
              </Button>
            )}
            <Label className="mt-4">Timeline</Label>
            <div className="mt-2 space-y-1.5">
              {timeline.map((t, i) => <p key={i} className="text-[11.5px] text-white/70"><span className="text-white/40">{fmtAgo(t.at, now)}</span> · {t.text}</p>)}
            </div>
          </Card>
        ) : (
          <Card><p className="text-[12.5px] text-white/55">Select a member to see their unified profile: courts, Sip, stays, loyalty, churn risk.</p></Card>
        )}
      </div>
    </div>
  );
}

function Analytics() {
  const db = useStore((s) => s.db);
  const now = useNow(30_000);
  const days = revenueByDay(db, 14, now);
  const today = startOfDay(now);
  const heat = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)).map((d) => ({
    label: fmtWeekday(d),
    cells: Array.from({ length: 17 }, (_, h) => {
      const from = d + (7 + h) * 3600000;
      let used = 0;
      for (const b of db.bookings) if (b.status === "confirmed" && b.start < from + 3600000 && b.start + b.durationMin * 60000 > from) used++;
      return Math.min(1, used / 4);
    }),
  }));
  const sources = ["app", "concierge", "desk", "waitlist"].map((s) => ({ label: s === "app" ? "App" : s === "concierge" ? "AI concierge" : s === "desk" ? "Front desk" : "Waitlist", value: db.bookings.filter((b) => b.source === s && b.createdAt > now - 14 * DAY).length }));
  const total14 = days.reduce((s, d) => s + d.values.courts + d.values.cafe + d.values.stays, 0);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Revenue · last 14 days" right={<span className="text-[13px] font-semibold tabular text-white">${Math.round(total14).toLocaleString()}</span>} className="lg:col-span-2">
        <StackedBars data={days.map((d) => ({ label: d.label, values: d.values }))} series={[SERIES.courts, SERIES.cafe, SERIES.stays]} height={170} />
      </Card>
      <Card title="Court occupancy by hour · last 7 days">
        <Heatmap rows={heat} cols={Array.from({ length: 17 }, (_, i) => fmtHour(7 + i).slice(0, 2))} />
      </Card>
      <Card title="Booking channels · 14 days">
        <HBars items={sources} format={(n) => `${n} bookings`} />
        <p className="mt-3 text-[11px] text-white/45">AI concierge bookings are tagged at source, so they show up here and in each court&apos;s schedule.</p>
      </Card>
    </div>
  );
}

function Forecast() {
  const db = useStore((s) => s.db);
  const staff = useStaff();
  const now = useNow(60_000);
  const f = useMemo(() => forecast(db, now), [db, now]);
  const [launched, setLaunched] = useState<string | null>(null);
  const weak = f
    .slice(1)
    .flatMap((d) => [13, 14, 15].map((h) => ({ day: d.day, h, v: d.cells.find((c) => c.hour === h)!.predicted })))
    .sort((a, b) => a.v - b.v)
    .slice(0, 3);
  return (
    <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
      <Card title="Predicted court demand · next 7 days" right={<SimBadge>Simulated forecast</SimBadge>}>
        <Heatmap
          rows={f.map((d) => ({ label: fmtDayLabel(d.day, now).replace("Tomorrow", "Tmrw"), cells: d.cells.map((c) => c.predicted) }))}
          cols={f[0].cells.map((c) => fmtHour(c.hour).slice(0, 2))}
          flag={(v, r, c) => r > 0 && v < 0.35 && f[r].cells[c].hour >= 12 && f[r].cells[c].hour < 17}
        />
        <p className="mt-3 text-[11px] text-white/45">Blends what is already booked with the learned weekly pattern. Confidence {Math.round(f[1].cells[0].confidence * 100)}% for tomorrow, higher for today.</p>
      </Card>
      <div className="space-y-3">
        <Card title="Dynamic off-peak promotions" right={<SimBadge />}>
          <div className="space-y-2">
            {weak.map((w) => {
              const id = `${w.day}-${w.h}`;
              return (
                <div key={id} className="rounded-2xl bg-white/5 p-3">
                  <p className="text-[12.5px] font-semibold text-white">{fmtDayLabel(w.day, now)} {fmtHour(w.h)}–{fmtHour(w.h + 2)}</p>
                  <p className="text-[11.5px] text-white/60">Forecast {Math.round(w.v * 100)}% · suggest −25% on courts 3–4</p>
                  {can(staff?.role, "ai:apply") ? (
                    <Button
                      variant={launched === id ? "ghost" : "sage"}
                      className="mt-2 h-9 w-full text-[12px]"
                      disabled={launched === id}
                      onClick={() => {
                        staffAction(staff!.id, `Launched AI off-peak promo ${fmtDayLabel(w.day, now)} ${fmtHour(w.h)}`, (d) => {
                          d.promos.unshift({ id: `pr-${Date.now()}`, label: "AI off-peak deal", courtIds: ["c3", "c4"], days: [new Date(w.day).getDay()], fromHour: w.h, toHour: w.h + 2, discount: 0.25, createdBy: "ai", active: true, createdAt: Date.now(), until: w.day + DAY });
                        }, "promo.create", "promo");
                        setLaunched(id);
                      }}
                    >
                      {launched === id ? <><Check size={13} /> Live in the customer app</> : "Launch promo"}
                    </Button>
                  ) : (
                    <p className="mt-2 text-[11px] text-white/45">Needs ai:apply to launch</p>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
        <Card title="AI pricing">
          <Toggle
            checked={db.settings.aiPricing}
            onChange={(v) => staff && staffAction(staff.id, `AI pricing ${v ? "on" : "off"}`, (d) => (d.settings.aiPricing = v), "settings.aiPricing", "settings")}
            label="Let AI run off-peak pricing"
            hint="Promos stay within −10% to −30% and never touch peak hours"
          />
          <div className="mt-3 space-y-1">
            {db.promos.filter((p) => p.active && p.until > now).map((p) => (
              <p key={p.id} className="text-[11.5px] text-white/70">● {p.label} · {p.days.map((d) => fmtWeekday(addDays(startOfDay(now), (d - new Date(now).getDay() + 7) % 7))).join(", ")} {fmtHour(p.fromHour)}–{fmtHour(p.toHour)} · −{Math.round(p.discount * 100)}%</p>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Marketing() {
  const db = useStore((s) => s.db);
  const staff = useStaff();
  const now = useNow(30_000);
  const [seg, setSeg] = useState("lapsed");
  const [draft, setDraft] = useState<Campaign | null>(null);
  const audience = segmentMembers(db, seg, now).length;
  const generate = () => {
    const s = SEGMENTS.find((x) => x.id === seg)!;
    const msg: Record<string, string> = {
      lapsed: "We miss your bandeja! Your court is waiting this week: 25% off any weekday afternoon, and the first flat white is on us.",
      "weekday-flex": "The sea-side courts are calm between 1 and 4pm. Book a weekday afternoon this week for 20% off.",
      regulars: "You're one of our regulars. Lock in your weekly slot for the season and get a free Sip tumbler.",
      "high-value": "An invitation: private sunset clinic for four on the sea side, this Saturday at 16:00.",
      "cafe-lovers": "New on the Sip menu: strawberry matcha. Double points all week when you order to your court.",
      parents: "Little ones play, you sip. Kids' clinic Saturday 10am with babyccinos on the house.",
    };
    setDraft({ id: `cp-${Date.now()}`, name: `${s.label} · ${fmtDate(now)}`, kind: seg === "lapsed" ? "reactivation" : seg === "weekday-flex" ? "off-peak" : "cafe", segmentId: seg, channel: "WhatsApp", message: msg[seg] ?? msg.lapsed, status: "draft", createdBy: "ai", createdAt: Date.now(), stats: { audience, delivered: 0, opened: 0, converted: 0, revenue: 0 } });
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <div className="space-y-4">
        <Card title="Create with AI" right={<SimBadge>Simulated copywriter</SimBadge>}>
          <Label>Audience</Label>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SEGMENTS.filter((s) => s.id !== "all").map((s) => (
              <button key={s.id} onClick={() => setSeg(s.id)} className={clsx("rounded-full px-3 py-1.5 text-[11.5px]", seg === s.id ? "bg-white text-ink" : "bg-white/8 text-white/75")}>{s.label}</button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-white/50">{audience} members · opted-in only</p>
          <Button variant="ghost" className="mt-3 h-10 w-full text-[12.5px]" onClick={generate}><Sparkles size={14} /> Draft message</Button>
          {draft && (
            <div className="mt-3 rounded-2xl bg-white/6 p-3">
              <p className="text-[10.5px] uppercase tracking-wider text-white/50">WhatsApp · {draft.stats.audience} recipients</p>
              <p className="mt-1 text-[13px] text-white">{draft.message}</p>
              <Button
                variant="sage"
                className="mt-3 h-10 w-full text-[12.5px]"
                onClick={() => {
                  staffAction(staff!.id, `Campaign sent: ${draft.name}`, (d) => {
                    d.campaigns.unshift({ ...draft, status: "sent", sentAt: Date.now(), stats: { ...draft.stats, delivered: Math.round(draft.stats.audience * 0.97), opened: Math.round(draft.stats.audience * 0.71), converted: Math.round(draft.stats.audience * 0.14), revenue: Math.round(draft.stats.audience * 0.14 * 42) } });
                  }, "campaign.send", "campaign");
                  setDraft(null);
                }}
              >
                <Send size={14} /> Send now (simulated)
              </Button>
            </div>
          )}
        </Card>
        <Card title="Automations">
          <div className="space-y-2">
            {db.automations.map((a) => (
              <Toggle key={a.id} checked={a.enabled} onChange={(v) => staffAction(staff!.id, `Automation ${a.name} ${v ? "on" : "off"}`, (d) => { d.automations.find((x) => x.id === a.id)!.enabled = v; }, "automation.toggle", "automation")} label={a.name} hint={`${a.trigger} → ${a.action} · ${a.runs} runs`} />
            ))}
          </div>
        </Card>
      </div>
      <Card title="Campaigns">
        <div className="space-y-2">
          {db.campaigns.map((c) => (
            <div key={c.id} className="rounded-2xl bg-white/5 p-3">
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] font-semibold text-white">{c.name}</span>
                <span className="text-[10.5px] text-white/45">{c.channel} · {c.createdBy === "ai" ? "AI" : "Staff"} · {c.sentAt ? fmtAgo(c.sentAt, now) : "draft"}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-[11.5px] text-white/60">{c.message}</p>
              <div className="mt-2 grid grid-cols-4 gap-1 text-center">
                {[["Sent", c.stats.delivered], ["Opened", c.stats.opened], ["Booked", c.stats.converted], ["Revenue", `$${c.stats.revenue}`]].map(([l, v]) => (
                  <div key={l as string} className="rounded-lg bg-white/5 py-1"><p className="text-[12px] font-semibold tabular text-white">{v}</p><p className="text-[9px] uppercase tracking-wider text-white/45">{l}</p></div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Tasks() {
  const db = useStore((s) => s.db);
  const staff = useStaff();
  const now = useNow(30_000);
  const [area, setArea] = useState<"all" | Task["area"]>("all");
  const [title, setTitle] = useState("");
  const list = db.tasks.filter((t) => area === "all" || t.area === area);
  const move = (t: Task, status: Task["status"]) => staffAction(staff!.id, `Task "${t.title}" → ${status}`, (d) => { d.tasks.find((x) => x.id === t.id)!.status = status; }, "task.update", "task");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "courts", "cafe", "suites", "front", "marketing"] as const).map((a) => (
          <button key={a} onClick={() => setArea(a)} className={clsx("rounded-full px-3 py-1.5 text-[11.5px] capitalize", area === a ? "bg-white text-ink" : "bg-white/8 text-white/75")}>{a}</button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New task…" className="h-9 w-56 rounded-full border border-white/12 bg-white/6 px-3 text-[12px] text-white outline-none placeholder:text-white/35" />
          <Button
            variant="sage"
            className="h-9 px-4 text-[12px]"
            disabled={!title.trim()}
            onClick={() => {
              staffAction(staff!.id, `Created task "${title}"`, (d) => { d.tasks.unshift({ id: `tk-${Date.now()}`, title: title.trim(), area: area === "all" ? "front" : area, assigneeId: staff!.id, due: Date.now() + 4 * 3600000, status: "todo", priority: "normal", createdBy: staff!.id, createdAt: Date.now() }); }, "task.create", "task");
              setTitle("");
            }}
          >
            Add
          </Button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {(["todo", "doing", "done"] as const).map((col) => (
          <div key={col} className="rounded-[22px] bg-white/[0.03] p-3">
            <p className="label-caps text-white/55">{col === "todo" ? "To do" : col === "doing" ? "In progress" : "Done"} · {list.filter((t) => t.status === col).length}</p>
            <div className="mt-2 space-y-2">
              {list.filter((t) => t.status === col).map((t) => {
                const who = db.staff.find((s) => s.id === t.assigneeId);
                return (
                  <div key={t.id} className="rounded-2xl bg-white/6 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[12.5px] font-semibold text-white">{t.title}</p>
                      {t.createdBy === "ai" && <span className="shrink-0 rounded-full bg-sage/20 px-1.5 py-0.5 text-[9px] font-bold text-sage">AI</span>}
                    </div>
                    <p className="mt-1 text-[10.5px] text-white/50">{t.area} · {who?.name ?? "Unassigned"} · due {fmtAgo(t.due, now)}{t.priority === "high" ? " · high" : ""}</p>
                    <div className="mt-2 flex gap-1">
                      {col !== "todo" && <button onClick={() => move(t, col === "done" ? "doing" : "todo")} className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/75">←</button>}
                      {col !== "done" && <button onClick={() => move(t, col === "todo" ? "doing" : "done")} className="rounded-full bg-white px-2.5 py-0.5 text-[10px] font-semibold text-ink">{col === "todo" ? "Start" : "Done"}</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Access() {
  const db = useStore((s) => s.db);
  const staff = useStaff();
  const now = useNow(10_000);
  const [tab, setTab] = useState<"doors" | "keys" | "audit">("doors");
  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        {(["doors", "keys", "audit"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={clsx("rounded-full px-3.5 py-1.5 text-[12px]", tab === t ? "bg-white text-ink" : "bg-white/8 text-white/75")}>{t === "doors" ? "Door events" : t === "keys" ? "Digital keys" : "System audit log"}</button>
        ))}
      </div>
      {tab === "doors" && (
        <div className="space-y-1">
          {db.accessLogs.slice(0, 40).map((l) => (
            <div key={l.id} className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2 text-[12px]">
              <span className={clsx("h-2 w-2 rounded-full", l.result === "granted" ? "bg-sage" : "bg-danger")} />
              <span className="w-20 tabular text-white/55">{fmtDayLabel(l.at, now) === "Today" ? fmtTime(l.at) : `${fmtDate(l.at).slice(4)} ${fmtTime(l.at)}`}</span>
              <span className="flex-1 text-white">{l.door}</span>
              <span className="text-white/60">{db.customers.find((c) => c.id === l.holderId)?.name ?? "Unknown pass"}</span>
              <span className="w-12 text-white/45">{l.method}</span>
              <span className={clsx("w-28 text-right", l.result === "granted" ? "text-sage" : "text-danger")}>{l.result}{l.reason ? ` · ${l.reason}` : ""}</span>
            </div>
          ))}
        </div>
      )}
      {tab === "keys" && (
        <div className="space-y-1.5">
          {db.passes.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-2xl bg-white/5 px-3 py-2.5">
              <span>
                <span className="block text-[12.5px] font-semibold text-white">{p.label}</span>
                <span className="block text-[11px] text-white/50">{db.customers.find((c) => c.id === p.holderId)?.name} · issued {fmtAgo(p.issuedAt, now)} · code {p.code}</span>
              </span>
              {p.status === "active" && can(staff?.role, "access:manage") ? (
                <button onClick={() => revokePass(p.id, staff!.id)} className="rounded-full bg-danger/20 px-2.5 py-1 text-[10.5px] font-semibold text-danger">Revoke</button>
              ) : (
                <span className="text-[10.5px] uppercase tracking-wider text-white/45">{p.status}</span>
              )}
            </div>
          ))}
          {db.passes.length === 0 && <p className="text-[12px] text-white/50">No digital passes yet.</p>}
        </div>
      )}
      {tab === "audit" && (
        <div className="space-y-1">
          {db.audit.slice(0, 60).map((a) => (
            <div key={a.id} className="flex gap-3 rounded-xl bg-white/[0.03] px-3 py-2 text-[11.5px]">
              <span className="w-16 shrink-0 tabular text-white/45">{fmtAgo(a.at, now)}</span>
              <span className={clsx("w-20 shrink-0 font-semibold", a.actor.type === "ai" ? "text-sage" : a.actor.type === "staff" ? "text-[#9dbbff]" : a.actor.type === "customer" ? "text-gold" : "text-white/60")}>
                {a.actor.type === "staff" ? db.staff.find((s) => s.id === (a.actor as { id: string }).id)?.name.split(" ")[0] : a.actor.type === "customer" ? "Customer" : a.actor.type === "ai" ? "AI" : "System"}
              </span>
              <span className="w-32 shrink-0 font-mono text-[10.5px] text-white/40">{a.action}</span>
              <span className="text-white/80">{a.summary}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Members() {
  const db = useStore((s) => s.db);
  const staff = useStaff();
  const dist = tierDistribution(db);
  const recent = db.notices.filter((n) => n.kind === "loyalty" && n.audience === "staff").slice(0, 6);
  const [q, setQ] = useState("");
  const list = db.customers.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.loyalty.lifetime - a.loyalty.lifetime).slice(0, 25);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
      <div className="space-y-4">
        <Card title="Members by level">
          <HBars items={dist.map((d) => ({ label: `${d.tier.name} · ${d.tier.character}`, value: d.count }))} format={(n) => `${n}`} />
          <p className="mt-3 text-[11px] text-white/45">Loyalty levels are commercial. Skill ratings are tracked separately for matchmaking.</p>
        </Card>
        <Card title="Recent level-ups">
          {recent.length === 0 && <p className="text-[12px] text-white/50">None yet today.</p>}
          {recent.map((n) => <p key={n.id} className="mb-1 text-[12px] text-white/75">● {n.title} <span className="text-white/45">· {n.body}</span></p>)}
        </Card>
        <Card title="Level thresholds">
          {TIERS.map((t) => (
            <p key={t.id} className="flex justify-between text-[12px] text-white/75"><span><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: t.color }} />{t.name}</span><span className="tabular">{t.min.toLocaleString()} pts · −{Math.round(t.courtDiscount * 100)}%</span></p>
          ))}
        </Card>
      </div>
      <Card title="Members" right={<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="h-8 w-40 rounded-full border border-white/12 bg-white/6 px-3 text-[12px] text-white outline-none" />}>
        <div className="space-y-1">
          {list.map((c) => {
            const t = TIERS.slice().reverse().find((x) => c.loyalty.lifetime >= x.min)!;
            return (
              <div key={c.id} className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2">
                <Avatar name={c.name} hue={c.hue} size={26} ring={t.color} />
                <span className="flex-1 text-[12.5px] text-white">{c.name}</span>
                <span className="text-[11px] text-white/55">{t.name}</span>
                <span className="w-16 text-right text-[12px] tabular text-white">{c.loyalty.points}</span>
                {can(staff?.role, "membership:write") && (
                  <button onClick={() => staffAction(staff!.id, `+100 goodwill points to ${c.name}`, (d) => { const x = d.customers.find((y) => y.id === c.id)!; x.loyalty.points += 100; x.loyalty.lifetime += 100; }, "membership.adjust", "customer")} className="rounded-full bg-white/10 px-2 py-0.5 text-[10.5px] text-white hover:bg-white/20">+100</button>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function Finance() {
  const db = useStore((s) => s.db);
  const now = useNow(60_000);
  const today = startOfDay(now);
  const from = today - 29 * DAY;
  const streams = [
    { label: "Courts", value: courtRevenue(db, from, today + DAY) },
    { label: "Sip café", value: cafeRevenue(db, from, today + DAY) },
    { label: "Bay Suites (simulated)", value: stayRevenue(db, from, today + DAY) },
  ];
  const refunds = db.bookings.filter((b) => b.cancelledAt && b.cancelledAt > from).reduce((s, b) => s + b.payment.refunded, 0);
  const methods = new Map<string, number>();
  db.bookings.filter((b) => b.createdAt > from && b.status === "confirmed").forEach((b) => methods.set(b.payment.method, (methods.get(b.payment.method) ?? 0) + b.price));
  const days = revenueByDay(db, 30, now);
  const exportCsv = () => {
    const rows = [["type", "date", "reference", "customer", "amount", "method"]];
    db.bookings.filter((b) => b.createdAt > from && b.kind !== "maintenance").forEach((b) => rows.push(["court", new Date(b.start).toISOString(), b.id, db.customers.find((c) => c.id === b.customerId)?.name ?? "", b.price.toFixed(2), b.payment.method]));
    db.orders.filter((o) => o.createdAt > from).forEach((o) => rows.push(["cafe", new Date(o.createdAt).toISOString(), `#${o.number}`, db.customers.find((c) => c.id === o.customerId)?.name ?? "", o.total.toFixed(2), o.payment.method]));
    const blob = new Blob([rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `padelbay-transactions-${fmtDate(now).replace(/\s/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
      <Card title="Revenue · last 30 days" right={<button onClick={exportCsv} className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[11.5px] text-white hover:bg-white/20"><Download size={13} /> Export CSV</button>}>
        <StackedBars data={days.map((d) => ({ label: d.label, values: d.values }))} series={[SERIES.courts, SERIES.cafe, SERIES.stays]} height={180} />
      </Card>
      <div className="space-y-4">
        <Card title="By stream · 30 days">
          <HBars items={streams} format={(n) => `$${Math.round(n).toLocaleString()}`} />
          <p className="mt-3 flex justify-between border-t border-white/10 pt-2 text-[12.5px] text-white"><span>Gross</span><span className="tabular font-semibold">${Math.round(streams.reduce((s, x) => s + x.value, 0)).toLocaleString()}</span></p>
          <p className="flex justify-between text-[12px] text-white/60"><span>Refunds issued</span><span className="tabular">−${Math.round(refunds).toLocaleString()}</span></p>
        </Card>
        <Card title="Court payments by method">
          <HBars items={[...methods.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)} format={(n) => `$${Math.round(n).toLocaleString()}`} color="#5a88e6" />
        </Card>
      </div>
    </div>
  );
}

function Team() {
  const db = useStore((s) => s.db);
  const staff = useStaff();
  const setSession = useStore((s) => s.setSession);
  return (
    <div className="space-y-4">
      <Card title="Staff">
        <div className="grid gap-2 md:grid-cols-2">
          {db.staff.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-2xl bg-white/5 p-3">
              <Avatar name={s.name} hue={s.hue} size={34} />
              <span className="flex-1">
                <span className="block text-[13px] font-semibold text-white">{s.name}{s.id === staff?.id && <span className="ml-1.5 text-[10px] text-sage">you</span>}</span>
                <span className="block text-[11px] text-white/55">{ROLE_LABEL[s.role]} · PIN {s.pin} (demo)</span>
              </span>
              {s.id !== staff?.id && <button onClick={() => setSession({ staffId: s.id })} className="rounded-full bg-white/10 px-3 py-1 text-[11px] text-white hover:bg-white/20">Switch</button>}
            </div>
          ))}
        </div>
      </Card>
      <Card title="Role permissions">
        <div className="overflow-x-auto thin-scrollbar">
          <table className="w-full min-w-[640px] text-[11px]">
            <thead>
              <tr className="text-white/55">
                <th className="py-1.5 text-left font-medium">Permission</th>
                {Object.entries(ROLE_LABEL).map(([r, l]) => <th key={r} className="px-2 py-1.5 font-medium">{l}</th>)}
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((p) => (
                <tr key={p} className="border-t border-white/5">
                  <td className="py-1.5 font-mono text-white/70">{p}</td>
                  {Object.keys(ROLE_LABEL).map((r) => (
                    <td key={r} className="text-center">{ROLE_PERMISSIONS[r as keyof typeof ROLE_PERMISSIONS].includes(p) ? <Check size={13} className="mx-auto text-sage" /> : <span className="text-white/15">·</span>}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export { churnRisk };
