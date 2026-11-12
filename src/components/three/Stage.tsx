"use client";

import { Html } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { orderStage } from "@/lib/actions";
import { TIERS } from "@/lib/catalog";
import { useNow } from "@/lib/hooks";
import { pick, useStage } from "@/lib/stage";
import { useStore } from "@/lib/store";
import type { DB, TierId } from "@/lib/types";
import { MIN, fmtTime } from "@/lib/time";
import { ClubDeck, Hall, LOCKER_SITE, LockerPavilion, PEDESTALS, SipPavilion } from "./Buildings";
import { lockerLive } from "@/lib/ops";
import { Character } from "./Characters";
import { Court, type CourtState } from "./Court";
import { POSES, rig } from "./rig";
import { World } from "./World";

export const COURT_POS: Record<string, [number, number, number]> = {
  c1: [16, 0, 0],
  c2: [28, 0, 0],
  c3: [-10, 0, 0],
  c4: [2, 0, 0],
};

export function courtLive(db: DB, courtId: string, now: number) {
  const court = db.courts.find((c) => c.id === courtId)!;
  const list = db.bookings
    .filter((b) => b.courtId === courtId && b.status === "confirmed" && b.start + b.durationMin * MIN > now)
    .sort((a, b) => a.start - b.start);
  const current = list.find((b) => b.start <= now);
  const next = list.find((b) => b.start > now);
  let state: CourtState = "free";
  if (court.status === "maintenance" || current?.kind === "maintenance") state = "maintenance";
  else if (current) state = "play";
  else if (next && next.start - now < 30 * MIN) state = "soon";
  const label =
    state === "maintenance"
      ? "Maintenance"
      : state === "play"
        ? `In play · until ${fmtTime(current!.start + current!.durationMin * MIN)}`
        : next
          ? `Free until ${fmtTime(next.start)}`
          : "Free all evening";
  return { court, state, current, next, label };
}

function Rig() {
  const { camera, size, gl } = useThree();
  const inset = useStage((s) => s.inset);
  const interactive = useStage((s) => s.interactive);
  const pointer = useRef({ x: 0, y: 0 });
  const cur = useRef({ pos: new THREE.Vector3(rig.px, rig.py, rig.pz), look: new THREE.Vector3(rig.tx, rig.ty, rig.tz), off: "" });

  useEffect(() => {
    const el = gl.domElement;
    let drag: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      if (interactive) drag = { x: e.clientX, y: e.clientY };
    };
    const move = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
      if (!drag) return;
      rig.yaw -= (e.clientX - drag.x) * 0.0045;
      rig.pitch = Math.max(-0.4, Math.min(0.55, rig.pitch + (e.clientY - drag.y) * 0.003));
      drag = { x: e.clientX, y: e.clientY };
    };
    const up = () => (drag = null);
    const wheel = (e: WheelEvent) => {
      if (!interactive) return;
      e.preventDefault();
      rig.zoom = Math.max(0.35, Math.min(1.8, rig.zoom * (1 + e.deltaY * 0.0012)));
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      el.removeEventListener("wheel", wheel);
    };
  }, [gl, interactive]);

  const tmp = useMemo(() => ({ look: new THREE.Vector3(), off: new THREE.Vector3(), pos: new THREE.Vector3(), axis: new THREE.Vector3() }), []);
  useFrame((_, dt) => {
    const k = rig.snap ? 1 : 1 - Math.exp(-Math.min(dt, 0.25) * 3.4);
    rig.snap = false;
    const aspect = size.width / Math.max(1, size.height);
    const boost = aspect < 1 ? Math.min(1.9, Math.pow(1 / aspect, 0.75)) : 1;
    tmp.look.set(rig.tx, rig.ty, rig.tz);
    tmp.off.set(rig.px - rig.tx, rig.py - rig.ty, rig.pz - rig.tz);
    tmp.off.applyAxisAngle(THREE.Object3D.DEFAULT_UP, rig.yaw);
    tmp.axis.set(-tmp.off.z, 0, tmp.off.x).normalize();
    tmp.off.applyAxisAngle(tmp.axis, -rig.pitch);
    if (tmp.off.y < 2) tmp.off.y = 2;
    tmp.off.multiplyScalar(rig.zoom * boost);
    tmp.pos.copy(tmp.look).add(tmp.off);
    const par = interactive ? 0.6 : 1.6;
    tmp.pos.x += pointer.current.x * par;
    tmp.pos.y -= pointer.current.y * par * 0.4;
    cur.current.pos.lerp(tmp.pos, k);
    cur.current.look.lerp(tmp.look, k);
    camera.position.copy(cur.current.pos);
    camera.lookAt(cur.current.look);

    const key = `${size.width}x${size.height}:${inset.right}:${inset.bottom}`;
    if (key !== cur.current.off) {
      cur.current.off = key;
      const cam = camera as THREE.PerspectiveCamera;
      if (inset.right || inset.bottom) cam.setViewOffset(size.width, size.height, inset.right / 2, inset.bottom / 2, size.width, size.height);
      else cam.clearViewOffset();
    }
  });
  return null;
}

function Label({ position, title, sub, tone = "#82be9d", onClick, active }: { position: [number, number, number]; title: string; sub?: string; tone?: string; onClick?: () => void; active?: boolean }) {
  return (
    <Html position={position} center zIndexRange={[10, 0]} style={{ pointerEvents: onClick ? "auto" : "none" }}>
      <button
        onClick={onClick}
        className={`group flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-left text-white shadow-xl backdrop-blur-xl transition ${active ? "border-white/50 bg-white/25" : "border-white/15 bg-black/35 hover:bg-white/20"}`}
      >
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: tone }} />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: tone }} />
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-[12px] font-semibold">{title}</span>
          {sub && <span className="text-[10.5px] text-white/70">{sub}</span>}
        </span>
      </button>
    </Html>
  );
}

const TONE: Record<CourtState, string> = { free: "#82be9d", play: "#f28a3b", soon: "#f6b26b", maintenance: "#ef6b5b" };

function Scene() {
  const db = useStore((s) => s.db);
  const hydrated = useStore((s) => s.hydrated);
  const { mode, zone, focusId, hovered, quality, set } = useStage();
  const now = useNow(20_000);
  const night = mode === "ops";
  const ops = mode === "ops";

  const courts = useMemo(() => Object.keys(COURT_POS).map((id) => courtLive(db, id, now)), [db, now]);
  const lockers = useMemo(() => db.lockers.map((l) => ({ id: l.id, number: l.number, bank: l.bank, state: lockerLive(db, l, now).state })), [db, now]);
  const activeKeys = lockers.filter((l) => l.state === "active").length;
  const queue = useMemo(() => db.orders.filter((o) => !["delivered", "cancelled"].includes(orderStage(o, now))).length, [db, now]);

  const showCourtLabels = hydrated && ["courts", "court", "command", "community", "overview"].includes(zone);
  const showLockerLabel = hydrated && ["lockers", "command", "courts", "overview"].includes(zone);
  const cutaway = ["courts", "court", "command", "community"].includes(zone);

  return (
    <>
      <World night={night} quality={quality} />
      <Hall cutaway={cutaway} night={night} />
      {courts.map(({ court, state }) => (
        <group key={court.id} position={COURT_POS[court.id]}>
          <Court
            indoor={court.type === "indoor"}
            state={hydrated ? state : "free"}
            selected={focusId === court.id && (zone === "court" || zone === "command")}
            hovered={hovered === court.id}
            night={night}
            onSelect={() => pick("court", court.id)}
            onHover={(on) => set({ hovered: on ? court.id : undefined })}
          />
        </group>
      ))}
      <SipPavilion
        selected={zone === "cafe" || (ops && focusId === "cafe")}
        night={night}
        onSelect={() => pick("cafe", "cafe")}
        onHover={(on) => set({ hovered: on ? "cafe" : undefined })}
      />
      <ClubDeck night={night} active={zone === "club"} />
      {PEDESTALS.map((p) => (
        <group key={p.id} position={[p.x, 0.4 + p.h, p.z]} rotation={[0, -0.25 + (p.x - 13) * -0.03, 0]}>
          <Character tier={p.id as TierId} scale={p.id === "legend" ? 1.15 : 1} selected={zone === "club" && focusId === p.id} onSelect={() => pick("tier", p.id)} />
        </group>
      ))}
      <LockerPavilion
        lockers={lockers}
        focusId={zone === "lockers" || ops ? focusId : undefined}
        night={night}
        onSelect={(id) => pick("locker", id)}
        onHover={(id, on) => set({ hovered: on ? id : undefined })}
      />

      {showCourtLabels &&
        courts.map(({ court, state, label }) => {
          const [x, , z] = COURT_POS[court.id];
          return (
            <Label
              key={court.id}
              position={[x, 6.4, z - 8]}
              title={ops ? court.short : court.name}
              sub={label}
              tone={TONE[state]}
              active={focusId === court.id}
              onClick={() => pick("court", court.id)}
            />
          );
        })}
      {hydrated && (zone === "cafe" || ops || zone === "overview") && (
        <Label position={[-9, 8, 24]} title="Sip café" sub={ops ? `${queue} order${queue === 1 ? "" : "s"} in the kitchen` : "Specialty coffee · open till midnight"} tone="#c46a3a" onClick={() => pick("cafe", "cafe")} active={focusId === "cafe"} />
      )}
      {showLockerLabel && (
        <Label
          position={[LOCKER_SITE[0], 5.6, LOCKER_SITE[2]]}
          title="Kit lockers"
          sub={ops ? `${activeKeys} key${activeKeys === 1 ? "" : "s"} active · ${lockers.filter((l) => l.state === "check").length} to check` : "Rackets & balls · opens with your key"}
          tone="#3fd6c8"
          onClick={() => pick("locker", "all")}
          active={zone === "lockers"}
        />
      )}
      {hydrated && zone === "club" &&
        PEDESTALS.map((p) => {
          const t = TIERS.find((x) => x.id === p.id)!;
          return <Label key={p.id} position={[p.x, 0.4 + p.h + 2.6, p.z]} title={t.name} sub={t.character} tone={t.color} active={focusId === p.id} onClick={() => pick("tier", p.id)} />;
        })}
      <Rig />
    </>
  );
}

export default function Stage({ className = "" }: { className?: string }) {
  const quality = useStage((s) => s.quality);
  const interactive = useStage((s) => s.interactive);
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") (window as unknown as Record<string, unknown>).__pb = { rig, POSES, useStage };
  }, []);
  return (
    <div className={className} style={{ touchAction: interactive ? "none" : "auto" }}>
      <Canvas
        shadows={quality === "high" ? "percentage" : false}
        dpr={[1, quality === "high" ? 1.75 : 1.25]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ fov: 38, near: 0.5, far: 6000, position: [rig.px, rig.py, rig.pz] }}
        onPointerMissed={() => pick("hall", "none")}
        style={{ pointerEvents: interactive ? "auto" : "none" }}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
    </div>
  );
}
