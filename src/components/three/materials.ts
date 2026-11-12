import * as THREE from "three";

// Shared, procedurally generated materials. Nothing is downloaded: every texture is drawn on a canvas.

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void, repeat: [number, number] = [1, 1]) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  draw(ctx, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let cache: ReturnType<typeof build> | null = null;
export function mats() {
  if (!cache) cache = build();
  return cache;
}

function build() {
  // Chain-link style mesh used above the glass walls.
  const meshTex = canvasTexture(64, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    ctx.strokeStyle = "rgba(20,28,30,1)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(s, s);
    ctx.moveTo(s, 0);
    ctx.lineTo(0, s);
    ctx.stroke();
  }, [6, 2]);

  // Diagrid lattice from the venue render (the dark diamond facade behind the café).
  const latticeTex = canvasTexture(256, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    ctx.strokeStyle = "#16262a";
    ctx.lineWidth = 16;
    ctx.lineCap = "square";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(s, s);
    ctx.moveTo(s, 0);
    ctx.lineTo(0, s);
    ctx.stroke();
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(0, s / 2);
    ctx.lineTo(s / 2, 0);
    ctx.moveTo(s / 2, s);
    ctx.lineTo(s, s / 2);
    ctx.moveTo(0, s / 2);
    ctx.lineTo(s / 2, s);
    ctx.moveTo(s / 2, 0);
    ctx.lineTo(s, s / 2);
    ctx.stroke();
  }, [8, 2]);

  // Timber slats for the Sip pavilion ribbon.
  const timberTex = canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = "#c46a3a";
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 16; i++) {
      const x = (i / 16) * s;
      ctx.fillStyle = i % 2 ? "rgba(90,40,18,0.18)" : "rgba(255,190,140,0.10)";
      ctx.fillRect(x, 0, s / 16 - 2, s);
      ctx.fillStyle = "rgba(60,25,10,0.35)";
      ctx.fillRect(x + s / 16 - 2, 0, 2, s);
    }
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(80,35,15,${Math.random() * 0.08})`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 1, 6 + Math.random() * 18);
    }
  }, [3, 3]);

  // Artificial turf with mowing stripes.
  const turf = (base: string, stripe: string) =>
    canvasTexture(256, (ctx, s) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 8; i++) {
        if (i % 2) {
          ctx.fillStyle = stripe;
          ctx.fillRect(0, (i / 8) * s, s, s / 8);
        }
      }
      for (let i = 0; i < 2500; i++) {
        ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
        ctx.fillRect(Math.random() * s, Math.random() * s, 1, 1);
      }
    }, [1, 2]);

  const sandTex = canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = "#e6cfa6";
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 9000; i++) {
      const v = Math.random();
      ctx.fillStyle = v > 0.5 ? `rgba(255,240,215,${v * 0.25})` : `rgba(150,110,70,${v * 0.18})`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 1.5, 1.5);
    }
  }, [18, 30]);

  const stoneTex = canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = "#d8d0c2";
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = "rgba(120,110,95,0.25)";
    ctx.lineWidth = 2;
    for (let i = 0; i <= 8; i++) {
      ctx.beginPath();
      ctx.moveTo(0, (i / 8) * s);
      ctx.lineTo(s, (i / 8) * s);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo((i / 4) * s + (i % 2 ? s / 8 : 0), 0);
      ctx.lineTo((i / 4) * s + (i % 2 ? s / 8 : 0), s);
      ctx.stroke();
    }
    for (let i = 0; i < 4000; i++) {
      ctx.fillStyle = `rgba(90,80,70,${Math.random() * 0.06})`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
  }, [14, 18]);

  const pebbleTex = canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = "#8f8778";
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 1400; i++) {
      const r = 2 + Math.random() * 5;
      const g = 110 + Math.random() * 70;
      ctx.fillStyle = `rgb(${g + 10},${g},${g - 15})`;
      ctx.beginPath();
      ctx.ellipse(Math.random() * s, Math.random() * s, r, r * 0.7, Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [3, 2]);

  return {
    glass: new THREE.MeshPhysicalMaterial({ color: "#d8f1ec", roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.16, envMapIntensity: 2, side: THREE.DoubleSide, depthWrite: false }),
    glassTint: new THREE.MeshPhysicalMaterial({ color: "#7fb7b3", roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.22, envMapIntensity: 2.2, side: THREE.DoubleSide, depthWrite: false }),
    mesh: new THREE.MeshStandardMaterial({ map: meshTex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, color: "#1d2629", roughness: 0.6, metalness: 0.6 }),
    steel: new THREE.MeshStandardMaterial({ color: "#1c2427", roughness: 0.4, metalness: 0.8 }),
    white: new THREE.MeshStandardMaterial({ color: "#f3f1ec", roughness: 0.55 }),
    lines: new THREE.MeshBasicMaterial({ color: "#f8f8f2" }),
    turfIndoor: new THREE.MeshStandardMaterial({ map: turf("#1f6f78", "#227b84"), roughness: 0.95 }),
    turfOutdoor: new THREE.MeshStandardMaterial({ map: turf("#3a8f58", "#40995f"), roughness: 0.95 }),
    slab: new THREE.MeshStandardMaterial({ color: "#2b3336", roughness: 0.85 }),
    lattice: new THREE.MeshStandardMaterial({ map: latticeTex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.5, color: "#ffffff" }),
    timber: new THREE.MeshStandardMaterial({ map: timberTex, roughness: 0.7, color: "#ffffff" }),
    sand: new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1 }),
    stone: new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.92 }),
    pebble: new THREE.MeshStandardMaterial({ map: pebbleTex, roughness: 1 }),
    asphalt: new THREE.MeshStandardMaterial({ color: "#30363a", roughness: 0.95 }),
    grass: new THREE.MeshStandardMaterial({ color: "#6f9e63", roughness: 1 }),
    concept: new THREE.MeshPhysicalMaterial({ color: "#f5f1e8", roughness: 0.35, transparent: true, opacity: 0.92, clearcoat: 0.6 }),
    conceptGlass: new THREE.MeshStandardMaterial({ color: "#ffd9a8", emissive: "#ffb871", emissiveIntensity: 0.6, roughness: 0.2 }),
    palmTrunk: new THREE.MeshStandardMaterial({ color: "#8a6a4a", roughness: 0.9 }),
    palmLeaf: new THREE.MeshStandardMaterial({ color: "#4f7f3e", roughness: 0.8, side: THREE.DoubleSide }),
    netMat: new THREE.MeshStandardMaterial({ map: meshTex.clone(), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, color: "#0d1416" }),
  };
}
