"use client";

import { Sparkles } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { TierId } from "@/lib/types";

// The four loyalty characters. Each one is a padel ball that grew up at the bay:
// Sprout is the grass ball from the Padel Bay hero, the others level up from there.

let feltCache: Record<string, THREE.CanvasTexture> = {};
function felt(color: string) {
  if (feltCache[color]) return feltCache[color];
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 7000; i++) {
    const v = Math.random();
    ctx.strokeStyle = v > 0.5 ? `rgba(255,255,255,${v * 0.18})` : `rgba(0,0,0,${v * 0.22})`;
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 4, y - 2 - Math.random() * 4);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 2);
  t.colorSpace = THREE.SRGBColorSpace;
  feltCache[color] = t;
  return t;
}

export function resetCharacterCache() {
  feltCache = {};
}

function seamCurve(r: number) {
  const a = 0.7;
  const b = 0.3;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 120; i++) {
    const t = (i / 120) * Math.PI * 2;
    const v = new THREE.Vector3(a * Math.cos(t) + b * Math.cos(3 * t), a * Math.sin(t) - b * Math.sin(3 * t), 2 * Math.sqrt(a * b) * Math.sin(2 * t));
    pts.push(v.normalize().multiplyScalar(r));
  }
  return new THREE.CatmullRomCurve3(pts, true);
}

function Racket({ color, rim }: { color: string; rim: string }) {
  return (
    <group>
      <mesh position={[0, 0.34, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.22, 0.05, 28]} />
        <meshStandardMaterial color={color} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.34, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.22, 0.02, 8, 32]} />
        <meshStandardMaterial color={rim} emissive={rim} emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.028, 0.032, 0.32, 8]} />
        <meshStandardMaterial color="#1b1f21" />
      </mesh>
    </group>
  );
}

export function Character({ tier, scale = 1, selected = false, onSelect }: { tier: TierId; scale?: number; selected?: boolean; onSelect?: () => void }) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const hand = useRef<THREE.Group>(null);
  const extra = useRef<THREE.Group>(null);
  const aura = useRef<THREE.Mesh>(null);
  const R = 0.62;
  const seam = useMemo(() => new THREE.TubeGeometry(seamCurve(R * 1.005), 160, 0.028, 6, true), []);
  const phase = useMemo(() => ({ rookie: 0, challenger: 1.3, elite: 2.1, legend: 3.4 })[tier], [tier]);

  const bodyMat = useMemo(() => {
    switch (tier) {
      case "rookie":
        return new THREE.MeshStandardMaterial({ map: felt("#86c23d"), roughness: 1, color: "#ffffff" });
      case "challenger":
        return new THREE.MeshStandardMaterial({ map: felt("#2fa597"), roughness: 0.95, color: "#ffffff" });
      case "elite":
        return new THREE.MeshPhysicalMaterial({ color: "#f28a3b", roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 });
      case "legend":
        return new THREE.MeshStandardMaterial({ color: "#f3cf7a", metalness: 1, roughness: 0.22, emissive: "#7a5410", emissiveIntensity: 0.25 });
    }
  }, [tier]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() + phase;
    if (!root.current || !body.current) return;
    const sel = selected ? 1 : 0;
    if (tier === "rookie") {
      const hop = Math.abs(Math.sin(t * 2.6));
      root.current.position.y = hop * 0.35;
      body.current.scale.set(1 + (1 - hop) * 0.08, 1 - (1 - hop) * 0.1, 1 + (1 - hop) * 0.08);
      if (extra.current) extra.current.rotation.z = Math.sin(t * 5) * 0.25;
    } else if (tier === "challenger") {
      root.current.position.y = Math.abs(Math.sin(t * 1.8)) * 0.12;
      body.current.rotation.y = Math.sin(t * 0.9) * 0.35;
      if (hand.current) hand.current.rotation.z = -0.4 + Math.max(0, Math.sin(t * 2.2)) * -1.6;
    } else if (tier === "elite") {
      root.current.position.y = 0.35 + Math.sin(t * 1.4) * 0.12;
      body.current.rotation.y = t * 0.6;
      if (extra.current) extra.current.rotation.set(1.1, t * 1.6, 0.3);
    } else {
      root.current.position.y = 0.55 + Math.sin(t * 0.9) * 0.15;
      body.current.rotation.y = Math.sin(t * 0.4) * 0.5;
      if (extra.current) extra.current.rotation.y = t * 0.8;
      if (aura.current) {
        const s = 1.35 + Math.sin(t * 2) * 0.05;
        aura.current.scale.setScalar(s);
      }
    }
    // blink every few seconds
    if (eyes.current) {
      const b = (t * 0.35) % 1;
      eyes.current.scale.y = b > 0.97 ? 0.1 : 1;
    }
    const target = 1 + sel * 0.12;
    root.current.scale.x += (target * scale - root.current.scale.x) * 0.1;
    root.current.scale.y = root.current.scale.z = root.current.scale.x;
  });

  const eyeColor = tier === "legend" ? "#3b2a05" : "#0b1416";
  return (
    <group
      onClick={(e) => {
        if (e.delta > 6 || !onSelect) return;
        e.stopPropagation();
        onSelect();
      }}
      onPointerOver={() => onSelect && (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
      <group ref={root} scale={scale}>
        <group position={[0, R + 0.18, 0]}>
          <group ref={body}>
            <mesh material={bodyMat} castShadow>
              <sphereGeometry args={[R, 48, 48]} />
            </mesh>
            <mesh geometry={seam}>
              <meshStandardMaterial color={tier === "legend" ? "#fff7dd" : "#f7f7f2"} emissive={tier === "legend" ? "#ffe9a8" : "#000000"} emissiveIntensity={tier === "legend" ? 0.8 : 0} roughness={0.6} />
            </mesh>
            {/* face */}
            {tier === "elite" ? (
              <group position={[0, 0.08, 0]}>
                <mesh rotation={[0, 0, 0]}>
                  <cylinderGeometry args={[R * 1.02, R * 1.02, 0.26, 40, 1, true, -1.1, 2.2]} />
                  <meshPhysicalMaterial color="#10181b" roughness={0.1} clearcoat={1} side={THREE.DoubleSide} />
                </mesh>
                <mesh position={[0, 0, 0]}>
                  <cylinderGeometry args={[R * 1.035, R * 1.035, 0.035, 40, 1, true, -0.9, 1.8]} />
                  <meshBasicMaterial color="#ffb871" toneMapped={false} side={THREE.DoubleSide} />
                </mesh>
              </group>
            ) : (
              <group ref={eyes} position={[0, 0.1, R * 0.86]}>
                {[-0.19, 0.19].map((x) => (
                  <group key={x} position={[x, 0, 0]}>
                    <mesh>
                      <sphereGeometry args={[0.12, 20, 20]} />
                      <meshStandardMaterial color="#ffffff" roughness={0.2} />
                    </mesh>
                    <mesh position={[0, 0, 0.08]}>
                      <sphereGeometry args={[0.06, 16, 16]} />
                      <meshStandardMaterial color={eyeColor} roughness={0.2} />
                    </mesh>
                    <mesh position={[0.025, 0.03, 0.125]}>
                      <sphereGeometry args={[0.018, 8, 8]} />
                      <meshBasicMaterial color="#ffffff" />
                    </mesh>
                  </group>
                ))}
              </group>
            )}
            {tier !== "elite" && (
              <mesh position={[0, -0.12, R * 0.93]} rotation={[0, 0, Math.PI]}>
                <torusGeometry args={[0.09, 0.018, 8, 20, Math.PI]} />
                <meshStandardMaterial color="#0b1416" />
              </mesh>
            )}
            {/* tier accessories */}
            {tier === "rookie" && (
              <group ref={extra} position={[0, R + 0.02, 0]}>
                <mesh position={[0, 0.12, 0]}>
                  <cylinderGeometry args={[0.025, 0.03, 0.25, 8]} />
                  <meshStandardMaterial color="#4f7f2e" />
                </mesh>
                {[-1, 1].map((s) => (
                  <mesh key={s} position={[s * 0.13, 0.26, 0]} rotation={[0, 0, s * -0.9]} scale={[0.2, 0.07, 0.11]}>
                    <sphereGeometry args={[1, 16, 16]} />
                    <meshStandardMaterial color="#9bd35a" roughness={0.6} />
                  </mesh>
                ))}
              </group>
            )}
            {tier === "challenger" && (
              <mesh position={[0, 0.34, 0]} rotation={[Math.PI / 2 - 0.15, 0, 0]}>
                <torusGeometry args={[0.52, 0.07, 12, 40]} />
                <meshStandardMaterial color="#f7f2ea" />
              </mesh>
            )}
            {tier === "legend" && (
              <group ref={extra} position={[0, R + 0.32, 0]}>
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <torusGeometry args={[0.34, 0.035, 10, 40]} />
                  <meshStandardMaterial color="#fff1c9" emissive="#ffd36b" emissiveIntensity={1.6} toneMapped={false} />
                </mesh>
                {Array.from({ length: 8 }, (_, i) => (
                  <mesh key={i} position={[Math.cos((i / 8) * Math.PI * 2) * 0.34, 0.08, Math.sin((i / 8) * Math.PI * 2) * 0.34]}>
                    <coneGeometry args={[0.04, 0.16, 8]} />
                    <meshStandardMaterial color="#fff1c9" emissive="#ffd36b" emissiveIntensity={1.4} toneMapped={false} />
                  </mesh>
                ))}
              </group>
            )}
          </group>
          {/* floating hands */}
          <group ref={hand} position={[0.78, -0.05, 0.1]}>
            <mesh>
              <sphereGeometry args={[0.1, 14, 14]} />
              <meshStandardMaterial color={tier === "legend" ? "#fff1c9" : "#f7f2ea"} />
            </mesh>
            {tier !== "rookie" && (
              <group position={[0.02, 0.02, 0]} rotation={[0, 0, -0.2]}>
                <Racket color={tier === "elite" ? "#10181b" : tier === "legend" ? "#2a2108" : "#13383c"} rim={tier === "challenger" ? "#82be9d" : tier === "elite" ? "#f28a3b" : "#ffd36b"} />
              </group>
            )}
          </group>
          <mesh position={[-0.78, -0.05, 0.1]}>
            <sphereGeometry args={[0.1, 14, 14]} />
            <meshStandardMaterial color={tier === "legend" ? "#fff1c9" : "#f7f2ea"} />
          </mesh>
          {/* feet */}
          {[-0.22, 0.22].map((x) => (
            <mesh key={x} position={[x, -R - 0.08, 0.08]} scale={[1, 0.55, 1.4]}>
              <sphereGeometry args={[0.13, 16, 16]} />
              <meshStandardMaterial color={tier === "rookie" ? "#f7f2ea" : tier === "challenger" ? "#235c62" : tier === "elite" ? "#10181b" : "#fff1c9"} />
            </mesh>
          ))}
          {tier === "elite" && (
            <>
              <group ref={extra}>
                <mesh>
                  <torusGeometry args={[1.0, 0.025, 8, 64]} />
                  <meshBasicMaterial color="#ffb871" toneMapped={false} />
                </mesh>
                <mesh position={[1.0, 0, 0]}>
                  <sphereGeometry args={[0.07, 12, 12]} />
                  <meshBasicMaterial color="#fff1c9" toneMapped={false} />
                </mesh>
              </group>
              {[-0.22, 0.22].map((x) => (
                <mesh key={x} position={[x, -R - 0.32, 0.08]} rotation={[Math.PI, 0, 0]}>
                  <coneGeometry args={[0.09, 0.35, 12]} />
                  <meshBasicMaterial color="#ffb871" transparent opacity={0.7} toneMapped={false} />
                </mesh>
              ))}
            </>
          )}
          {tier === "legend" && (
            <>
              <mesh ref={aura}>
                <sphereGeometry args={[R, 32, 32]} />
                <meshBasicMaterial color="#ffd36b" transparent opacity={0.12} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
              </mesh>
              <Sparkles count={40} scale={2.6} size={3} speed={0.4} color="#ffe29a" />
            </>
          )}
        </group>
      </group>
    </group>
  );
}
