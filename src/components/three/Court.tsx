"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { mats } from "./materials";

export type CourtState = "free" | "play" | "maintenance" | "soon";

const STATE_COLOR: Record<CourtState, string> = {
  free: "#82be9d",
  play: "#f28a3b",
  soon: "#f6b26b",
  maintenance: "#ef6b5b",
};

// Official padel court: 20 m × 10 m, glass back walls 3 m with 1 m mesh above,
// stepped side glass (3 m then 2 m) and 3 m mesh along the middle of the sides.
export function Court({
  indoor,
  state,
  selected,
  hovered,
  night,
  onSelect,
  onHover,
}: {
  indoor: boolean;
  state: CourtState;
  selected: boolean;
  hovered: boolean;
  night: boolean;
  onSelect?: () => void;
  onHover?: (on: boolean) => void;
}) {
  const m = mats();
  const frame = useRef<THREE.Group>(null);
  const glow = useMemo(() => new THREE.MeshBasicMaterial({ color: STATE_COLOR[state], transparent: true, opacity: 0.9, toneMapped: false }), [state]);
  const sheet = useMemo(
    () => new THREE.MeshBasicMaterial({ color: STATE_COLOR[state], transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    [state],
  );

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const on = selected || hovered;
    const target = selected ? 0.16 + Math.sin(t * 3) * 0.05 : hovered ? 0.1 : 0;
    sheet.opacity += (target - sheet.opacity) * 0.12;
    glow.opacity = on ? 0.95 : state === "free" ? 0.35 : 0.55;
    if (frame.current) frame.current.position.y = 0.23 + (selected ? Math.sin(t * 3) * 0.02 : 0);
  });

  const posts = useMemo(() => {
    const p: [number, number, number, number][] = [];
    for (const z of [-10, 10]) for (let x = -5; x <= 5; x += 2) p.push([x, z, 4, 0]);
    for (const x of [-5, 5]) for (let z = -8; z <= 8; z += 2) p.push([x, z, Math.abs(z) >= 8 ? 3 : 3, 0]);
    return p;
  }, []);

  return (
    <group
      onClick={(e) => {
        if (e.delta > 6) return;
        e.stopPropagation();
        onSelect?.();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover?.(true);
        document.body.style.cursor = onSelect ? "pointer" : "";
      }}
      onPointerOut={() => {
        onHover?.(false);
        document.body.style.cursor = "";
      }}
    >
      {/* slab and turf */}
      <mesh position={[0, 0.1, 0]} receiveShadow castShadow material={m.slab}>
        <boxGeometry args={[11.4, 0.2, 21.4]} />
      </mesh>
      <mesh position={[0, 0.205, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={indoor ? m.turfIndoor : m.turfOutdoor}>
        <planeGeometry args={[10, 20]} />
      </mesh>
      {/* lines */}
      {[-6.95, 6.95].map((z) => (
        <mesh key={z} position={[0, 0.215, z]} material={m.lines}>
          <boxGeometry args={[10, 0.01, 0.05]} />
        </mesh>
      ))}
      <mesh position={[0, 0.215, 0]} material={m.lines}>
        <boxGeometry args={[0.05, 0.01, 13.9]} />
      </mesh>
      {/* net */}
      <mesh position={[0, 0.66, 0]} material={m.netMat}>
        <planeGeometry args={[10, 0.9]} />
      </mesh>
      <mesh position={[0, 1.1, 0]} material={m.white}>
        <boxGeometry args={[10.1, 0.06, 0.04]} />
      </mesh>
      {[-5.2, 5.2].map((x) => (
        <mesh key={x} position={[x, 0.7, 0]} material={m.steel}>
          <cylinderGeometry args={[0.05, 0.05, 1.0, 8]} />
        </mesh>
      ))}
      {/* back walls: glass + mesh */}
      {[-10, 10].map((z) => (
        <group key={z} position={[0, 0.2, z]}>
          <mesh position={[0, 1.5, 0]} material={m.glass}>
            <planeGeometry args={[10, 3]} />
          </mesh>
          <mesh position={[0, 3.5, 0]} material={m.mesh}>
            <planeGeometry args={[10, 1]} />
          </mesh>
          <mesh position={[0, 4, 0]} material={m.steel}>
            <boxGeometry args={[10.1, 0.06, 0.06]} />
          </mesh>
        </group>
      ))}
      {/* side walls: stepped glass, mesh in the middle */}
      {[-5, 5].map((x) => (
        <group key={x} position={[x, 0.2, 0]} rotation={[0, Math.PI / 2, 0]}>
          {[-9, 9].map((z) => (
            <mesh key={`g3${z}`} position={[z, 1.5, 0]} material={m.glass}>
              <planeGeometry args={[2, 3]} />
            </mesh>
          ))}
          {[-7, 7].map((z) => (
            <mesh key={`g2${z}`} position={[z, 1, 0]} material={m.glass}>
              <planeGeometry args={[2, 2]} />
            </mesh>
          ))}
          <mesh position={[0, 1.5, 0]} material={m.mesh}>
            <planeGeometry args={[12, 3]} />
          </mesh>
          <mesh position={[0, 3, 0]} material={m.steel}>
            <boxGeometry args={[12.1, 0.05, 0.05]} />
          </mesh>
        </group>
      ))}
      {posts.map(([x, z, h], i) => (
        <mesh key={i} position={[x, 0.2 + h / 2, z]} material={m.steel} castShadow>
          <boxGeometry args={[0.09, h, 0.09]} />
        </mesh>
      ))}
      {/* light masts */}
      {[[-5.7, -9.4], [5.7, -9.4], [-5.7, 9.4], [5.7, 9.4], [-5.7, 0], [5.7, 0]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, indoor ? 4.6 : 3.4, 0]} material={m.steel}>
            <boxGeometry args={[0.08, indoor ? 0.2 : 6.8, 0.08]} />
          </mesh>
          <mesh position={[x > 0 ? -0.25 : 0.25, indoor ? 7.4 : 6.8, 0]} rotation={[0, 0, x > 0 ? -0.5 : 0.5]}>
            <boxGeometry args={[0.6, 0.08, 0.35]} />
            <meshStandardMaterial color="#e9f6ff" emissive="#f3fbff" emissiveIntensity={night ? 3 : 0.15} toneMapped={!night} />
          </mesh>
        </group>
      ))}
      {night && <pointLight position={[0, 7, 0]} intensity={60} distance={26} color="#e8f6ff" decay={1.6} />}
      {/* selection frame */}
      <group ref={frame} position={[0, 0.23, 0]}>
        {[
          [0, -10.25, 10.6, 0.12],
          [0, 10.25, 10.6, 0.12],
          [-5.25, 0, 0.12, 20.6],
          [5.25, 0, 0.12, 20.6],
        ].map(([x, z, w, d], i) => (
          <mesh key={i} position={[x, 0, z]} material={glow}>
            <boxGeometry args={[w, 0.04, d]} />
          </mesh>
        ))}
        <mesh position={[0, 2.2, -10.3]} material={sheet}>
          <planeGeometry args={[10.6, 4.4]} />
        </mesh>
        <mesh position={[0, 2.2, 10.3]} material={sheet}>
          <planeGeometry args={[10.6, 4.4]} />
        </mesh>
      </group>
      {state === "play" && <Players />}
      {state === "maintenance" && <MaintenanceCones />}
    </group>
  );
}

const SHIRTS = ["#f28a3b", "#82be9d", "#f7f2ea", "#235c62"];

function Players() {
  const refs = useRef<(THREE.Group | null)[]>([]);
  const ball = useRef<THREE.Mesh>(null);
  const seeds = useMemo(() => [0, 1, 2, 3].map((i) => ({ x: i % 2 ? 2.4 : -2.4, z: i < 2 ? -6 : 6, ph: i * 1.7 })), []);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    seeds.forEach((s, i) => {
      const g = refs.current[i];
      if (!g) return;
      g.position.x = s.x + Math.sin(t * 1.3 + s.ph) * 1.6;
      g.position.z = s.z + Math.cos(t * 0.9 + s.ph) * 1.2;
      g.position.y = 0.2 + Math.abs(Math.sin(t * 4 + s.ph)) * 0.08;
      g.rotation.y = s.z > 0 ? Math.PI : 0;
    });
    if (ball.current) {
      const p = (Math.sin(t * 1.1) + 1) / 2;
      ball.current.position.set(Math.sin(t * 0.7) * 3, 0.4 + Math.abs(Math.sin(t * 3.3)) * 2.2, -7 + p * 14);
    }
  });
  return (
    <group>
      {seeds.map((s, i) => (
        <group key={i} ref={(el) => (refs.current[i] = el)} position={[s.x, 0.2, s.z]}>
          <mesh position={[0, 0.95, 0]} castShadow>
            <capsuleGeometry args={[0.28, 0.9, 4, 10]} />
            <meshStandardMaterial color={SHIRTS[i]} roughness={0.7} />
          </mesh>
          <mesh position={[0, 1.78, 0]} castShadow>
            <sphereGeometry args={[0.2, 14, 14]} />
            <meshStandardMaterial color="#c99b7a" roughness={0.6} />
          </mesh>
          <mesh position={[0.42, 1.2, 0.1]} rotation={[0.3, 0, -0.5]}>
            <cylinderGeometry args={[0.22, 0.22, 0.04, 16]} />
            <meshStandardMaterial color="#111a1c" />
          </mesh>
        </group>
      ))}
      <mesh ref={ball}>
        <sphereGeometry args={[0.11, 12, 12]} />
        <meshStandardMaterial color="#d8f25a" emissive="#c9ef3a" emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
}

function MaintenanceCones() {
  return (
    <group>
      {[[-3, -4], [3, 4], [0, -8]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.55, z]} castShadow>
          <coneGeometry args={[0.28, 0.7, 12]} />
          <meshStandardMaterial color="#ef6b5b" emissive="#ef6b5b" emissiveIntensity={0.3} />
        </mesh>
      ))}
    </group>
  );
}
