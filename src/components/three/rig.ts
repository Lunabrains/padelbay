import gsap from "gsap";

// Jump to the right moment after a stall instead of slowing down (tab switches, throttled previews).
gsap.ticker.lagSmoothing(0);

// The camera follows this mutable pose. GSAP (scroll story and zone transitions) writes to it,
// the Rig component damps the real camera toward it every frame.

export interface Pose {
  px: number;
  py: number;
  pz: number;
  tx: number;
  ty: number;
  tz: number;
}

export const rig: Pose & { yaw: number; pitch: number; zoom: number; snap: boolean } = {
  px: 150, py: 90, pz: -86, tx: -60, ty: 0, tz: 26,
  yaw: 0, pitch: 0, zoom: 1, snap: false,
};

export const POSES: Record<string, Pose> = {
  // looking west over the venue into the Mediterranean sunset
  intro: { px: 150, py: 90, pz: -86, tx: -60, ty: 0, tz: 26 },
  hero: { px: 92, py: 34, pz: -40, tx: -34, ty: 0, tz: 12 },
  overview: { px: -58, py: 48, pz: 62, tx: 8, ty: 0, tz: 0 },
  courts: { px: -42, py: 50, pz: 50, tx: 8, ty: 0, tz: -3 },
  c1: { px: 16, py: 21, pz: 30, tx: 16, ty: 0, tz: 1 },
  c2: { px: 28, py: 21, pz: 30, tx: 28, ty: 0, tz: 1 },
  c3: { px: -10, py: 17, pz: 27, tx: -10, ty: 0, tz: 1 },
  c4: { px: 2, py: 17, pz: 27, tx: 2, ty: 0, tz: 1 },
  cafe: { px: -30, py: 11, pz: 45, tx: -5, ty: 2.5, tz: 24 },
  club: { px: 12, py: 8.5, pz: 47, tx: 13.3, ty: 2.2, tz: 25 },
  lockers: { px: -6, py: 7.5, pz: -5, tx: -4, ty: 1.4, tz: -21 },
  community: { px: -18, py: 26, pz: 36, tx: -4, ty: 0, tz: 0 },
  command: { px: -38, py: 74, pz: 64, tx: 9, ty: 0, tz: 0 },
  sea: { px: -120, py: 6, pz: 30, tx: -40, ty: 6, tz: 0 },
};

let current: gsap.core.Tween | null = null;

export function flyTo(pose: Pose, opts: { duration?: number; reduced?: boolean } = {}) {
  current?.kill();
  const duration = opts.reduced ? 0 : (opts.duration ?? 1.8);
  current = gsap.to(rig, { ...pose, yaw: 0, pitch: 0, zoom: 1, duration, ease: "power3.inOut", overwrite: true });
}

export function killFly() {
  current?.kill();
  current = null;
}

export function setPose(pose: Pose) {
  current?.kill();
  Object.assign(rig, pose);
}

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const l = (x: number, y: number) => x + (y - x) * t;
  return { px: l(a.px, b.px), py: l(a.py, b.py), pz: l(a.pz, b.pz), tx: l(a.tx, b.tx), ty: l(a.ty, b.ty), tz: l(a.tz, b.tz) };
}
