"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, type ReactNode } from "react";
import { BedDouble, Box, Coffee, Crown, MessageCircle, Square, Trophy, Users, X } from "lucide-react";
import { LogoDuoLight } from "@/components/brand/Logo";
import { POSES, flyTo } from "@/components/three/rig";
import { TIERS, tierFor } from "@/lib/catalog";
import { useFx } from "@/lib/fx";
import { hasWebGL, useBootStore, useCustomer, usePrefersReducedMotion } from "@/lib/hooks";
import { onPick, useStage } from "@/lib/stage";
import { useStore } from "@/lib/store";
import Concierge from "./Concierge";

const Stage = dynamic(() => import("@/components/three/Stage"), { ssr: false });
const Venue2D = dynamic(() => import("@/components/three/Venue2D"), { ssr: false });

export const ZONES = [
  { href: "/courts", label: "Courts", icon: Square, zone: "courts" },
  { href: "/cafe", label: "Sip", icon: Coffee, zone: "cafe" },
  { href: "/stay", label: "Suites", icon: BedDouble, zone: "suites" },
  { href: "/club", label: "Club", icon: Crown, zone: "club" },
  { href: "/community", label: "Community", icon: Trophy, zone: "community" },
] as const;

export default function GuestShell({ children }: { children: ReactNode }) {
  const hydrated = useBootStore();
  const router = useRouter();
  const twoD = useStore((s) => s.session.twoD);
  const webgl = useStage((s) => s.webgl);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    useStage.getState().set({ mode: "guest", webgl: hasWebGL(), reducedMotion: reduced, quality: window.innerWidth < 768 || (navigator.hardwareConcurrency ?? 8) < 4 ? "low" : "high" });
    document.documentElement.dataset.motion = reduced ? "reduced" : "full";
  }, [reduced]);

  useEffect(
    () =>
      onPick((kind, id) => {
        if (kind === "court") router.push(`/courts?court=${id}`);
        else if (kind === "cafe") router.push("/cafe");
        else if (kind === "suite") router.push(`/stay?unit=${id}`);
        else if (kind === "tier" || kind === "club") router.push(`/club${kind === "tier" ? `?tier=${id}` : ""}`);
        return true;
      }),
    [router],
  );

  const show3D = webgl && !twoD;
  return (
    <div className="relative min-h-dvh">
      <div className="fixed inset-0 z-0 bg-[linear-gradient(180deg,#f2b27e_0%,#e98b5a_38%,#1d5d66_62%,#0a1d20_100%)]">
        <Suspense fallback={null}>{show3D ? <Stage className="absolute inset-0" /> : <Venue2D className="absolute inset-0" />}</Suspense>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_120%,rgba(7,19,21,0.55),transparent_60%)]" />
      </div>
      <TopBar />
      <main className="relative z-10">{hydrated ? children : <Splash />}</main>
      <MobileDock />
      <Concierge />
      <Toasts />
      <LevelUp />
    </div>
  );
}

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <div className="flex flex-col items-center gap-5">
        <LogoDuoLight className="w-48 animate-float" />
        <div className="h-0.5 w-40 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-1/2 animate-[pb-shimmer_1.2s_linear_infinite] bg-sage" />
        </div>
      </div>
    </div>
  );
}

function TopBar() {
  const pathname = usePathname();
  const chapter = useStage((s) => s.chapter);
  const customer = useCustomer();
  const twoD = useStore((s) => s.session.twoD);
  const setSession = useStore((s) => s.setSession);
  const openConcierge = useFx((s) => s.openConcierge);
  const tier = customer ? tierFor(customer.loyalty.lifetime) : null;
  return (
    <header className="fixed inset-x-0 top-0 z-40 flex items-center justify-between gap-3 px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3 md:px-7">
      <Link href="/" className="shrink-0" aria-label="Padel Bay home">
        <LogoDuoLight className="w-[118px] md:w-[138px]" />
      </Link>
      <nav className="glass hidden items-center gap-1 rounded-full p-1 lg:flex" aria-label="Venue">
        {ZONES.map((z) => {
          const active = pathname.startsWith(z.href) || (pathname === "/" && chapter === z.zone);
          const Icon = z.icon;
          return (
            <Link
              key={z.href}
              href={z.href}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium transition-all duration-500 ${active ? "bg-white text-ink shadow-lg" : "text-white/80 hover:bg-white/10 hover:text-white"}`}
            >
              <Icon size={15} strokeWidth={2.2} />
              {z.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setSession({ twoD: !twoD })}
          className="glass-chip hidden h-10 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium text-white/85 transition hover:bg-white/15 md:flex"
          title={twoD ? "Switch to the 3D venue" : "Switch to the 2D site plan"}
        >
          <Box size={14} /> {twoD ? "3D" : "2D"}
        </button>
        <button onClick={() => openConcierge()} className="glass-chip hidden h-10 items-center gap-2 rounded-full px-4 text-[12.5px] font-semibold text-white transition hover:bg-white/15 md:flex">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sage opacity-70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-sage" />
          </span>
          Ask the bay
        </button>
        {customer && tier ? (
          <Link href="/me" className="glass-chip flex h-10 items-center gap-2 rounded-full pl-1 pr-3.5 text-white transition hover:bg-white/15">
            <span className="flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-bold text-ink" style={{ background: tier.color }}>
              {customer.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
            </span>
            <span className="hidden flex-col leading-none sm:flex">
              <span className="text-[12px] font-semibold">{customer.name.split(" ")[0]}</span>
              <span className="mt-0.5 text-[10px] text-white/65 tabular">{tier.name} · {customer.loyalty.points} pts</span>
            </span>
          </Link>
        ) : (
          <Link href="/courts" className="flex h-10 items-center rounded-full bg-white px-4 text-[12.5px] font-semibold text-ink transition hover:bg-sage">
            Join the tribe
          </Link>
        )}
      </div>
    </header>
  );
}

function MobileDock() {
  const pathname = usePathname();
  const openConcierge = useFx((s) => s.openConcierge);
  return (
    <nav className="fixed inset-x-3 bottom-[max(env(safe-area-inset-bottom),10px)] z-40 lg:hidden" aria-label="Venue">
      <div className="glass-dark flex items-center justify-between rounded-[26px] px-2 py-1.5">
        {ZONES.slice(0, 2).map((z) => (
          <DockItem key={z.href} {...z} active={pathname.startsWith(z.href)} />
        ))}
        <button onClick={() => openConcierge()} className="relative -mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-sage text-ink shadow-[0_10px_30px_-5px_rgba(130,190,157,0.7)]" aria-label="Ask the bay concierge">
          <span className="absolute inset-0 animate-pulse-ring rounded-full border-2 border-sage" />
          <MessageCircle size={22} strokeWidth={2.4} />
        </button>
        {ZONES.slice(2).map((z) => (
          <DockItem key={z.href} {...z} active={pathname.startsWith(z.href)} />
        ))}
      </div>
    </nav>
  );
}

function DockItem({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof Users; active: boolean }) {
  return (
    <Link href={href} className={`flex w-14 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[10px] font-medium transition ${active ? "text-sage" : "text-white/70"}`}>
      <Icon size={19} strokeWidth={active ? 2.5 : 2} />
      {label}
    </Link>
  );
}

function Toasts() {
  const toasts = useFx((s) => s.toasts);
  const dismiss = useFx((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-[60] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`animate-rise pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-xl ${
            t.tone === "reward" ? "border-gold/40 bg-[#2a2212]/85" : t.tone === "error" ? "border-danger/40 bg-[#2a1210]/85" : "border-white/15 bg-night/85"
          }`}
        >
          <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${t.tone === "reward" ? "bg-gold" : t.tone === "error" ? "bg-danger" : t.tone === "warning" ? "bg-sunset" : "bg-sage"}`} />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-white">{t.title}</p>
            {t.body && <p className="mt-0.5 text-[12px] text-white/70">{t.body}</p>}
          </div>
          <button onClick={() => dismiss(t.id)} className="text-white/50 hover:text-white" aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function LevelUp() {
  const levelUp = useFx((s) => s.levelUp);
  const close = useFx((s) => s.closeLevelUp);
  const pathname = usePathname();
  const reduced = useStage((s) => s.reducedMotion);
  useEffect(() => {
    if (!levelUp) return;
    useFx.getState().closeConcierge();
    const prev = { ...useStage.getState() };
    useStage.getState().set({ zone: "club", focusId: levelUp.to.id });
    flyTo(POSES.club, { reduced, duration: 2.2 });
    return () => {
      useStage.getState().set({ zone: prev.zone, focusId: prev.focusId });
    };
  }, [levelUp, reduced, pathname]);
  if (!levelUp) return null;
  const to = levelUp.to;
  const idx = TIERS.findIndex((t) => t.id === to.id);
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/55 p-4 pb-28 backdrop-blur-[2px] md:items-center md:justify-start md:pb-4 md:pl-[8vw]">
      <Confetti color={to.color} />
      <div className="animate-rise glass-dark w-full max-w-md rounded-[32px] p-7 text-center">
        <p className="label-caps text-white/70">Level up · {levelUp.from.name} → {to.name}</p>
        <h2 className="mt-3 font-display text-5xl font-bold lowercase leading-none" style={{ color: to.color }}>
          {to.name}
        </h2>
        <p className="mt-3 text-[15px] text-white/85">
          <span className="font-semibold text-white">{to.character}</span> joins your squad. {to.tagline}
        </p>
        <div className="mt-5 flex justify-center gap-1.5">
          {TIERS.map((t, i) => (
            <span key={t.id} className="h-1.5 w-10 rounded-full" style={{ background: i <= idx ? t.color : "rgba(255,255,255,0.15)" }} />
          ))}
        </div>
        <ul className="mt-5 space-y-1.5 text-left text-[13px] text-white/80">
          {to.privileges.slice(0, 3).map((p) => (
            <li key={p} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: to.color }} /> {p}
            </li>
          ))}
        </ul>
        <button onClick={close} className="mt-6 h-12 w-full rounded-full bg-white text-[14px] font-semibold text-ink transition hover:bg-sage">
          Let&apos;s play
        </button>
      </div>
    </div>
  );
}

function Confetti({ color }: { color: string }) {
  const bits = Array.from({ length: 40 }, (_, i) => i);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {bits.map((i) => (
        <span
          key={i}
          className="absolute top-[-5%] block h-3 w-1.5 rounded-sm"
          style={{
            left: `${(i * 37) % 100}%`,
            background: [color, "#82be9d", "#f7f2ea", "#f28a3b"][i % 4],
            animation: `pb-confetti ${2.4 + (i % 5) * 0.4}s ${(i % 10) * 0.12}s cubic-bezier(.2,.6,.4,1) forwards`,
            transform: `rotate(${i * 23}deg)`,
          }}
        />
      ))}
      <style>{`@keyframes pb-confetti { to { transform: translateY(115vh) rotate(720deg); opacity: 0.2; } }`}</style>
    </div>
  );
}
