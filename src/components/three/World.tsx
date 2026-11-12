"use client";

import { Environment, Lightformer, Sky, Stars } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mats } from "./materials";

// Ramlet El Baida at golden hour: Mediterranean to the west, the public beach, the venue
// plaza, the corniche and Beirut behind, Mount Lebanon on the horizon.

const SUN = new THREE.Vector3(-100, 4, 34).normalize();

const seaVertex = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorld;
  void main() {
    vec3 p = position;
    vec4 w0 = modelMatrix * vec4(position, 1.0);
    float w = sin(p.x * 0.06 + uTime * 0.7) * 0.22
            + sin(p.y * 0.09 - uTime * 0.9) * 0.16
            + sin((p.x + p.y) * 0.21 + uTime * 1.6) * 0.06
            + sin((p.x * 0.4 - p.y * 0.3) + uTime * 2.3) * 0.025;
    // calm water at the shoreline, a proper swell offshore
    p.z += w * mix(0.1, 1.0, smoothstep(-36.0, -120.0, w0.x));
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const seaFragment = /* glsl */ `
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uSky;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform vec3 uFog;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uTime;
  varying vec3 vWorld;
  void main() {
    vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    if (n.y < 0.0) n = -n;
    vec3 v = normalize(cameraPosition - vWorld);
    float shore = smoothstep(-34.0, -130.0, vWorld.x);
    vec3 base = mix(uShallow, uDeep, shore);
    float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    vec3 col = mix(base, uSky, fres * 0.85);
    vec3 r = reflect(-v, n);
    float spec = pow(max(dot(r, uSunDir), 0.0), 120.0) * 3.5;
    float glow = pow(max(dot(r, uSunDir), 0.0), 8.0) * 0.45;
    col += uSunColor * (spec + glow);
    float foam = smoothstep(-38.5, -35.0, vWorld.x) * (0.55 + 0.45 * sin(vWorld.z * 0.7 + uTime * 2.0));
    col = mix(col, vec3(0.97, 0.94, 0.88), foam * 0.6);
    float d = length(cameraPosition - vWorld);
    float f = smoothstep(uFogNear, uFogFar, d);
    gl_FragColor = vec4(mix(col, uFog, f), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function Sea({ night, fog }: { night: boolean; fog: { color: string; near: number; far: number } }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: seaVertex,
        fragmentShader: seaFragment,
        uniforms: {
          uTime: { value: 0 },
          uDeep: { value: new THREE.Color("#0f3a4a") },
          uShallow: { value: new THREE.Color("#2f8a8c") },
          uSky: { value: new THREE.Color("#f3b48a") },
          uSunColor: { value: new THREE.Color("#ffb26a") },
          uSunDir: { value: SUN.clone() },
          uFog: { value: new THREE.Color(fog.color) },
          uFogNear: { value: fog.near },
          uFogFar: { value: fog.far },
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => {
    mat.uniforms.uDeep.value.set(night ? "#04141a" : "#0b2f3c");
    mat.uniforms.uShallow.value.set(night ? "#0b2c33" : "#2a8486");
    mat.uniforms.uSky.value.set(night ? "#0d2a33" : "#f59a68");
    mat.uniforms.uSunColor.value.set(night ? "#8fb8ff" : "#ffb062");
    mat.uniforms.uSunDir.value.copy(night ? new THREE.Vector3(60, 60, -40).normalize() : SUN);
    mat.uniforms.uFog.value.set(night ? fog.color : "#f3a676");
    // the open sea keeps its colour further out than the land does
    mat.uniforms.uFogNear.value = night ? fog.near : 220;
    mat.uniforms.uFogFar.value = night ? fog.far : 1400;
  }, [night, fog, mat]);
  useFrame((_, dt) => {
    mat.uniforms.uTime.value += dt;
  });
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-630, 0, 0]} material={mat}>
      <planeGeometry args={[1220, 2400, 240, 260]} />
    </mesh>
  );
}

function City({ night }: { night: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const count = 170;
  const data = useMemo(() => {
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: count }, () => ({
      x: 72 + r() * 200,
      z: -280 + r() * 560,
      w: 8 + r() * 14,
      d: 8 + r() * 14,
      h: 6 + Math.pow(r(), 1.8) * 46,
      tone: r(),
    }));
  }, []);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    data.forEach((b, i) => {
      o.position.set(b.x, b.h / 2, b.z);
      o.scale.set(b.w, b.h, b.d);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      if (night) c.setHSL(0.52, 0.25, 0.06 + b.tone * 0.05);
      else c.setHSL(0.06 + b.tone * 0.03, 0.28, 0.7 + b.tone * 0.1);
      m.setColorAt(i, c);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [data, night]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} castShadow={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.9} emissive={night ? "#ffcf8a" : "#000000"} emissiveIntensity={night ? 0.08 : 0} />
    </instancedMesh>
  );
}

function Mountains({ night }: { night: boolean }) {
  const peaks = useMemo(
    () => [
      [400, -300, 150, 120], [430, -120, 210, 160], [390, 60, 170, 135], [440, 240, 230, 175], [410, 420, 160, 120], [450, -480, 200, 140],
    ],
    [],
  );
  return (
    <group>
      {peaks.map(([x, z, r, h], i) => (
        <mesh key={i} position={[x, h / 2 - 8, z]} scale={[1, 1, 1.6]}>
          <coneGeometry args={[r, h, 7]} />
          <meshStandardMaterial color={night ? "#071518" : "#c88f7a"} roughness={1} flatShading />
        </mesh>
      ))}
    </group>
  );
}

const leafGeo = (() => {
  let g: THREE.PlaneGeometry | null = null;
  return () => {
    if (g) return g;
    g = new THREE.PlaneGeometry(0.9, 3.6, 2, 8);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) + 1.8;
      const x = pos.getX(i);
      pos.setZ(i, -0.11 * y * y);
      pos.setX(i, x * (1 - y / 4.2));
      pos.setY(i, y);
    }
    g.computeVertexNormals();
    return g;
  };
})();

export function Palm({ position, height = 7, lean = 0.12, rot = 0 }: { position: [number, number, number]; height?: number; lean?: number; rot?: number }) {
  const m = mats();
  const segs = 7;
  return (
    <group position={position} rotation={[0, rot, 0]}>
      {Array.from({ length: segs }, (_, i) => {
        const y = (i + 0.5) * (height / segs);
        return (
          <mesh key={i} position={[Math.pow(i / segs, 2) * lean * height, y, 0]} material={m.palmTrunk} castShadow>
            <cylinderGeometry args={[0.16 - i * 0.008, 0.2 - i * 0.008, height / segs + 0.05, 8]} />
          </mesh>
        );
      })}
      <group position={[lean * height, height, 0]}>
        {Array.from({ length: 9 }, (_, i) => (
          <mesh key={i} geometry={leafGeo()} material={m.palmLeaf} rotation={[0.7 + (i % 2) * 0.25, (i / 9) * Math.PI * 2, 0]} castShadow />
        ))}
      </group>
    </group>
  );
}

function Streetlights({ night }: { night: boolean }) {
  const m = mats();
  const zs = useMemo(() => Array.from({ length: 13 }, (_, i) => -60 + i * 10), []);
  return (
    <group>
      {zs.map((z) => (
        <group key={z} position={[40.4, 0, z]}>
          <mesh position={[0, 3.5, 0]} material={m.steel}>
            <cylinderGeometry args={[0.07, 0.09, 7, 8]} />
          </mesh>
          <mesh position={[-0.6, 7, 0]}>
            <boxGeometry args={[1.3, 0.12, 0.3]} />
            <meshStandardMaterial color="#fff1d6" emissive="#ffd59a" emissiveIntensity={night ? 4 : 0.1} toneMapped={!night} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export interface WorldTheme {
  night: boolean;
}

export function World({ night, quality }: { night: boolean; quality: "high" | "low" }) {
  const m = mats();
  const { scene } = useThree();
  const fog = useMemo(() => (night ? { color: "#061a1e", near: 70, far: 520 } : { color: "#f0b089", near: 90, far: 560 }), [night]);
  useEffect(() => {
    scene.fog = new THREE.Fog(fog.color, fog.near, fog.far);
    scene.background = new THREE.Color(night ? "#04161a" : "#efae84");
  }, [scene, fog, night]);

  const sun = night ? new THREE.Vector3(60, 80, -40) : new THREE.Vector3(-90, 26, 32);
  return (
    <group>
      {night ? (
        <>
          <mesh scale={900}>
            <sphereGeometry args={[1, 32, 16]} />
            <shaderMaterial
              side={THREE.BackSide}
              depthWrite={false}
              uniforms={{ top: { value: new THREE.Color("#020b0e") }, bottom: { value: new THREE.Color("#0e3a40") } }}
              vertexShader={`varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`}
              fragmentShader={`uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y*1.6+0.12,0.0,1.0); gl_FragColor = vec4(mix(bottom, top, h),1.0); }`}
            />
          </mesh>
          <Stars radius={420} depth={60} count={2500} factor={6} saturation={0} fade speed={0.4} />
        </>
      ) : (
        <Sky distance={4500} sunPosition={[-100, 3.2, 34]} turbidity={9} rayleigh={3} mieCoefficient={0.005} mieDirectionalG={0.82} />
      )}

      <hemisphereLight args={[night ? "#2c5560" : "#ffd9b6", night ? "#030708" : "#3b4a4c", night ? 0.45 : 0.75]} />
      <ambientLight intensity={night ? 0.08 : 0.12} />
      <directionalLight
        position={sun.toArray()}
        intensity={night ? 0.55 : 2.6}
        color={night ? "#a9c8ff" : "#ffb680"}
        castShadow={quality === "high"}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
        shadow-camera-near={1}
        shadow-camera-far={260}
        shadow-bias={-0.0004}
      />

      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={night ? 0.6 : 2.4} color={night ? "#5bc0c8" : "#ffb47a"} position={[-60, 8, 10]} scale={[120, 18, 1]} />
        <Lightformer form="rect" intensity={night ? 0.3 : 0.9} color={night ? "#1b3a7a" : "#9ad1df"} position={[60, 40, -20]} scale={[120, 60, 1]} />
        <Lightformer form="circle" intensity={night ? 1 : 5} color={night ? "#cfe3ff" : "#ffd6a0"} position={[-80, 12, 24]} scale={12} />
      </Environment>

      <Sea night={night} fog={fog} />
      {/* beach, sloping gently into the sea */}
      <group position={[-44, -0.148, 0]} rotation={[0, 0, 0.016]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={m.sand}>
          <planeGeometry args={[56, 420]} />
        </mesh>
      </group>
      {/* venue plaza */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[12, 0.02, 0]} receiveShadow material={m.stone}>
        <planeGeometry args={[56, 80]} />
      </mesh>
      {/* promenade edge */}
      <mesh position={[-16.2, 0.25, 0]} receiveShadow material={m.white}>
        <boxGeometry args={[0.8, 0.5, 80]} />
      </mesh>
      {/* grass beds */}
      {[[-1.5, 15.5, 22, 2.2], [26, 15.5, 16, 2.2], [32, -32, 12, 6]].map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, 0.1, z]} receiveShadow material={m.grass}>
          <boxGeometry args={[w, 0.2, d]} />
        </mesh>
      ))}
      {/* corniche: sidewalk, road, far sidewalk and the city */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[44.5, 0.03, 0]} receiveShadow material={m.asphalt}>
        <planeGeometry args={[9, 600]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} rotation={[-Math.PI / 2, 0, 0]} position={[44.5 + s * 0.2, 0.05, 0]}>
          <planeGeometry args={[0.12, 600]} />
          <meshBasicMaterial color="#f0e6c8" />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[160, 0.01, 0]} receiveShadow>
        <planeGeometry args={[230, 800]} />
        <meshStandardMaterial color={night ? "#0a1416" : "#bfae9a"} roughness={1} />
      </mesh>
      <Streetlights night={night} />
      <City night={night} />
      <Mountains night={night} />

      {/* palms along the promenade and around the café */}
      {[-34, -24, -14, -4, 6, 16, 30].map((z, i) => (
        <Palm key={z} position={[-17.6, 0, z]} height={6.5 + (i % 3)} rot={i * 1.3} lean={0.1 + (i % 2) * 0.06} />
      ))}
      <Palm position={[6, 0, 33]} height={7.5} rot={2} />
      <Palm position={[21.5, 0, 33]} height={6.5} rot={4} />
      <Palm position={[-38, 0, 20]} height={8} rot={1} lean={0.2} />
      <Palm position={[-37, 0, -42]} height={7} rot={3} lean={0.18} />
    </group>
  );
}
