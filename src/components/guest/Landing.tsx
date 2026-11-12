"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, AtSign, KeyRound, Mail, MapPin, Phone, Repeat, Sparkles, Users } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { POSES, flyTo, killFly, setPose } from "@/components/three/rig";
import { courtLive } from "@/components/three/Stage";
import { orderStage } from "@/lib/actions";
import { TIERS, VENUE, skillLabel } from "@/lib/catalog";
import { nextFreeSlots } from "@/lib/engine/availability";
import { useFx } from "@/lib/fx";
import { useCustomer, useIsDesktop, useNow } from "@/lib/hooks";
import { useStage, type Zone } from "@/lib/stage";
import { useStore } from "@/lib/store";
import { DAY, fmtDayLabel, fmtTime } from "@/lib/time";

gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP);
// Jump to the right moment after a stall instead of slowing down (tab switches, throttled previews).
gsap.ticker.lagSmoothing(0);

const SUNSET_BEIRUT = [17.0, 17.4, 17.75, 19.1, 19.4, 19.75, 19.75, 19.35, 18.75, 18.1, 16.7, 16.6];

const CHAPTER_RAIL = [
  { id: "courts", n: "01", label: "Courts" },
  { id: "sip", n: "02", label: "Sip café" },
  { id: "suites", n: "03", label: "Bay Suites" },
  { id: "club", n: "04", label: "The Club" },
  { id: "community", n: "05", label: "Community" },
];

export default function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();
  const reduced = useStage((s) => s.reducedMotion);

  // Stage framing: the 3D subject sits beside the copy (desktop) or above it (mobile).
  useEffect(() => {
    const apply = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      useStage.getState().set({ interactive: false, inset: w >= 1024 ? { right: -w * 0.36, bottom: 0 } : { right: 0, bottom: h * 0.34 } });
    };
    apply();
    window.addEventListener("resize", apply);
    useStage.getState().set({ zone: "intro", focusId: undefined });
    if (window.scrollY < 40) {
      setPose(POSES.intro);
      flyTo(POSES.hero, { duration: 4.2, reduced });
    }
    return () => {
      window.removeEventListener("resize", apply);
      useStage.getState().set({ chapter: undefined, inset: { right: 0, bottom: 0 } });
    };
  }, [reduced]);

  useGSAP(
    () => {
      const sections = gsap.utils.toArray<HTMLElement>("[data-pose]");
      sections.forEach((sec, i) => {
        if (i > 0) {
          const from = POSES[sections[i - 1].dataset.pose!];
          const to = POSES[sec.dataset.pose!];
          // Scroll position drives the camera between this chapter's pose and the previous one.
          ScrollTrigger.create({
            trigger: sec,
            start: "top bottom",
            end: "top 12%",
            scrub: reduced ? false : 1.1,
            onUpdate: (self) => {
              killFly();
              const t = gsap.parseEase("power2.inOut")(self.progress);
              const p = {
                px: from.px + (to.px - from.px) * t,
                py: from.py + (to.py - from.py) * t,
                pz: from.pz + (to.pz - from.pz) * t,
                tx: from.tx + (to.tx - from.tx) * t,
                ty: from.ty + (to.ty - from.ty) * t,
                tz: from.tz + (to.tz - from.tz) * t,
              };
              setPose(p);
            },
          });
        }
        ScrollTrigger.create({
          trigger: sec,
          start: "top 55%",
          end: "bottom 55%",
          onToggle: (self) => {
            if (!self.isActive) return;
            useStage.getState().set({ chapter: sec.dataset.zone, zone: (sec.dataset.stagezone as Zone) ?? "overview" });
          },
        });
      });

      if (reduced) return;

      gsap.from("[data-hero] .word", { yPercent: 110, rotate: 4, duration: 1.4, ease: "expo.out", stagger: 0.08, delay: 0.6 });
      gsap.from("[data-hero-fade]", { y: 24, opacity: 0, duration: 1.2, ease: "expo.out", stagger: 0.12, delay: 1.1 });

      gsap.utils.toArray<HTMLElement>("[data-split]").forEach((el) => {
        const split = SplitText.create(el, { type: "words,lines", mask: "lines" });
        gsap.from(split.words, {
          yPercent: 115,
          duration: 1.1,
          ease: "expo.out",
          stagger: 0.05,
          scrollTrigger: { trigger: el, start: "top 88%", toggleActions: "play none none reverse" },
        });
      });
      gsap.utils.toArray<HTMLElement>("[data-fade]").forEach((el) => {
        gsap.from(el, { y: 36, opacity: 0, duration: 1, ease: "expo.out", scrollTrigger: { trigger: el, start: "top 90%", toggleActions: "play none none reverse" } });
      });
      gsap.utils.toArray<HTMLElement>("[data-stagger]").forEach((el) => {
        gsap.from(el.children, { y: 40, opacity: 0, duration: 0.9, ease: "expo.out", stagger: 0.08, scrollTrigger: { trigger: el, start: "top 88%", toggleActions: "play none none reverse" } });
      });
      gsap.utils.toArray<HTMLElement>("[data-count]").forEach((el) => {
        const target = Number(el.dataset.count);
        const obj = { v: 0 };
        gsap.to(obj, {
          v: target,
          duration: 2,
          ease: "power3.out",
          onUpdate: () => (el.textContent = Math.round(obj.v).toLocaleString("en-US")),
          scrollTrigger: { trigger: el, start: "top 90%" },
        });
      });
      gsap.utils.toArray<HTMLElement>("[data-parallax]").forEach((el) => {
        gsap.to(el, { yPercent: Number(el.dataset.parallax), ease: "none", scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: true } });
      });

      // Marquee rows: constant drift, scroll velocity speeds them up and skews them.
      const rows = gsap.utils.toArray<HTMLElement>("[data-marquee]");
      const loops = rows.map((row, i) => gsap.to(row, { xPercent: i % 2 ? 0 : -50, startAt: { xPercent: i % 2 ? -50 : 0 }, duration: 38, ease: "none", repeat: -1 }));
      ScrollTrigger.create({
        onUpdate: (self) => {
          const v = gsap.utils.clamp(-1200, 1200, self.getVelocity());
          loops.forEach((l) => gsap.to(l, { timeScale: 1 + Math.abs(v) / 220, duration: 0.2, overwrite: true }));
          rows.forEach((r) => gsap.to(r, { skewX: -v / 140, duration: 0.4, overwrite: "auto" }));
          gsap.delayedCall(0.25, () => loops.forEach((l) => gsap.to(l, { timeScale: 1, duration: 1.2 })));
        },
      });

      // Sip menu: vertical scroll drives a horizontal ride along the counter.
      const track = root.current?.querySelector<HTMLElement>("[data-track]");
      const sip = root.current?.querySelector<HTMLElement>("#sip");
      if (track && sip) {
        gsap.to(track, {
          x: () => -(track.scrollWidth - window.innerWidth + 40),
          ease: "none",
          scrollTrigger: { trigger: sip, start: "top top", end: "bottom bottom", scrub: 0.8, invalidateOnRefresh: true },
        });
      }
      ScrollTrigger.refresh();
    },
    { scope: root, dependencies: [reduced, isDesktop] },
  );

  return (
    <div ref={root} className="relative">
      <ChapterRail />
      <Hero />
      <Marquee />
      <Stats />
      <CourtsChapter />
      <SipChapter />
      <SuitesChapter />
      <ClubChapter />
      <CommunityChapter />
      <ConciergeChapter />
      <CommandChapter />
      <Footer />
    </div>
  );
}

// ---------------------------------------------------------------------------

function ChapterRail() {
  const chapter = useStage((s) => s.chapter);
  return (
    <div className="pointer-events-none fixed left-6 top-1/2 z-30 hidden -translate-y-1/2 flex-col gap-3 xl:flex">
      {CHAPTER_RAIL.map((c) => {
        const zoneId = c.id === "sip" ? "cafe" : c.id;
        const active = chapter === zoneId;
        return (
          <a key={c.id} href={`#${c.id}`} className="pointer-events-auto group flex items-center gap-3">
            <span className={`h-px transition-all duration-700 ${active ? "w-10 bg-sage" : "w-4 bg-white/40 group-hover:w-6"}`} />
            <span className={`label-caps transition ${active ? "text-white" : "text-white/40 group-hover:text-white/80"}`}>
              {c.n} {active && <span className="ml-1 normal-case tracking-normal text-[12px] font-medium">{c.label}</span>}
            </span>
          </a>
        );
      })}
    </div>
  );
}

function Hero() {
  const db = useStore((s) => s.db);
  const now = useNow(20_000);
  const live = useMemo(() => ["c1", "c2", "c3", "c4"].map((id) => courtLive(db, id, now)), [db, now]);
  const free = live.filter((l) => l.state === "free").length;
  const next = useMemo(() => nextFreeSlots(db, now, 90, 1)[0], [db, now]);
  const queue = db.orders.filter((o) => !["delivered", "cancelled"].includes(orderStage(o, now))).length;
  const sunset = SUNSET_BEIRUT[new Date(now).getMonth()];
  const lastBooking = db.notices.find((n) => n.kind === "booking" && n.audience === "staff");
  return (
    <section data-pose="hero" data-zone="" data-stagezone="intro" className="relative flex h-[100svh] min-h-[640px] flex-col justify-end">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/10 to-transparent" />
      <div className="relative px-5 pb-[136px] md:px-10 md:pb-14">
        <div data-hero-fade className="flex items-center gap-3 text-white/80">
          <span className="label-caps">Ramlet El Baida · Beirut</span>
          <span className="h-px w-12 bg-white/40" />
          <span className="label-caps hidden sm:inline">Sports & hospitality, reimagined</span>
        </div>
        <h1 data-hero className="mt-4 font-display text-[21vw] font-bold lowercase leading-[0.8] tracking-[-0.05em] text-white md:text-[13.5vw]">
          <span className="block overflow-hidden pb-[0.06em]">
            <span className="word inline-block">be</span> <span className="word inline-block">the</span>
          </span>
          <span className="block overflow-hidden pb-[0.1em]">
            <span className="word inline-block text-sage">vibe.</span>
          </span>
        </h1>
        <div className="mt-4 flex flex-col gap-6 md:mt-2 md:flex-row md:items-end md:justify-between">
          <p data-hero-fade className="max-w-md text-[14px] leading-relaxed text-white/85 md:text-[17px]">
            <span className="font-semibold text-white">Play hard. Sip slow.</span> Indoor and sea-side padel, specialty coffee by Sip<span className="hidden sm:inline">, stays on the sand, and a club that levels up with you</span>.
          </p>
          <div data-hero-fade className="flex flex-wrap gap-3">
            <Link href="/courts" className="group flex h-13 items-center gap-2 rounded-full bg-white px-6 py-3.5 text-[14px] font-semibold text-ink transition hover:bg-sage">
              Book a court <ArrowUpRight size={17} className="transition group-hover:rotate-45" />
            </Link>
            <a href="#courts" className="flex items-center gap-2 rounded-full bg-ink/70 px-6 py-3.5 text-[14px] font-semibold text-white backdrop-blur transition hover:bg-ink">
              Explore the bay <ArrowDown size={16} />
            </a>
          </div>
        </div>
      </div>
      <div data-hero-fade className="glass absolute right-6 top-28 hidden w-[290px] rounded-[26px] p-5 md:block">
        <div className="flex items-center justify-between">
          <span className="label-caps flex items-center gap-2 text-white/75">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sage opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-sage" />
            </span>
            Live at the bay
          </span>
          <span className="text-[11px] text-white/60">sunset {String(Math.floor(sunset)).padStart(2, "0")}:{String(Math.round((sunset % 1) * 60)).padStart(2, "0")}</span>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-1.5">
          {live.map((l) => (
            <div key={l.court.id} className="rounded-xl bg-white/8 p-2 text-center">
              <span className="mx-auto block h-1.5 w-6 rounded-full" style={{ background: l.state === "free" ? "#82be9d" : l.state === "play" ? "#f28a3b" : l.state === "maintenance" ? "#ef6b5b" : "#f6b26b" }} />
              <span className="mt-1.5 block text-[10px] text-white/70">{l.court.short.replace("Court ", "C")}</span>
            </div>
          ))}
        </div>
        <dl className="mt-4 space-y-2 text-[12.5px]">
          <div className="flex justify-between"><dt className="text-white/65">Courts free now</dt><dd className="font-semibold tabular">{free} of 4</dd></div>
          {next && <div className="flex justify-between"><dt className="text-white/65">Next free slot</dt><dd className="font-semibold tabular">{fmtDayLabel(next.start, now) === "Today" ? "" : fmtDayLabel(next.start, now) + " "}{fmtTime(next.start)}</dd></div>}
          <div className="flex justify-between"><dt className="text-white/65">In the Sip kitchen</dt><dd className="font-semibold tabular">{queue} orders</dd></div>
        </dl>
        {lastBooking && <p className="mt-4 border-t border-white/10 pt-3 text-[11.5px] leading-snug text-white/60">{lastBooking.body}</p>}
      </div>
      <div className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-white/60 md:flex">
        <span className="label-caps">Scroll</span>
        <span className="h-10 w-px overflow-hidden bg-white/20">
          <span className="block h-1/2 w-px animate-[pb-float_1.6s_ease-in-out_infinite] bg-white" />
        </span>
      </div>
    </section>
  );
}

function Marquee() {
  const words = ["join the vibe", "play hard", "sip slow", "join the tribe", "be the vibe", "one-stop meeting point"];
  const Row = ({ outline }: { outline?: boolean }) => (
    <div data-marquee className="flex w-max shrink-0 items-center gap-10 whitespace-nowrap pr-10">
      {[...words, ...words].map((w, i) => (
        <span key={i} className="flex items-center gap-10">
          <span
            className={`font-display text-[15vw] font-bold lowercase leading-none tracking-[-0.04em] md:text-[8.5vw] ${outline ? "text-transparent" : "text-white"}`}
            style={outline ? { WebkitTextStroke: "1.5px rgba(255,255,255,0.7)" } : undefined}
          >
            {w}
          </span>
          <svg width="44" height="44" viewBox="0 0 44 44" className="shrink-0">
            <circle cx="22" cy="22" r="20" fill="#8cc63f" />
            <path d="M6 14 C 18 20, 18 26, 8 32 M38 12 C 26 18, 26 26, 36 32" stroke="#f7f7f2" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          </svg>
        </span>
      ))}
    </div>
  );
  return (
    <section className="relative overflow-hidden py-10 md:py-14">
      <div className="flex"><Row /></div>
      <div className="mt-2 flex"><Row outline /></div>
    </section>
  );
}

function Corner({ className }: { className: string }) {
  return <span className={`absolute text-[18px] font-light text-ink/30 ${className}`}>+</span>;
}

function Stats() {
  return (
    <section data-pose="overview" data-zone="" data-stagezone="overview" className="relative px-3 py-16 md:px-6 md:py-24">
      <div className="relative rounded-[34px] bg-cream px-6 py-12 text-ink md:px-14 md:py-16">
        <Corner className="left-5 top-4" />
        <Corner className="right-5 top-4" />
        <Corner className="bottom-4 left-5" />
        <Corner className="bottom-4 right-5" />
        <p className="label-caps text-teal">Padel Bay in numbers</p>
        <div data-stagger className="mt-8 grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-4">
          {[
            { n: 4, label: "Courts", sub: "Indoor hall + sea side" },
            { n: 17, label: "Hours a day", sub: "07:00 until midnight" },
            { n: 2551, label: "In the tribe", sub: "@padelbaycourts" },
            { n: 26, label: "Sip signatures", sub: "Coffee, matcha, recovery" },
          ].map((s) => (
            <div key={s.label}>
              <p className="font-display text-[15vw] font-bold leading-none tracking-[-0.05em] text-teal md:text-[5.6vw]">
                <span data-count={s.n}>{s.n.toLocaleString("en-US")}</span>
                {s.n === 2551 && <span className="text-sage">+</span>}
              </p>
              <p className="mt-3 text-[13px] font-semibold uppercase tracking-[0.14em]">{s.label}</p>
              <p className="mt-1 text-[13px] text-ink/55">{s.sub}</p>
            </div>
          ))}
        </div>
        <p data-split className="mt-16 max-w-4xl font-display text-[8vw] font-bold lowercase leading-[0.95] tracking-[-0.04em] text-ink md:text-[4.2vw]">
          one-stop meeting point to get together, to play and to <span className="text-sage">feel good.</span>
        </p>
      </div>
    </section>
  );
}

function ChapterShell({ id, pose, zone, n, kicker, title, children, tall = "h-[190vh]", align = "left" }: { id: string; pose: string; zone: Zone; n: string; kicker: string; title: React.ReactNode; children?: React.ReactNode; tall?: string; align?: "left" | "right" }) {
  return (
    <section id={id} data-pose={pose} data-zone={zone === "suites" ? "suites" : zone} data-stagezone={zone} className={`relative ${tall}`}>
      <div className={`sticky top-0 flex h-[100svh] flex-col justify-end px-4 pb-28 pt-24 md:px-10 md:pb-12 lg:justify-center ${align === "right" ? "lg:items-end" : ""}`}>
        <div className="w-full max-w-[560px]">
          <div data-fade className="flex items-center gap-3 text-white/80">
            <span className="font-display text-[13px] font-bold text-sage">{n}</span>
            <span className="h-px w-10 bg-white/40" />
            <span className="label-caps">{kicker}</span>
          </div>
          <h2 data-split className="mt-3 font-display text-[16vw] font-bold lowercase leading-[0.85] tracking-[-0.05em] text-white drop-shadow-[0_4px_30px_rgba(0,0,0,0.35)] md:text-[6.4vw]">
            {title}
          </h2>
          <div className="mt-5">{children}</div>
        </div>
      </div>
    </section>
  );
}

function CourtsChapter() {
  const db = useStore((s) => s.db);
  const customer = useCustomer();
  const now = useNow(30_000);
  const slots = useMemo(() => nextFreeSlots(db, now, 90, 6, customer), [db, now, customer]);
  return (
    <ChapterShell id="courts" pose="courts" zone="courts" n="01" kicker="Indoor hall · Sea side" title="the courts.">
      <div className="glass rounded-[28px] p-5 md:p-6">
        <p data-fade className="text-[14.5px] leading-relaxed text-white/85">
          Four panoramic courts: two under the diagrid hall, two open to the Mediterranean breeze. Pick yours in 3D, see live availability, invite your three and walk in with a digital pass.
        </p>
        <div data-stagger className="mt-4 flex flex-wrap gap-2">
          {[
            [Sparkles, "Live availability"],
            [Repeat, "Weekly sessions"],
            [Users, "Split the bill"],
            [KeyRound, "Digital gate pass"],
          ].map(([Icon, l]) => {
            const I = Icon as typeof Sparkles;
            return (
              <span key={l as string} className="glass-chip flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] text-white/90">
                <I size={13} className="text-sage" /> {l as string}
              </span>
            );
          })}
        </div>
        <p className="label-caps mt-5 text-white/60">Next free · 90 min</p>
        <div data-stagger className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {slots.map((s) => (
            <Link
              key={`${s.courtId}-${s.start}`}
              href={`/courts?court=${s.courtId}&t=${s.start}`}
              className="group rounded-2xl border border-white/12 bg-white/6 px-3 py-2.5 transition hover:border-sage/60 hover:bg-sage/15"
            >
              <span className="block text-[11px] text-white/60">{db.courts.find((c) => c.id === s.courtId)?.short} · {fmtDayLabel(s.start, now)}</span>
              <span className="mt-0.5 flex items-baseline justify-between">
                <span className="text-[16px] font-semibold tabular text-white">{fmtTime(s.start)}</span>
                <span className="text-[12px] tabular text-sage">${s.price.toFixed(0)}</span>
              </span>
              {s.promo && <span className="mt-1 block truncate text-[10px] font-semibold uppercase tracking-wider text-gold">{s.promo}</span>}
            </Link>
          ))}
        </div>
        <Link href="/courts" className="group mt-5 flex h-12 items-center justify-center gap-2 rounded-full bg-white text-[14px] font-semibold text-ink transition hover:bg-sage">
          Choose your court in 3D <ArrowRight size={16} className="transition group-hover:translate-x-1" />
        </Link>
      </div>
    </ChapterShell>
  );
}

function SipChapter() {
  const menu = useStore((s) => s.db.menu);
  const featured = useMemo(() => {
    const picks = ["spanish-latte", "tropical-sunset", "matcha-latte", "acai-bowl", "protein-shake", "strawberry-matcha", "avocado-toast", "flat-white", "quiche", "electrolyte"];
    return picks.map((id) => menu.find((m) => m.id === id)!).filter(Boolean);
  }, [menu]);
  return (
    <section id="sip" data-pose="cafe" data-zone="cafe" data-stagezone="cafe" className="relative h-[360vh]">
      <div className="sticky top-0 flex h-[100svh] flex-col justify-end overflow-hidden pb-28 pt-24 md:pb-14">
        <div className="px-4 md:px-10">
          <div data-fade className="flex items-center gap-3 text-white/80">
            <span className="font-display text-[13px] font-bold text-sage">02</span>
            <span className="h-px w-10 bg-white/40" />
            <span className="label-caps">Sip · specialty coffee</span>
          </div>
          <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <h2 data-split className="font-display text-[15vw] font-bold lowercase leading-[0.85] tracking-[-0.05em] text-white md:text-[6.4vw]">
              refuel your <span className="text-gold">energy.</span>
            </h2>
            <p data-fade className="max-w-sm text-[14.5px] leading-relaxed text-white/85">
              At the adjacent health café: order from your court and it lands before your water break ends. Or charge it to your suite.
            </p>
          </div>
        </div>
        <div data-track className="mt-7 flex w-max gap-4 px-4 md:gap-5 md:px-10">
          {featured.map((m, i) => (
            <Link
              key={m.id}
              href={`/cafe?item=${m.id}`}
              className="group relative flex h-[300px] w-[230px] shrink-0 flex-col justify-between overflow-hidden rounded-[30px] p-5 text-ink transition duration-500 hover:-translate-y-2 md:h-[380px] md:w-[290px]"
              style={{ background: `linear-gradient(160deg, hsl(${m.hue} 70% 86%) 0%, hsl(${(m.hue + 20) % 360} 62% 70%) 100%)` }}
            >
              <div className="flex items-center justify-between">
                <span className="label-caps text-ink/60">{String(i + 1).padStart(2, "0")}</span>
                {m.tags[0] && <span className="rounded-full bg-ink/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">{m.tags[0]}</span>}
              </div>
              <span className="pointer-events-none absolute -right-6 top-14 select-none text-[150px] leading-none drop-shadow-[0_20px_30px_rgba(0,0,0,0.25)] transition duration-700 group-hover:rotate-12 group-hover:scale-110 md:text-[190px]">
                {m.emoji}
              </span>
              <div className="relative">
                <p className="font-display text-[26px] font-bold lowercase leading-none tracking-tight">{m.name}</p>
                <p className="mt-2 line-clamp-2 text-[12.5px] text-ink/70">{m.description}</p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[18px] font-semibold tabular">${m.price.toFixed(2)}</span>
                  <span className="flex items-center gap-1 rounded-full bg-ink px-3 py-1.5 text-[11px] font-semibold text-white">
                    Order to court <ArrowUpRight size={12} />
                  </span>
                </div>
              </div>
            </Link>
          ))}
          <Link href="/cafe" className="flex h-[300px] w-[230px] shrink-0 flex-col items-center justify-center gap-3 rounded-[30px] border border-white/20 bg-white/5 text-center text-white backdrop-blur transition hover:bg-white/15 md:h-[380px] md:w-[290px]">
            <span className="font-display text-[30px] font-bold lowercase">the full menu</span>
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-ink"><ArrowRight size={18} /></span>
          </Link>
        </div>
      </div>
    </section>
  );
}

function SuitesChapter() {
  const packages = useStore((s) => s.db.packages);
  return (
    <ChapterShell id="suites" pose="suites" zone="suites" n="03" kicker="Bay Suites · Future experience" title={<>stay &amp;<br />play.</>}>
      <div className="glass rounded-[28px] p-5 md:p-6">
        <span data-fade className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-gold">
          Concept · a planned addition, not yet open
        </span>
        <p data-fade className="mt-3 text-[14.5px] leading-relaxed text-white/85">
          Sea Pods on the sand, court-side lofts and a villa with a plunge pool. Digital check-in, a smart key on your phone, and packages that bundle nights, court time and Sip credit.
        </p>
        <div data-stagger className="mt-4 grid grid-cols-2 gap-2">
          {packages.map((p) => (
            <Link key={p.id} href={`/stay?package=${p.id}`} className="group rounded-2xl border border-white/12 bg-white/6 p-3 transition hover:border-gold/50 hover:bg-gold/10">
              <p className="text-[13px] font-semibold leading-tight text-white">{p.name}</p>
              <p className="mt-1 text-[11px] leading-snug text-white/60">{p.tagline}</p>
              <p className="mt-2 text-[15px] font-semibold tabular text-gold">${p.price}</p>
            </Link>
          ))}
        </div>
        <Link href="/stay" className="group mt-5 flex h-12 items-center justify-center gap-2 rounded-full bg-white text-[14px] font-semibold text-ink transition hover:bg-gold">
          Explore Bay Suites <ArrowRight size={16} className="transition group-hover:translate-x-1" />
        </Link>
      </div>
    </ChapterShell>
  );
}

function ClubChapter() {
  return (
    <ChapterShell id="club" pose="club" zone="club" n="04" kicker="The Padel Bay Club" title={<>from rookie<br />to legend.</>}>
      <div className="glass rounded-[28px] p-5 md:p-6">
        <p data-fade className="text-[14.5px] leading-relaxed text-white/85">
          Four levels, four characters who grew up on this beach. Earn points on every booking and every Sip, unlock achievements, and watch your character evolve. Your skill rating lives separately: this is loyalty, not level.
        </p>
        <div data-stagger className="mt-4 grid grid-cols-4 gap-2">
          {TIERS.map((t) => (
            <Link key={t.id} href={`/club?tier=${t.id}`} className="group rounded-2xl border border-white/12 bg-white/6 p-2.5 text-center transition hover:bg-white/15">
              <span className="mx-auto block h-9 w-9 rounded-full shadow-[inset_0_-6px_12px_rgba(0,0,0,0.25)]" style={{ background: t.color }} />
              <span className="mt-2 block text-[12px] font-semibold text-white">{t.name}</span>
              <span className="block text-[10.5px] text-white/60">{t.character}</span>
              <span className="mt-1 block text-[10px] tabular text-white/45">{t.min ? `${t.min.toLocaleString()} pts` : "Day one"}</span>
            </Link>
          ))}
        </div>
        <Link href="/club" className="group mt-5 flex h-12 items-center justify-center gap-2 rounded-full bg-white text-[14px] font-semibold text-ink transition hover:bg-sage">
          Meet your character <ArrowRight size={16} className="transition group-hover:translate-x-1" />
        </Link>
      </div>
    </ChapterShell>
  );
}

function CommunityChapter() {
  const db = useStore((s) => s.db);
  const now = useNow(60_000);
  const matches = useMemo(() => db.matches.filter((m) => m.start > now && m.playerIds.length < 4).sort((a, b) => a.start - b.start).slice(0, 3), [db, now]);
  const tournaments = useMemo(() => db.tournaments.filter((t) => t.start > now).sort((a, b) => a.start - b.start).slice(0, 2), [db, now]);
  return (
    <ChapterShell id="community" pose="community" zone="community" n="05" kicker="Community" title={<>find your<br />four.</>}>
      <div className="glass rounded-[28px] p-5 md:p-6">
        <p data-fade className="text-[14.5px] leading-relaxed text-white/85">Open matches, AI matchmaking by level and play style, tournaments organised in minutes, and leaderboards that keep the tribe honest.</p>
        <div data-stagger className="mt-4 space-y-2">
          {matches.map((m) => {
            const host = db.customers.find((c) => c.id === m.hostId);
            return (
              <Link key={m.id} href="/community" className="flex items-center justify-between rounded-2xl border border-white/12 bg-white/6 px-3.5 py-2.5 transition hover:bg-white/12">
                <div>
                  <p className="text-[13px] font-semibold text-white">{fmtDayLabel(m.start, now)} · {fmtTime(m.start)} · {db.courts.find((c) => c.id === m.courtId)?.short}</p>
                  <p className="text-[11.5px] text-white/60">Hosted by {host?.name.split(" ")[0]} · level {m.level[0].toFixed(1)}–{m.level[1].toFixed(1)} ({skillLabel(m.level[0])})</p>
                </div>
                <div className="flex -space-x-1.5">
                  {Array.from({ length: 4 }, (_, i) => (
                    <span key={i} className={`h-6 w-6 rounded-full border-2 border-night ${i < m.playerIds.length ? "bg-sage" : "bg-white/10"}`} />
                  ))}
                </div>
              </Link>
            );
          })}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {tournaments.map((t) => (
            <Link key={t.id} href="/community?tab=tournaments" className="rounded-2xl bg-gradient-to-br from-sunset/30 to-transparent p-3 ring-1 ring-sunset/30 transition hover:ring-sunset/60">
              <p className="text-[12.5px] font-semibold leading-tight text-white">{t.name}</p>
              <p className="mt-1 text-[11px] text-white/60">in {Math.max(1, Math.round((t.start - now) / DAY))} days · {t.teams.length}/{t.maxTeams} teams</p>
            </Link>
          ))}
        </div>
        <Link href="/community" className="group mt-5 flex h-12 items-center justify-center gap-2 rounded-full bg-white text-[14px] font-semibold text-ink transition hover:bg-sage">
          Join the tribe <ArrowRight size={16} className="transition group-hover:translate-x-1" />
        </Link>
      </div>
    </ChapterShell>
  );
}

function ConciergeChapter() {
  const openConcierge = useFx((s) => s.openConcierge);
  const seed = "Book a court for 4 tomorrow at 8pm and two flat whites when we arrive";
  return (
    <section data-pose="sea" data-zone="" data-stagezone="overview" className="relative flex min-h-[130vh] items-center px-4 py-24 md:px-10">
      <div className="grid w-full items-center gap-10 lg:grid-cols-2">
        <div>
          <p data-fade className="label-caps text-white/75">AI concierge</p>
          <h2 data-split className="mt-3 font-display text-[16vw] font-bold lowercase leading-[0.85] tracking-[-0.05em] text-white md:text-[7vw]">
            ask the <span className="text-sage">bay.</span>
          </h2>
          <p data-fade className="mt-5 max-w-md text-[15px] leading-relaxed text-white/85">
            One conversation for courts, coffee, stays and the club. It checks live availability, prepares the booking and waits for your yes before anything is charged.
          </p>
          <button data-fade onClick={() => openConcierge(seed)} className="group mt-7 flex h-13 items-center gap-2 rounded-full bg-sage px-6 py-3.5 text-[14px] font-semibold text-ink transition hover:bg-white">
            Try it now <ArrowUpRight size={17} className="transition group-hover:rotate-45" />
          </button>
        </div>
        <div data-stagger className="glass mx-auto w-full max-w-md space-y-3 rounded-[30px] p-5">
          <div className="ml-auto w-fit max-w-[85%] rounded-[20px] rounded-br-md bg-white px-4 py-3 text-[13.5px] text-ink">{seed}?</div>
          <div className="w-fit max-w-[90%] rounded-[20px] rounded-bl-md bg-white/10 px-4 py-3 text-[13.5px] text-white/90">
            Court 3 is free tomorrow 20:00–21:30, sea side, $45. I&apos;ll have two flat whites at the court gate for 20:05.
            <div className="mt-3 rounded-2xl border border-white/15 bg-ink/40 p-3">
              <p className="text-[12px] text-white/60">Prepared · waiting for your confirmation</p>
              <p className="mt-1 text-[13px] font-semibold">Court 3 · 90 min · 4 players</p>
              <p className="text-[12px] text-white/70">+ 2× Flat White → Court 3</p>
              <div className="mt-2.5 flex gap-2">
                <span className="rounded-full bg-sage px-3 py-1.5 text-[11.5px] font-semibold text-ink">Confirm & pay $54</span>
                <span className="rounded-full border border-white/20 px-3 py-1.5 text-[11.5px]">Change</span>
              </div>
            </div>
          </div>
          <p className="text-center text-[10.5px] uppercase tracking-[0.18em] text-white/45">Simulated AI · demo logic, no external model</p>
        </div>
      </div>
    </section>
  );
}

function CommandChapter() {
  return (
    <section data-pose="command" data-zone="" data-stagezone="command" className="relative px-3 py-20 md:px-6">
      <div className="relative overflow-hidden rounded-[36px] bg-ink/85 px-6 py-14 backdrop-blur-xl md:px-14 md:py-20">
        <div data-parallax="-12" className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-teal/40 blur-3xl" />
        <div data-parallax="10" className="pointer-events-none absolute -bottom-32 left-10 h-80 w-80 rounded-full bg-sunset/20 blur-3xl" />
        <p data-fade className="label-caps text-sage">For the Padel Bay team</p>
        <h2 data-split className="mt-3 max-w-4xl font-display text-[12vw] font-bold lowercase leading-[0.88] tracking-[-0.05em] text-white md:text-[5.6vw]">
          the bay, from the control room.
        </h2>
        <div data-stagger className="mt-10 grid gap-3 md:grid-cols-3">
          {[
            ["Click a court", "Schedule, bookings, utilization, maintenance and revenue, on the court itself."],
            ["Click the café", "The live kitchen queue, menu switches, inventory and sales for Sip."],
            ["Click a suite", "Reservations, housekeeping, guest registration and digital keys."],
          ].map(([t, d]) => (
            <div key={t} className="rounded-[24px] border border-white/10 bg-white/5 p-5">
              <p className="text-[15px] font-semibold text-white">{t}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-white/65">{d}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Link href="/command" className="group flex h-13 items-center gap-2 rounded-full bg-white px-6 py-3.5 text-[14px] font-semibold text-ink transition hover:bg-sage">
            Open the 3D Command Center <ArrowUpRight size={17} className="transition group-hover:rotate-45" />
          </Link>
          <span className="text-[12.5px] text-white/55">CRM · forecasting · automations · access logs · AI briefings</span>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer data-pose="hero" data-zone="" data-stagezone="intro" className="relative px-3 pb-28 pt-10 md:px-6 md:pb-6">
      <div className="relative overflow-hidden rounded-[36px] bg-sage px-6 py-14 text-ink md:px-14 md:py-20">
        <svg className="pointer-events-none absolute -right-20 -top-10 h-[130%] opacity-25" viewBox="0 0 400 400" fill="none">
          <circle cx="200" cy="200" r="170" stroke="#f7f2ea" strokeWidth="46" />
          <path d="M60 110 C 170 170, 170 230, 70 300 M340 100 C 230 160, 230 240, 330 300" stroke="#f7f2ea" strokeWidth="26" strokeLinecap="round" />
        </svg>
        <p data-split className="relative font-display text-[17vw] font-bold lowercase leading-[0.82] tracking-[-0.05em] md:text-[9vw]">felt the vibe?</p>
        <p data-fade className="relative mt-4 max-w-xl font-display text-[6vw] lowercase leading-tight text-ink/80 md:text-[2.4vw]">book your court today &amp; join the tribe</p>
        <div className="relative mt-12 grid gap-8 md:grid-cols-4">
          <div>
            <Logo className="w-44" tone="teal" />
            <p className="mt-3 text-[13px] text-ink/70">{VENUE.motto}</p>
          </div>
          <div className="space-y-2 text-[13.5px]">
            <p className="label-caps text-ink/60">Contact</p>
            <a href={`mailto:${VENUE.email}`} className="flex items-center gap-2 hover:underline"><Mail size={14} /> {VENUE.email}</a>
            <a href="tel:+96171418997" className="flex items-center gap-2 hover:underline"><Phone size={14} /> {VENUE.phone}</a>
          </div>
          <div className="space-y-2 text-[13.5px]">
            <p className="label-caps text-ink/60">Location</p>
            <p className="flex items-start gap-2"><MapPin size={14} className="mt-0.5 shrink-0" /> Farid Trad Street, Ramlet El Baida, Beirut</p>
            <a href={VENUE.instagram} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:underline"><AtSign size={14} /> @padelbaycourts</a>
          </div>
          <div className="flex flex-col gap-2">
            <Link href="/courts" className="flex h-12 items-center justify-center rounded-full bg-ink text-[14px] font-semibold text-white transition hover:bg-teal">Book your spot today</Link>
            <Link href="/command" className="flex h-12 items-center justify-center rounded-full border border-ink/30 text-[13px] font-semibold transition hover:bg-ink/10">Staff back office</Link>
          </div>
        </div>
        <p className="relative mt-12 border-t border-ink/15 pt-5 text-[11.5px] leading-relaxed text-ink/60">
          Concept demo by Brains AI Solutions. The 3D venue is a conceptual digital twin (layout and court count not surveyed) and will be replaced by an accurate model. Bay Suites are a planned addition. AI features are simulated with demo logic. Prices are illustrative.
        </p>
      </div>
    </footer>
  );
}
