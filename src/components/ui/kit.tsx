"use client";

import clsx from "clsx";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bluetooth, Check, ChevronLeft, KeyRound, Loader2, Lock, ShieldCheck, X } from "lucide-react";
import { POSES, flyTo, type Pose } from "@/components/three/rig";
import { SKILL_ONBOARDING } from "@/lib/catalog";
import { createCustomer, signInCustomer, unlockDoor } from "@/lib/actions";
import { useFx } from "@/lib/fx";
import { useIsDesktop } from "@/lib/hooks";
import { useStage, type Zone } from "@/lib/stage";
import { useStore } from "@/lib/store";
import type { AccessPass } from "@/lib/types";
import { fmtDate, fmtTime } from "@/lib/time";

export const PANEL_W = 460;

/** Frames the 3D stage for a zone page and keeps the subject clear of the floating panel. */
export function useZone(zone: Zone, pose: Pose | undefined, focusId?: string, opts: { interactive?: boolean } = {}) {
  const isDesktop = useIsDesktop();
  const reduced = useStage((s) => s.reducedMotion);
  useEffect(() => {
    const set = useStage.getState().set;
    const apply = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      set({ inset: w >= 1024 ? { right: PANEL_W + 40, bottom: 0 } : { right: 0, bottom: h * 0.5 } });
    };
    apply();
    window.addEventListener("resize", apply);
    set({ zone, focusId, interactive: opts.interactive ?? true });
    return () => window.removeEventListener("resize", apply);
  }, [zone, focusId, opts.interactive, isDesktop]);
  const key = pose ? `${pose.px},${pose.py},${pose.pz},${pose.tx},${pose.ty},${pose.tz}` : "";
  useEffect(() => {
    if (pose) flyTo(pose, { reduced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reduced]);
}

export function ZonePanel({
  kicker,
  title,
  onBack,
  children,
  footer,
  tabs,
}: {
  kicker: string;
  title: ReactNode;
  onBack?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  tabs?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <aside
      className={clsx(
        "glass-dark fixed z-30 flex flex-col overflow-hidden transition-[height] duration-500 ease-out",
        "inset-x-2 bottom-[86px] rounded-[30px] lg:inset-x-auto lg:bottom-5 lg:right-5 lg:top-[84px] lg:h-auto lg:w-[460px]",
        expanded ? "h-[calc(100dvh-170px)]" : "h-[52dvh]",
      )}
    >
      <button onClick={() => setExpanded((e) => !e)} className="mx-auto mt-2 block h-1.5 w-12 shrink-0 rounded-full bg-white/25 lg:hidden" aria-label={expanded ? "Collapse panel" : "Expand panel"} />
      <header className="shrink-0 px-5 pb-3 pt-3 lg:px-6 lg:pt-6">
        <div className="flex items-center gap-2">
          {onBack && (
            <button onClick={onBack} className="-ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20" aria-label="Back">
              <ChevronLeft size={17} />
            </button>
          )}
          <p className="label-caps text-sage">{kicker}</p>
        </div>
        <h1 className="mt-1.5 font-display text-[30px] font-bold lowercase leading-[0.95] tracking-[-0.03em] text-white lg:text-[38px]">{title}</h1>
        {tabs && <div className="mt-4">{tabs}</div>}
      </header>
      <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-5 lg:px-6">{children}</div>
      {footer && <div className="shrink-0 border-t border-white/10 bg-ink/40 px-5 py-4 lg:px-6">{footer}</div>}
    </aside>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: string; badge?: number }[] }) {
  return (
    <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1">
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => onChange(it.id)}
          className={clsx(
            "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition",
            value === it.id ? "bg-white text-ink" : "bg-white/8 text-white/75 hover:bg-white/15",
          )}
        >
          {it.label}
          {!!it.badge && <span className={clsx("rounded-full px-1.5 text-[10px] font-bold", value === it.id ? "bg-ink text-white" : "bg-sage text-ink")}>{it.badge}</span>}
        </button>
      ))}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  loading,
  className,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "sage" | "ghost" | "dark" | "danger";
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={clsx(
        "flex h-12 items-center justify-center gap-2 rounded-full px-5 text-[14px] font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45",
        variant === "primary" && "bg-white text-ink hover:bg-sage",
        variant === "sage" && "bg-sage text-ink hover:bg-white",
        variant === "ghost" && "border border-white/20 bg-white/5 text-white hover:bg-white/12",
        variant === "dark" && "bg-ink text-white hover:bg-teal",
        variant === "danger" && "bg-danger/90 text-white hover:bg-danger",
        className,
      )}
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}

export function Segmented<T extends string | number>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: string }[] }) {
  return (
    <div className="flex rounded-full bg-white/8 p-1">
      {items.map((it) => (
        <button
          key={String(it.id)}
          onClick={() => onChange(it.id)}
          className={clsx("flex-1 rounded-full py-2 text-[12.5px] font-semibold transition", value === it.id ? "bg-white text-ink shadow" : "text-white/75 hover:text-white")}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, value, onChange, placeholder, type = "text", autoFocus }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; autoFocus?: boolean }) {
  return (
    <label className="block">
      <span className="label-caps text-white/55">{label}</span>
      <input
        type={type}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 h-12 w-full rounded-2xl border border-white/12 bg-white/6 px-4 text-[14px] text-white placeholder:text-white/35 outline-none transition focus:border-sage/70 focus:bg-white/10"
      />
    </label>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-3 rounded-2xl bg-white/6 px-4 py-3 text-left transition hover:bg-white/10">
      <span>
        <span className="block text-[13.5px] font-medium text-white">{label}</span>
        {hint && <span className="mt-0.5 block text-[11.5px] text-white/55">{hint}</span>}
      </span>
      <span className={clsx("relative h-6 w-11 shrink-0 rounded-full transition", checked ? "bg-sage" : "bg-white/15")}>
        <span className={clsx("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", checked ? "left-[22px]" : "left-0.5")} />
      </span>
    </button>
  );
}

export function Avatar({ name, hue, size = 32, ring }: { name: string; hue: number; size?: number; ring?: string }) {
  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("");
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-ink"
      style={{ width: size, height: size, fontSize: size * 0.36, background: `hsl(${hue} 55% 72%)`, boxShadow: ring ? `0 0 0 2px ${ring}` : undefined }}
    >
      {initials}
    </span>
  );
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={clsx("label-caps text-white/55", className)}>{children}</p>;
}

export function SimBadge({ children = "Simulated AI" }: { children?: ReactNode }) {
  return <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-white/55">{children}</span>;
}

// ---------------------------------------------------------------------------
// Join / sign-in (new customers sign up inline, right where they need it)
// ---------------------------------------------------------------------------

export function JoinCard({ onDone, reason = "to book" }: { onDone?: () => void; reason?: string }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [skill, setSkill] = useState("casual");
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"new" | "member">("new");
  const customers = useStore((s) => s.db.customers);
  const toast = useFx((s) => s.toast);
  const submit = () => {
    const res = createCustomer({ name, phone, email, rating: SKILL_ONBOARDING.find((s) => s.id === skill)!.rating });
    if (!res.ok) return setError(res.error);
    toast({ tone: "reward", title: "Welcome to the tribe", body: "+150 welcome points · you're a Rookie. Meet Sprout in the Club." });
    onDone?.();
  };
  return (
    <div className="rounded-[24px] border border-white/12 bg-white/5 p-4">
      <div className="flex items-center justify-between">
        <p className="text-[15px] font-semibold text-white">Join the tribe {reason}</p>
        <button onClick={() => setMode(mode === "new" ? "member" : "new")} className="text-[12px] font-medium text-sage hover:underline">
          {mode === "new" ? "I'm a member" : "I'm new here"}
        </button>
      </div>
      {mode === "new" ? (
        <div className="mt-3 space-y-3">
          <Field label="Full name" value={name} onChange={setName} placeholder="Your name" />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Mobile" value={phone} onChange={setPhone} placeholder="+961 …" type="tel" />
            <Field label="Email" value={email} onChange={setEmail} placeholder="you@…" type="email" />
          </div>
          <div>
            <Label>How do you play?</Label>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              {SKILL_ONBOARDING.map((s) => (
                <button key={s.id} onClick={() => setSkill(s.id)} className={clsx("rounded-2xl border px-3 py-2 text-left transition", skill === s.id ? "border-sage bg-sage/15" : "border-white/10 bg-white/4 hover:bg-white/8")}>
                  <span className="block text-[12.5px] font-semibold text-white">{s.label}</span>
                  <span className="block text-[10.5px] text-white/55">{s.hint}</span>
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[10.5px] text-white/45">Sets your starting skill rating for matchmaking. It is separate from your loyalty level.</p>
          </div>
          {error && <p className="text-[12px] text-danger">{error}</p>}
          <div className="flex gap-2">
            <Button variant="ghost" className="h-11 flex-1 text-[12.5px]" onClick={() => { setName("Maya Haddad"); setPhone("+961 71 555 210"); setEmail("maya.demo@example.com"); }}>
              Fill demo details
            </Button>
            <Button variant="sage" className="h-11 flex-1" onClick={submit}>Create profile</Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 max-h-56 space-y-1.5 overflow-y-auto pr-1 thin-scrollbar">
          {customers.filter((c) => !c.isDemoGuest).slice(0, 8).map((c) => (
            <button key={c.id} onClick={() => { signInCustomer(c.id); onDone?.(); }} className="flex w-full items-center gap-3 rounded-2xl bg-white/5 px-3 py-2 text-left transition hover:bg-white/12">
              <Avatar name={c.name} hue={c.hue} size={30} />
              <span className="flex-1">
                <span className="block text-[13px] font-medium text-white">{c.name}</span>
                <span className="block text-[11px] text-white/50">{c.loyalty.lifetime.toLocaleString()} pts · skill {c.skill.rating.toFixed(1)}</span>
              </span>
            </button>
          ))}
          <p className="pt-1 text-[10.5px] text-white/45">Demo sign-in: pick a seeded member.</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Digital access pass with simulated Bluetooth unlock
// ---------------------------------------------------------------------------

export function PassCard({ pass, compact }: { pass: AccessPass; compact?: boolean }) {
  const [state, setState] = useState<"idle" | "scanning" | "open" | "denied">("idle");
  const [msg, setMsg] = useState("");
  const celebrate = useFx((s) => s.celebrate);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const unlock = () => {
    setState("scanning");
    timer.current = setTimeout(() => {
      const res = unlockDoor(pass.id, "BLE");
      if (!res.ok) {
        setState("denied");
        setMsg(res.error);
        return;
      }
      setState(res.value.granted ? "open" : "denied");
      setMsg(res.value.granted ? `${pass.door} is open` : res.value.reason ?? "Refused");
      if (res.value.granted) celebrate(res.reward);
      timer.current = setTimeout(() => setState("idle"), 3500);
    }, 1400);
  };
  const revoked = pass.status !== "active";
  return (
    <div className={clsx("relative overflow-hidden rounded-[26px] p-4 text-ink", revoked ? "bg-white/30" : "bg-gradient-to-br from-cream via-mint to-sage-soft")}>
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full border-[18px] border-white/40" />
      <div className="flex items-start justify-between">
        <div>
          <p className="label-caps text-teal">{pass.kind === "court" ? "Court access pass" : "Smart suite key"}</p>
          <p className="mt-1 text-[16px] font-bold leading-tight">{pass.label}</p>
          <p className="mt-1 text-[11.5px] text-ink/60">
            Valid {fmtDate(pass.validFrom)} {fmtTime(pass.validFrom)} → {fmtDate(pass.validTo)} {fmtTime(pass.validTo)}
          </p>
        </div>
        <span className={clsx("rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider", revoked ? "bg-ink/20 text-ink/60" : "bg-ink text-white")}>{revoked ? "Revoked" : "Active"}</span>
      </div>
      <div className={clsx("mt-4 flex items-center gap-4", compact && "mt-3")}>
        <div className="rounded-2xl bg-white p-2 shadow-sm">
          <QRCodeSVG value={`PADELBAY:${pass.id}:${pass.code}`} size={compact ? 68 : 92} fgColor="#071315" bgColor="#ffffff" level="M" />
        </div>
        <div className="flex-1">
          <p className="text-[11px] text-ink/60">Door</p>
          <p className="text-[13.5px] font-semibold">{pass.door}</p>
          <p className="mt-1 font-mono text-[12px] tracking-[0.25em] text-ink/70">{pass.code}</p>
          <p className="mt-1 flex items-center gap-1 text-[10.5px] text-ink/55"><ShieldCheck size={11} /> Simulated digital key · no hardware yet</p>
        </div>
      </div>
      {!revoked && (
        <button
          onClick={unlock}
          disabled={state === "scanning"}
          className={clsx(
            "mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full text-[13.5px] font-semibold transition",
            state === "open" ? "bg-teal text-white" : state === "denied" ? "bg-danger text-white" : "bg-ink text-white hover:bg-teal",
          )}
        >
          {state === "idle" && (<><Bluetooth size={16} /> Hold near the gate to unlock</>)}
          {state === "scanning" && (<><Loader2 size={16} className="animate-spin" /> Connecting to {pass.door}…</>)}
          {state === "open" && (<><Check size={16} /> {msg}</>)}
          {state === "denied" && (<><X size={16} /> {msg}</>)}
        </button>
      )}
      {revoked && (
        <p className="mt-3 flex items-center gap-1.5 text-[12px] text-ink/70"><Lock size={13} /> This key no longer opens {pass.door}.</p>
      )}
    </div>
  );
}

export function KeyIcon() {
  return <KeyRound size={14} />;
}

export function flyHome() {
  flyTo(POSES.overview);
}
