"use client";

import { RoundedBox, useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { mats } from "./materials";

function hoverProps(onSelect?: () => void, onHover?: (on: boolean) => void) {
  return {
    onClick: (e: { delta: number; stopPropagation: () => void }) => {
      if (e.delta > 6 || !onSelect) return;
      e.stopPropagation();
      onSelect();
    },
    onPointerOver: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      onHover?.(true);
      if (onSelect) document.body.style.cursor = "pointer";
    },
    onPointerOut: () => {
      onHover?.(false);
      document.body.style.cursor = "";
    },
  };
}

// ---------------------------------------------------------------------------
// The Hall: indoor courts 1 and 2 behind the dark diagrid facade.
// Conceptual massing only: the real building plan has not been surveyed.
// ---------------------------------------------------------------------------
export function Hall({ cutaway, night }: { cutaway: boolean; night: boolean }) {
  const m = mats();
  const logo = useTexture("/brand/padelbay-logo.webp");
  const roof = useMemo(() => new THREE.MeshPhysicalMaterial({ color: "#eef5f2", roughness: 0.2, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }), []);
  const walls = useRef<THREE.Group>(null);
  useFrame(() => {
    const target = cutaway ? 0.04 : 0.5;
    roof.opacity += (target - roof.opacity) * 0.08;
    if (walls.current) {
      const s = cutaway ? 0.5 : 1;
      walls.current.scale.y += (s - walls.current.scale.y) * 0.08;
    }
  });
  const W = 25.4;
  const D = 25.4;
  const H = 9;
  return (
    <group position={[22, 0, 0]}>
      <mesh position={[0, 0.05, 0]} receiveShadow material={m.stone}>
        <boxGeometry args={[W + 1, 0.1, D + 1]} />
      </mesh>
      <group ref={walls}>
        {/* diagrid skin */}
        <mesh position={[0, H / 2, -D / 2]} material={m.lattice}>
          <planeGeometry args={[W, H]} />
        </mesh>
        <mesh position={[0, H / 2, D / 2]} material={m.lattice}>
          <planeGeometry args={[W, H]} />
        </mesh>
        <mesh position={[-W / 2, H / 2, 0]} rotation={[0, Math.PI / 2, 0]} material={m.lattice}>
          <planeGeometry args={[D, H]} />
        </mesh>
        <mesh position={[W / 2, H / 2, 0]} rotation={[0, Math.PI / 2, 0]} material={m.lattice}>
          <planeGeometry args={[D, H]} />
        </mesh>
        {/* inner glass skin */}
        <mesh position={[0, H / 2, D / 2 - 0.4]} material={m.glassTint}>
          <planeGeometry args={[W - 1, H]} />
        </mesh>
        <mesh position={[-W / 2 + 0.4, H / 2, 0]} rotation={[0, Math.PI / 2, 0]} material={m.glassTint}>
          <planeGeometry args={[D - 1, H]} />
        </mesh>
        {/* corner columns */}
        {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
          <mesh key={i} position={[(sx * W) / 2, H / 2, (sz * D) / 2]} material={m.steel} castShadow>
            <boxGeometry args={[0.45, H, 0.45]} />
          </mesh>
        ))}
      </group>
      {/* roof with beams */}
      <mesh position={[0, H + 0.15, 0]} material={roof}>
        <boxGeometry args={[W + 0.6, 0.25, D + 0.6]} />
      </mesh>
      {!cutaway &&
        [-10, -5, 0, 5, 10].map((x) => (
          <mesh key={x} position={[x, H + 0.35, 0]} material={m.steel}>
            <boxGeometry args={[0.25, 0.3, D + 0.6]} />
          </mesh>
        ))}
      {/* timber entrance canopy facing the café */}
      <mesh position={[-4, 3.4, D / 2 + 1.4]} material={m.timber} castShadow>
        <boxGeometry args={[9, 0.35, 3]} />
      </mesh>
      {/* the official wordmark on the sea-facing facade */}
      <mesh position={[-W / 2 - 0.08, H - 2.2, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[14, 14 * (338 / 1419)]} />
        <meshBasicMaterial map={logo} transparent toneMapped={false} color={night ? "#d7ffe9" : "#ffffff"} />
      </mesh>
      {night && <pointLight position={[0, 7, 0]} intensity={30} distance={40} color="#bff3ff" />}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Sip café pavilion, modelled on the timber-ribbon render on padelbaycourts.com.
// ---------------------------------------------------------------------------
export function SipPavilion({ selected, night, onSelect, onHover }: { selected: boolean; night: boolean; onSelect?: () => void; onHover?: (on: boolean) => void }) {
  const m = mats();
  const ribbon = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(17.4, 0);
    s.lineTo(11.6, 5.6);
    s.quadraticCurveTo(11.1, 6.1, 10.4, 6.1);
    s.lineTo(1.0, 6.1);
    s.quadraticCurveTo(0.2, 6.1, 0.2, 5.6);
    s.quadraticCurveTo(0.25, 5.65, 1.0, 5.65);
    s.lineTo(10.2, 5.65);
    s.quadraticCurveTo(10.8, 5.65, 11.1, 5.3);
    s.lineTo(16.75, 0);
    s.lineTo(17.4, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: 8.5, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2, curveSegments: 18 });
    g.computeVertexNormals();
    return g;
  }, []);
  const halo = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (halo.current) halo.current.opacity = selected ? 0.35 + Math.sin(clock.getElapsedTime() * 3) * 0.15 : 0;
  });
  return (
    <group position={[-5, 0, 24]} {...hoverProps(onSelect, onHover)}>
      {/* terrace */}
      <mesh position={[0, 0.25, 0]} receiveShadow castShadow material={m.pebble}>
        <boxGeometry args={[18, 0.5, 11]} />
      </mesh>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[9.5, 10.2, 64]} />
        <meshBasicMaterial ref={halo} color="#82be9d" transparent opacity={0} toneMapped={false} />
      </mesh>
      {/* glass balustrade */}
      {[
        [0, -5.5, 18, 0],
        [-9, 0, 11, Math.PI / 2],
        [3, 5.5, 12, 0],
      ].map(([x, z, w, r], i) => (
        <mesh key={i} position={[x, 1.05, z]} rotation={[0, r, 0]} material={m.glass}>
          <planeGeometry args={[w, 1.1]} />
        </mesh>
      ))}
      {/* timber ribbon */}
      <mesh geometry={ribbon} material={m.timber} position={[-8.4, 0.5, -4.25]} castShadow receiveShadow />
      {/* slender white columns */}
      {[-7.6, -4.4, -1.4].flatMap((x) => [-3.7, 3.7].map((z) => [x, z])).map(([x, z], i) => (
        <mesh key={i} position={[x, 3.33, z]} material={m.white} castShadow>
          <cylinderGeometry args={[0.09, 0.09, 5.66, 10]} />
        </mesh>
      ))}
      {/* the café volume */}
      <mesh position={[-4.5, 2.1, 0]} material={m.glassTint}>
        <boxGeometry args={[6.5, 3.2, 6]} />
      </mesh>
      <mesh position={[-4.5, 1.05, 1.2]} material={m.white} castShadow>
        <boxGeometry args={[4.6, 1.1, 0.8]} />
      </mesh>
      <mesh position={[-4.5, 2.6, -2.9]}>
        <planeGeometry args={[3.6, 1.2]} />
        <meshStandardMaterial color="#173337" emissive="#82be9d" emissiveIntensity={night ? 0.9 : 0.25} />
      </mesh>
      <pointLight position={[-4.5, 3.2, 0]} intensity={night ? 18 : 4} distance={14} color="#ffc488" />
      {/* tables on the sea side */}
      {[-7.8, -5.6].flatMap((x) => [2.8, 4.4].map((z) => [x - 1, z])).concat([[1.5, 2.5], [1.5, -2.5], [4.2, 0]]).map(([x, z], i) => (
        <group key={i} position={[x, 0.5, z]}>
          <mesh position={[0, 0.75, 0]} material={m.white} castShadow>
            <cylinderGeometry args={[0.45, 0.45, 0.05, 20]} />
          </mesh>
          <mesh position={[0, 0.38, 0]} material={m.steel}>
            <cylinderGeometry args={[0.04, 0.04, 0.75, 8]} />
          </mesh>
          {[0, 2.1, 4.2].map((a) => (
            <mesh key={a} position={[Math.cos(a) * 0.75, 0.25, Math.sin(a) * 0.75]}>
              <cylinderGeometry args={[0.2, 0.2, 0.5, 12]} />
              <meshStandardMaterial color="#c46a3a" roughness={0.8} />
            </mesh>
          ))}
        </group>
      ))}
      {/* white sculpted arch from the render */}
      <mesh position={[8.2, 0.5, 4.2]} rotation={[0, 0.4, 0]} material={m.white} castShadow>
        <torusGeometry args={[1.3, 0.32, 14, 36, Math.PI]} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Club deck: four pedestals for the loyalty characters.
// ---------------------------------------------------------------------------
export const PEDESTALS: { id: string; x: number; z: number; h: number }[] = [
  { id: "rookie", x: 8.4, z: 26.5, h: 0.5 },
  { id: "challenger", x: 11.6, z: 24.4, h: 0.8 },
  { id: "elite", x: 15.0, z: 24.4, h: 1.1 },
  { id: "legend", x: 18.2, z: 26.5, h: 1.45 },
];

export function ClubDeck({ night, active }: { night: boolean; active: boolean }) {
  const m = mats();
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ring.current) ring.current.rotation.z = clock.getElapsedTime() * 0.25;
  });
  return (
    <group>
      <mesh position={[13.3, 0.2, 25.5]} receiveShadow castShadow material={m.white}>
        <cylinderGeometry args={[7.2, 7.4, 0.4, 64]} />
      </mesh>
      <mesh ref={ring} position={[13.3, 0.42, 25.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[6.4, 6.6, 64, 1, 0, Math.PI * 1.6]} />
        <meshBasicMaterial color="#82be9d" transparent opacity={active ? 0.95 : 0.45} toneMapped={false} />
      </mesh>
      {PEDESTALS.map((p) => (
        <group key={p.id} position={[p.x, 0.4, p.z]}>
          <mesh position={[0, p.h / 2, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.95, 1.05, p.h, 40]} />
            <meshStandardMaterial color={night ? "#16353a" : "#f3efe6"} roughness={0.35} metalness={0.1} />
          </mesh>
          <mesh position={[0, p.h + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.8, 0.95, 40]} />
            <meshBasicMaterial color="#82be9d" toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Bay Suites: planned accommodation, shown as a concept.
// ---------------------------------------------------------------------------
export const UNIT_POS: Record<string, [number, number, number]> = {
  sp1: [-30, 0, -34],
  sp2: [-30, 0, -26],
  sp3: [-30, 0, -18],
  sp4: [-30, 0, -10],
  l1: [16, 0, -22],
  l2: [28, 0, -22],
  v1: [-30, 0, 6],
};

export function Suites({
  selectedId,
  status,
  night,
  onSelect,
  onHover,
}: {
  selectedId?: string;
  status: Record<string, "free" | "occupied" | "arriving" | "dirty">;
  night: boolean;
  onSelect?: (id: string) => void;
  onHover?: (id: string, on: boolean) => void;
}) {
  const m = mats();
  const tone = (id: string) => (status[id] === "occupied" ? "#ffb871" : status[id] === "arriving" ? "#f6d38b" : status[id] === "dirty" ? "#ef6b5b" : "#bfe6d0");
  return (
    <group>
      {/* boardwalk across the sand */}
      <mesh position={[-24, 0.32, -22]} receiveShadow>
        <boxGeometry args={[2.2, 0.14, 28]} />
        <meshStandardMaterial color="#b98a5e" roughness={0.9} />
      </mesh>
      <mesh position={[-20.5, 0.32, -10]} receiveShadow>
        <boxGeometry args={[9, 0.14, 2]} />
        <meshStandardMaterial color="#b98a5e" roughness={0.9} />
      </mesh>
      {(["sp1", "sp2", "sp3", "sp4"] as const).map((id) => {
        const [x, , z] = UNIT_POS[id];
        const sel = selectedId === id;
        return (
          <group key={id} position={[x, 0, z]} {...hoverProps(onSelect ? () => onSelect(id) : undefined, onHover ? (on) => onHover(id, on) : undefined)}>
            {[[-2, -1.4], [2, -1.4], [-2, 1.4], [2, 1.4]].map(([sx, sz], i) => (
              <mesh key={i} position={[sx, 0.6, sz]} material={m.steel}>
                <cylinderGeometry args={[0.08, 0.08, 1.2, 8]} />
              </mesh>
            ))}
            <mesh position={[0, 1.25, 0]} castShadow receiveShadow>
              <boxGeometry args={[6.4, 0.18, 4.6]} />
              <meshStandardMaterial color="#b98a5e" roughness={0.85} />
            </mesh>
            <RoundedBox args={[4.6, 2.7, 3.6]} radius={1.2} smoothness={5} position={[0.6, 2.7, 0]} castShadow material={m.concept} />
            <mesh position={[-1.75, 2.7, 0]} rotation={[0, -Math.PI / 2, 0]}>
              <planeGeometry args={[2.6, 1.5]} />
              <meshStandardMaterial color={tone(id)} emissive={tone(id)} emissiveIntensity={night ? 1.4 : 0.45} />
            </mesh>
            <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[3.9, 4.1, 48]} />
              <meshBasicMaterial color={sel ? "#82be9d" : "#ffffff"} transparent opacity={sel ? 0.95 : 0.25} toneMapped={false} />
            </mesh>
          </group>
        );
      })}
      {(["l1", "l2"] as const).map((id) => {
        const [x, , z] = UNIT_POS[id];
        const sel = selectedId === id;
        return (
          <group key={id} position={[x, 0, z]} {...hoverProps(onSelect ? () => onSelect(id) : undefined, onHover ? (on) => onHover(id, on) : undefined)}>
            <mesh position={[0, 3.2, 0]} castShadow receiveShadow material={m.concept}>
              <boxGeometry args={[9, 6.4, 6]} />
            </mesh>
            <mesh position={[0, 4.6, 3.05]}>
              <planeGeometry args={[7.6, 2.4]} />
              <meshStandardMaterial color={tone(id)} emissive={tone(id)} emissiveIntensity={night ? 1.2 : 0.4} />
            </mesh>
            <mesh position={[0, 3.2, 3.6]} castShadow material={m.timber}>
              <boxGeometry args={[9.4, 0.25, 1.4]} />
            </mesh>
            <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[6.2, 6.4, 48]} />
              <meshBasicMaterial color={sel ? "#82be9d" : "#ffffff"} transparent opacity={sel ? 0.95 : 0.2} toneMapped={false} />
            </mesh>
          </group>
        );
      })}
      {(() => {
        const [x, , z] = UNIT_POS.v1;
        const sel = selectedId === "v1";
        return (
          <group position={[x, 0, z]} {...hoverProps(onSelect ? () => onSelect("v1") : undefined, onHover ? (on) => onHover("v1", on) : undefined)}>
            <mesh position={[0, 0.3, 0]} receiveShadow>
              <boxGeometry args={[14, 0.6, 10]} />
              <meshStandardMaterial color="#d9c6a5" roughness={0.9} />
            </mesh>
            <RoundedBox args={[8, 3.2, 6]} radius={0.8} smoothness={4} position={[2, 2.2, 0]} castShadow material={m.concept} />
            <mesh position={[-2.05, 2.2, 0]} rotation={[0, -Math.PI / 2, 0]}>
              <planeGeometry args={[5, 2]} />
              <meshStandardMaterial color={tone("v1")} emissive={tone("v1")} emissiveIntensity={night ? 1.3 : 0.4} />
            </mesh>
            <mesh position={[-4.6, 0.62, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[3.4, 6]} />
              <meshStandardMaterial color="#4fc3c8" emissive="#2aa8b0" emissiveIntensity={0.35} roughness={0.1} metalness={0.3} />
            </mesh>
            <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[8.2, 8.4, 64]} />
              <meshBasicMaterial color={sel ? "#82be9d" : "#ffffff"} transparent opacity={sel ? 0.95 : 0.2} toneMapped={false} />
            </mesh>
          </group>
        );
      })()}
    </group>
  );
}
