"use client";

import clsx from "clsx";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3, Bell, BrainCircuit, CalendarCheck, ChevronDown, ClipboardList, Coffee, Crown, Delete, KeyRound, LogOut, Megaphone,
  Pause, Play, ReceiptText, Shield, Sparkles, Square, Users, Wallet, X, Zap,
} from "lucide-react";
import { useFx } from "@/lib/fx";
import { simulateBurst, simulateOnce } from "@/lib/simulate";
import { useOwnerKpis } from "./Backoffice";
import { LogoDuoLight } from "@/components/brand/Logo";
import { POSES, flyTo } from "@/components/three/rig";
import { Avatar, SimBadge } from "@/components/ui/kit";
import { markNoticesRead, staffAction, staffSignIn, staffSignOut } from "@/lib/actions";
import { briefing, tournamentPlan, type BriefingItem } from "@/lib/ai";
import { ROLE_LABEL, can } from "@/lib/catalog";
import { hasWebGL, useBootStore, useNow, usePrefersReducedMotion, useStaff } from "@/lib/hooks";
import { onPick, useStage } from "@/lib/stage";
import { useStore } from "@/lib/store";
import { DAY, HOUR, fmtAgo, fmtTime, startOfDay } from "@/lib/time";
import { CafePanel, CourtPanel, LockersPanel } from "./FacilityPanels";
import { MODULES, ModuleWindow, type ModuleId } from "./Modules";

const Stage = dynamic(() => import("@/components/three/Stage"), { ssr: false });
const Venue2D = dynamic(() => import("@/components/three/Venue2D"), { ssr: false });

type Facility = { kind: "court"; id: string } | { kind: "cafe" } | { kind: "lockers"; id?: string } | null;

const MODULE_ICON: Record<ModuleId, typeof Users> = {
  reservations: CalendarCheck, orders: ReceiptText, crm: Users, analytics: BarChart3, forecast: BrainCircuit, marketing: Megaphone, tasks: ClipboardList, access: KeyRound, members: Crown, finance: Wallet, team: Shield,
};

export default function CommandShell() {
  const hydrated = useBootStore();
  const staff = useStaff();
  const twoD = useStore((s) => s.session.twoD);
  const webgl = useStage((s) => s.webgl);
  const reduced = usePrefersReducedMotion();
  const [facility, setFacility] = useState<Facility>(null);
  const [module, setModule] = useState<ModuleId | null>(null);
  const [simulating, setSimulating] = useState(false);
  const staffId = staff?.id;

  // demo traffic: a guest books, orders, reserves or cancels every few seconds
  useEffect(() => {
    if (!simulating || !staffId) return;
    const first = setTimeout(() => simulateOnce(), 800);
    const id = setInterval(() => simulateOnce(), 6_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [simulating, staffId]);

  useEffect(() => {
    useStage.getState().set({ mode: "ops", zone: "command", focusId: undefined, interactive: true, webgl: hasWebGL(), reducedMotion: reduced, quality: window.innerWidth < 768 ? "low" : "high" });
    flyTo(POSES.command, { reduced, duration: 2.4 });
    return () => useStage.getState().set({ mode: "guest" });
  }, [reduced]);

  useEffect(
    () =>
      onPick((kind, id) => {
        if (!useStore.getState().session.staffId) return true;
        if (kind === "court") setFacility({ kind: "court", id });
        else if (kind === "cafe") setFacility({ kind: "cafe" });
        else if (kind === "locker") setFacility({ kind: "lockers", id: id === "all" ? undefined : id });
        return true;
      }),
    [],
  );

  // frame the 3D venue around whatever is open
  useEffect(() => {
    const set = useStage.getState().set;
    const w = window.innerWidth;
    const panel = !!facility;
    set({ inset: panel ? (w >= 1024 ? { right: 500, bottom: 0 } : { right: 0, bottom: window.innerHeight * 0.5 }) : { right: 0, bottom: 0 } });
    if (!facility) {
      set({ focusId: undefined });
      flyTo(POSES.command, { reduced });
    } else if (facility.kind === "court") {
      set({ focusId: facility.id });
      flyTo(POSES[facility.id], { reduced });
    } else if (facility.kind === "cafe") {
      set({ focusId: "cafe" });
      flyTo(POSES.cafe, { reduced });
    } else {
      set({ focusId: facility.id });
      flyTo(POSES.lockers, { reduced });
    }
  }, [facility, reduced]);

  const show3D = webgl && !twoD;
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div className="fixed inset-0 z-0 bg-[radial-gradient(120%_90%_at_30%_10%,#0f3a3f_0%,#04161a_60%)]">
        <Suspense fallback={null}>{show3D ? <Stage className="absolute inset-0" /> : <Venue2D className="absolute inset-0" />}</Suspense>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(100%_70%_at_50%_100%,rgba(4,22,26,0.65),transparent_60%)]" />
      </div>
      {!hydrated ? null : !staff ? (
        <Login />
      ) : (
        <>
          <TopBar simulating={simulating} onSimulate={setSimulating} />
          <OwnerStrip onOpen={setModule} />
          <Briefing onOpen={(m) => setModule(m)} />
          <LiveFeed onOpen={(f) => setFacility(f)} />
          <Dock facility={facility} onFacility={setFacility} onModule={setModule} />
          {facility?.kind === "court" && <CourtPanel key={facility.id} courtId={facility.id} onClose={() => setFacility(null)} onSwitch={(id) => setFacility({ kind: "court", id })} />}
          {facility?.kind === "cafe" && <CafePanel onClose={() => setFacility(null)} />}
          {facility?.kind === "lockers" && <LockersPanel lockerId={facility.id} onClose={() => setFacility(null)} onSelect={(id) => setFacility({ kind: "lockers", id })} />}
          {module && <ModuleWindow id={module} onClose={() => setModule(null)} />}
          <OpsToasts />
          <FxToasts />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Login() {
  const staffList = useStore((s) => s.db.staff);
  const [sel, setSel] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const chosen = staffList.find((s) => s.id === sel);
  const press = (d: string) => {
    const next = (pin + d).slice(0, 4);
    setPin(next);
    setError("");
    if (next.length === 4 && sel) {
      const res = staffSignIn(sel, next);
      if (!res.ok) {
        setError(res.error);
        setTimeout(() => setPin(""), 400);
      }
    }
  };
  return (
    <div className="relative z-10 flex min-h-dvh items-center justify-center p-4">
      <div className="glass-dark animate-rise w-full max-w-[880px] overflow-hidden rounded-[34px] md:grid md:grid-cols-[1.1fr_1fr]">
        <div className="p-7 md:p-9">
          <LogoDuoLight className="w-36" />
          <p className="label-caps mt-8 text-sage">Back office · staff only</p>
          <h1 className="mt-2 font-display text-[40px] font-bold lowercase leading-[0.9] tracking-[-0.03em] text-white md:text-[52px]">command<br />center.</h1>
          <p className="mt-4 max-w-sm text-[13.5px] leading-relaxed text-white/65">How the owner and the team see Padel Bay: every reservation and Sip order as it comes in, on one live 3D model of the venue. What you see depends on your role.</p>
          <div className="mt-6 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {staffList.slice(0, 5).map((s) => (
              <button key={s.id} onClick={() => { setSel(s.id); setPin(""); setError(""); }} className={clsx("flex items-center gap-2.5 rounded-2xl border px-3 py-2 text-left transition", sel === s.id ? "border-sage bg-sage/15" : "border-white/10 bg-white/5 hover:bg-white/10")}>
                <Avatar name={s.name} hue={s.hue} size={30} />
                <span>
                  <span className="block text-[12.5px] font-semibold text-white">{s.name}</span>
                  <span className="block text-[10.5px] text-white/55">{ROLE_LABEL[s.role]}</span>
                </span>
              </button>
            ))}
          </div>
          <Link href="/" className="mt-6 inline-block text-[12px] text-white/50 hover:text-white">← Back to the guest experience</Link>
        </div>
        <div className="flex flex-col items-center justify-center border-t border-white/10 bg-ink/40 p-7 md:border-l md:border-t-0">
          {chosen ? (
            <>
              <p className="text-[13px] text-white/70">PIN for <span className="font-semibold text-white">{chosen.name}</span></p>
              <div className="mt-4 flex gap-3">
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className={clsx("h-3.5 w-3.5 rounded-full transition", i < pin.length ? (error ? "bg-danger" : "bg-sage") : "bg-white/15")} />
                ))}
              </div>
              <p className="mt-2 h-4 text-[11.5px] text-danger">{error}</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((d) =>
                  d ? (
                    <button key={d} onClick={() => (d === "⌫" ? setPin((p) => p.slice(0, -1)) : press(d))} className="flex h-14 w-16 items-center justify-center rounded-2xl bg-white/8 text-[20px] font-semibold text-white transition hover:bg-white/16 active:scale-95">
                      {d === "⌫" ? <Delete size={18} /> : d}
                    </button>
                  ) : (
                    <span key="blank" />
                  ),
                )}
              </div>
              <p className="mt-4 rounded-full bg-white/5 px-3 py-1.5 text-[11px] text-white/55">Demo PIN: <span className="font-mono font-semibold text-white">{chosen.pin}</span></p>
            </>
          ) : (
            <p className="text-center text-[13px] text-white/55">Choose your profile to sign in.<br /><span className="text-[11.5px] text-white/40">Try the General Manager first, then a Café Lead to see role-based access.</span></p>
          )}
        </div>
      </div>
    </div>
  );
}

function OwnerStrip({ onOpen }: { onOpen: (m: ModuleId) => void }) {
  const k = useOwnerKpis();
  const items: { label: string; value: string; sub: string; open: ModuleId }[] = [
    { label: "Revenue today", value: `$${Math.round(k.revenue).toLocaleString()}`, sub: `courts $${Math.round(k.court).toLocaleString()} · Sip $${Math.round(k.cafe).toLocaleString()}`, open: "finance" },
    { label: "Court sessions today", value: String(k.bookings), sub: `+${k.newBookings} new bookings in the last hour`, open: "reservations" },
    { label: "Sip orders today", value: String(k.orders), sub: `${k.live} in the kitchen now`, open: "orders" },
    { label: "Keys active now", value: String(k.keysActive), sub: `${k.lockersToCheck} locker${k.lockersToCheck === 1 ? "" : "s"} to check`, open: "reservations" },
  ];
  return (
    <div className="fixed left-1/2 top-[64px] z-20 hidden -translate-x-1/2 gap-1.5 xl:flex">
      {items.map((it) => (
        <button key={it.label} onClick={() => onOpen(it.open)} className="glass-dark rounded-[18px] px-4 py-2 text-left transition hover:bg-white/10">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-white/50">{it.label}</span>
          <span className="block text-[17px] font-semibold tabular leading-tight text-white">{it.value}</span>
          <span className="block text-[10px] text-white/45">{it.sub}</span>
        </button>
      ))}
    </div>
  );
}

function TopBar({ simulating, onSimulate }: { simulating: boolean; onSimulate: (v: boolean) => void }) {
  const staff = useStaff()!;
  const toast = useFx((s) => s.toast);
  const allNotices = useStore((s) => s.db.notices);
  const notices = useMemo(() => allNotices.filter((n) => n.audience === "staff"), [allNotices]);
  const now = useNow(1_000);
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const unread = notices.filter((n) => !n.read).length;
  return (
    <header className="fixed inset-x-0 top-0 z-30 flex items-center justify-between gap-3 px-4 pt-3 md:px-6">
      <div className="flex items-center gap-3">
        <Link href="/"><LogoDuoLight className="w-[104px] md:w-[120px]" /></Link>
        <span className="hidden h-6 w-px bg-white/20 md:block" />
        <span className="label-caps hidden text-white/70 md:block">Back office · Command Center</span>
        <span className="glass-chip hidden items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] tabular text-white/80 md:flex">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sage" /> Live · {fmtTime(now)}:{String(new Date(now).getSeconds()).padStart(2, "0")}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            onSimulate(!simulating);
            toast({ tone: "info", title: simulating ? "Guest simulation paused" : "Simulating live guests", body: simulating ? "No new demo traffic" : "A booking, order, stay or cancellation every few seconds" });
          }}
          className={clsx("flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-semibold transition", simulating ? "bg-sunset text-ink" : "glass-chip text-white hover:bg-white/15")}
          title="Generate realistic demo activity"
        >
          {simulating ? <Pause size={14} /> : <Play size={14} />} <span className="hidden sm:inline">{simulating ? "Simulating guests" : "Simulate guests"}</span>
        </button>
        <button
          onClick={() => {
            const done = simulateBurst(8);
            toast({ tone: "success", title: `${done.length} sample events added`, body: done.slice(0, 3).join(" · ") });
          }}
          className="glass-chip hidden h-10 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-medium text-white/85 hover:bg-white/15 sm:flex"
          title="Add a burst of sample bookings and orders"
        >
          <Zap size={14} /> Sample burst
        </button>
        <Link href="/courts" target="_blank" className="glass-chip hidden h-10 items-center rounded-full px-4 text-[12px] font-medium text-white/85 hover:bg-white/15 lg:flex">Customer app ↗</Link>
        <div className="relative">
          <button onClick={() => { setOpen((o) => !o); if (!open) markNoticesRead("staff"); }} className="glass-chip relative flex h-10 w-10 items-center justify-center rounded-full text-white hover:bg-white/15" aria-label="Alerts">
            <Bell size={17} />
            {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-sunset px-1 text-[10px] font-bold text-ink">{unread}</span>}
          </button>
          {open && (
            <div className="glass-dark absolute right-0 top-12 w-[340px] rounded-[24px] p-3">
              <div className="flex items-center justify-between px-1 pb-2">
                <p className="text-[13px] font-semibold text-white">Alerts & notifications</p>
                <button onClick={() => setOpen(false)} aria-label="Close"><X size={14} className="text-white/60" /></button>
              </div>
              <div className="thin-scrollbar max-h-[60vh] space-y-1.5 overflow-y-auto">
                {notices.slice(0, 30).map((n) => (
                  <div key={n.id} className="rounded-2xl bg-white/5 p-2.5">
                    <p className="flex items-center gap-1.5 text-[12px] font-semibold text-white">
                      <span className={clsx("h-1.5 w-1.5 rounded-full", n.severity === "warning" ? "bg-gold" : n.severity === "critical" ? "bg-danger" : n.severity === "success" ? "bg-sage" : "bg-[#9dbbff]")} />
                      {n.title}
                    </p>
                    <p className="text-[11px] text-white/60">{n.body}</p>
                    <p className="text-[10px] text-white/35">{fmtAgo(n.at, now)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="relative">
          <button onClick={() => setMenu((m) => !m)} className="glass-chip flex h-10 items-center gap-2 rounded-full pl-1 pr-3 text-white hover:bg-white/15">
            <Avatar name={staff.name} hue={staff.hue} size={32} />
            <span className="hidden flex-col text-left leading-none sm:flex">
              <span className="text-[12px] font-semibold">{staff.name.split(" ")[0]}</span>
              <span className="mt-0.5 text-[10px] text-white/60">{ROLE_LABEL[staff.role]}</span>
            </span>
            <ChevronDown size={14} />
          </button>
          {menu && (
            <div className="glass-dark absolute right-0 top-12 w-56 rounded-[20px] p-2">
              <Link href="/" className="block rounded-xl px-3 py-2 text-[12.5px] text-white/85 hover:bg-white/10">Guest experience</Link>
              <button onClick={() => staffSignOut()} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[12.5px] text-white/85 hover:bg-white/10"><LogOut size={14} /> Switch user / sign out</button>
              <button onClick={() => { useStore.getState().resetDemo(); staffSignOut(); }} className="w-full rounded-xl px-3 py-2 text-left text-[12.5px] text-white/60 hover:bg-white/10">Reset demo data</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function Briefing({ onOpen }: { onOpen: (m: ModuleId) => void }) {
  const db = useStore((s) => s.db);
  const staff = useStaff()!;
  const now = useNow(30_000);
  const b = useMemo(() => briefing(db, now), [db, now]);
  const [open, setOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= 768);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const allowed = can(staff.role, "ai:apply");

  const apply = (item: BriefingItem) => {
    const today = startOfDay(now);
    if (item.action === "promo") {
      staffAction(staff.id, "AI briefing: launched Sea Breeze off-peak promo", (d) => {
        d.promos.unshift({ id: `pr-${Date.now()}`, label: "AI Sea Breeze deal", courtIds: ["c3", "c4"], days: [1, 2, 3, 4, 5], fromHour: 13, toHour: 16, discount: 0.2, createdBy: "ai", active: true, createdAt: Date.now(), until: today + 7 * DAY });
        d.campaigns.unshift({ id: `cp-${Date.now()}`, name: "AI · Sea Breeze afternoons", kind: "off-peak", segmentId: "weekday-flex", channel: "WhatsApp", message: "Calm sea-side courts between 1 and 4pm, 20% off all week.", status: "sent", createdBy: "ai", createdAt: Date.now(), sentAt: Date.now(), stats: { audience: 74, delivered: 72, opened: 51, converted: 9, revenue: 324 } });
      }, "promo.create", "promo");
    } else if (item.action === "reactivation") {
      onOpen("marketing");
      return;
    } else if (item.action === "restock") {
      staffAction(staff.id, "AI briefing: restocked low inventory", (d) => {
        d.inventory.filter((i) => i.qty <= i.reorderAt).forEach((i) => (i.qty = i.par));
        d.tasks.unshift({ id: `tk-${Date.now()}`, title: "Receive supplier delivery for Sip", area: "cafe", assigneeId: "s-cafe", due: Date.now() + 4 * HOUR, status: "todo", priority: "normal", createdBy: "ai", createdAt: Date.now() });
      }, "inventory.reorder", "inventory");
    } else if (item.action === "staffing") {
      staffAction(staff.id, "AI briefing: added evening barista shift", (d) => {
        d.tasks.unshift({ id: `tk-${Date.now()}`, title: "Second barista 18:00–22:00 for court deliveries", area: "cafe", assigneeId: "s-barista", due: startOfDay(now) + 18 * HOUR, status: "todo", priority: "high", createdBy: "ai", createdAt: Date.now() });
      }, "task.create", "task");
    } else if (item.action === "tournament") {
      staffAction(staff.id, "AI organised tournament groups and match slots", (d) => {
        const t = d.tournaments.find((x) => x.status === "registration" && !x.plan);
        if (t) t.plan = tournamentPlan(d, t, now);
      }, "tournament.plan", "tournament");
    }
    setDone((x) => ({ ...x, [item.id]: true }));
  };

  return (
    <div className={clsx("glass-dark fixed inset-x-2 top-[64px] z-20 overflow-hidden rounded-[26px] transition-all md:inset-x-auto md:left-4 md:top-[72px]", open ? "md:w-[350px]" : "md:w-[300px]")}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2.5 px-4 py-3 text-left">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-sage to-teal"><Sparkles size={15} className="text-white" /></span>
        <span className="flex-1">
          <span className="block text-[13px] font-semibold text-white">AI briefing · {b.greeting.toLowerCase()}, {staff.name.split(" ")[0]}</span>
          <span className="block text-[10.5px] text-white/55">Generated {fmtTime(now)} from live data</span>
        </span>
        <ChevronDown size={15} className={clsx("text-white/60 transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="thin-scrollbar max-h-[calc(100dvh-230px)] space-y-2 overflow-y-auto px-4 pb-4 lg:max-h-[calc(100dvh-460px)]">
          <p className="text-[12.5px] leading-relaxed text-white/80">
            {b.headline} Revenue so far <span className="font-semibold text-white">${Math.round(b.revenueToday).toLocaleString()}</span>
            {b.delta ? <span className={b.delta >= 0 ? "text-sage" : "text-gold"}> ({b.delta >= 0 ? "+" : ""}{Math.round(b.delta * 100)}% vs last {new Date(now).toLocaleDateString("en-US", { weekday: "long" })})</span> : null}.
          </p>
          <SimBadge>Simulated AI · recommendations need approval</SimBadge>
          {b.items.map((it) => (
            <div key={it.id} className="rounded-2xl bg-white/5 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[12.5px] font-semibold text-white">{it.title}</p>
                <span className="shrink-0 rounded-full bg-sage/15 px-2 py-0.5 text-[10px] font-semibold text-sage">{it.impact}</span>
              </div>
              <p className="mt-1 text-[11.5px] leading-snug text-white/60">{it.detail}</p>
              {it.action && (
                <button
                  disabled={!allowed || done[it.id]}
                  onClick={() => apply(it)}
                  className={clsx("mt-2 rounded-full px-3 py-1 text-[11px] font-semibold transition", done[it.id] ? "bg-sage/20 text-sage" : "bg-white text-ink hover:bg-sage disabled:opacity-40")}
                >
                  {done[it.id] ? "Applied ✓" : !allowed ? "Needs ai:apply" : it.action === "reactivation" ? "Review win-back" : "Apply"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LiveFeed({ onOpen }: { onOpen: (f: Facility) => void }) {
  const notices = useStore((s) => s.db.notices);
  const now = useNow(5_000);
  const list = notices.filter((n) => n.audience === "staff" && n.kind !== "alert").slice(0, 6);
  return (
    <div className="glass-dark fixed bottom-[96px] left-4 z-20 hidden w-[350px] rounded-[26px] p-4 lg:block">
      <p className="label-caps flex items-center gap-2 text-white/70"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sunset" /> Live activity</p>
      <div className="mt-2.5 space-y-2">
        {list.map((n, i) => (
          <button
            key={n.id}
            onClick={() => {
              if (n.ref?.kind === "booking") {
                const b = useStore.getState().db.bookings.find((x) => x.id === n.ref!.id);
                if (b) onOpen({ kind: "court", id: b.courtId });
              } else if (n.ref?.kind === "order") onOpen({ kind: "cafe" });
              else if (n.ref?.kind === "pass") onOpen({ kind: "lockers" });
            }}
            className="flex w-full gap-2.5 text-left"
            style={{ animation: i === 0 ? "pb-rise 0.6s both" : undefined }}
          >
            <span className={clsx("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", n.kind === "booking" ? "bg-sage" : n.kind === "order" ? "bg-sunset" : n.kind === "access" ? "bg-white" : "bg-gold")} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-semibold text-white">{n.title}</span>
              <span className="block truncate text-[11px] text-white/55">{n.body}</span>
            </span>
            <span className="shrink-0 text-[10px] text-white/35">{fmtAgo(n.at, now)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Dock({ facility, onFacility, onModule }: { facility: Facility; onFacility: (f: Facility) => void; onModule: (m: ModuleId) => void }) {
  const staff = useStaff()!;
  const facilities = [
    { id: "courts", label: "Courts", icon: Square, on: facility?.kind === "court", go: () => onFacility({ kind: "court", id: "c1" }) },
    { id: "cafe", label: "Sip", icon: Coffee, on: facility?.kind === "cafe", go: () => onFacility({ kind: "cafe" }) },
    { id: "lockers", label: "Lockers", icon: KeyRound, on: facility?.kind === "lockers", go: () => onFacility({ kind: "lockers" }) },
  ];
  return (
    <nav className="fixed inset-x-2 bottom-3 z-30 flex justify-center">
      <div className="glass-dark no-scrollbar flex max-w-full items-center gap-1 overflow-x-auto rounded-[24px] p-1.5">
        {facilities.map((f) => (
          <button key={f.id} onClick={f.go} className={clsx("flex shrink-0 flex-col items-center gap-0.5 rounded-[18px] px-3 py-2 text-[10.5px] font-medium transition", f.on ? "bg-white text-ink" : "text-white/80 hover:bg-white/10")}>
            <f.icon size={17} /> {f.label}
          </button>
        ))}
        <span className="mx-1 h-8 w-px shrink-0 bg-white/15" />
        {MODULES.map((m) => {
          const Icon = MODULE_ICON[m.id];
          const ok = m.id === "team" || can(staff.role, m.perm);
          return (
            <button key={m.id} onClick={() => onModule(m.id)} className={clsx("flex shrink-0 flex-col items-center gap-0.5 rounded-[18px] px-3 py-2 text-[10.5px] font-medium transition hover:bg-white/10", ok ? "text-white/80" : "text-white/30")} title={ok ? m.label : `${m.label} · restricted for ${ROLE_LABEL[staff.role]}`}>
              <Icon size={17} /> {m.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function FxToasts() {
  const toasts = useFx((s) => s.toasts);
  const dismiss = useFx((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[132px] z-[60] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div key={t.id} className={clsx("animate-rise pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-xl", t.tone === "error" ? "border-danger/40 bg-[#2a1210]/90" : "border-white/15 bg-night/90")}>
          <span className={clsx("mt-1 h-2 w-2 shrink-0 rounded-full", t.tone === "error" ? "bg-danger" : t.tone === "warning" ? "bg-sunset" : "bg-sage")} />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-white">{t.title}</p>
            {t.body && <p className="mt-0.5 text-[12px] text-white/70">{t.body}</p>}
          </div>
          <button onClick={() => dismiss(t.id)} className="text-white/50 hover:text-white" aria-label="Dismiss"><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}

function OpsToasts() {
  const notices = useStore((s) => s.db.notices);
  const last = useRef<string | null>(null);
  const [toasts, setToasts] = useState<{ id: string; title: string; body: string }[]>([]);
  useEffect(() => {
    const top = notices.find((n) => n.audience === "staff");
    if (!top) return;
    if (last.current && top.id !== last.current && Date.now() - top.at < 60_000) {
      setToasts((t) => [...t.slice(-2), { id: top.id, title: top.title, body: top.body }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== top.id)), 5000);
    }
    last.current = top.id;
  }, [notices]);
  return (
    <div className="pointer-events-none fixed right-4 top-20 z-50 flex w-[320px] flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className="animate-rise rounded-2xl border border-sage/30 bg-night/90 px-4 py-3 shadow-2xl backdrop-blur-xl">
          <p className="text-[12.5px] font-semibold text-white">{t.title}</p>
          <p className="text-[11.5px] text-white/65">{t.body}</p>
        </div>
      ))}
    </div>
  );
}


