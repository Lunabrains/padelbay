"use client";

import { useNow } from "@/lib/hooks";
import { pick, useStage } from "@/lib/stage";
import { useStore } from "@/lib/store";
import { courtLive } from "./Stage";

// Graceful 2D fallback: the same venue as an illustrated site plan, with the same click targets.
// Used when WebGL is unavailable or the visitor switches 3D off.

const TONE = { free: "#82be9d", play: "#f28a3b", soon: "#f6b26b", maintenance: "#ef6b5b" } as const;

export default function Venue2D({ className = "" }: { className?: string }) {
  const db = useStore((s) => s.db);
  const now = useNow(20_000);
  const { zone, focusId, mode } = useStage();
  const night = mode === "ops";
  const courts = [
    { id: "c3", x: 120, y: 150 },
    { id: "c4", x: 250, y: 150 },
    { id: "c1", x: 420, y: 150 },
    { id: "c2", x: 550, y: 150 },
  ];
  return (
    <div className={`${className} overflow-hidden`} style={{ background: night ? "radial-gradient(120% 90% at 20% 10%, #0f3a3f 0%, #04161a 60%)" : "linear-gradient(180deg, #f6b26b 0%, #f28a3b 30%, #2f8a8c 31%, #0f3a4a 100%)" }}>
      <svg viewBox="0 0 760 520" className="h-full w-full" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Padel Bay site plan (conceptual)">
        <defs>
          <pattern id="lattice" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="16" height="16" fill="none" />
            <path d="M0 0 L0 16" stroke="#16262a" strokeWidth="3" />
          </pattern>
        </defs>
        {/* sea, beach, plaza */}
        <rect x="0" y="0" width="70" height="520" fill={night ? "#06202a" : "#1d6e78"} />
        <rect x="70" y="0" width="60" height="520" fill={night ? "#1a2a2a" : "#e6cfa6"} />
        <rect x="130" y="40" width="560" height="440" rx="26" fill={night ? "#0c2427" : "#e9e2d5"} />
        <rect x="690" y="0" width="70" height="520" fill={night ? "#0a1416" : "#30363a"} />
        <text x="725" y="260" fill="#f0e6c8" fontSize="11" textAnchor="middle" transform="rotate(90 725 260)" letterSpacing="3">FARID TRAD ST</text>
        <text x="35" y="260" fill="#cfe9ef" fontSize="11" textAnchor="middle" transform="rotate(-90 35 260)" letterSpacing="4">MEDITERRANEAN</text>
        {/* hall */}
        <rect x="390" y="70" width="250" height="250" rx="10" fill="url(#lattice)" stroke="#16262a" strokeWidth="3" opacity="0.7" />
        <text x="515" y="64" fill={night ? "#a9d4bc" : "#235c62"} fontSize="11" textAnchor="middle" letterSpacing="3">THE HALL · INDOOR</text>
        <text x="185" y="64" fill={night ? "#a9d4bc" : "#235c62"} fontSize="11" textAnchor="middle" letterSpacing="3">SEA SIDE · OUTDOOR</text>
        {courts.map((c) => {
          const live = courtLive(db, c.id, now);
          const sel = focusId === c.id && (zone === "court" || zone === "command");
          return (
            <g key={c.id} onClick={() => pick("court", c.id)} className="cursor-pointer">
              <rect x={c.x - 50} y={c.y - 95} width="100" height="190" rx="6" fill={live.court.type === "indoor" ? "#1f6f78" : "#3a8f58"} stroke={sel ? "#ffffff" : TONE[live.state]} strokeWidth={sel ? 5 : 3} />
              <line x1={c.x - 50} y1={c.y} x2={c.x + 50} y2={c.y} stroke="#ffffff" strokeWidth="2" />
              <line x1={c.x} y1={c.y - 66} x2={c.x} y2={c.y + 66} stroke="#ffffff" strokeWidth="1.5" opacity="0.8" />
              <text x={c.x} y={c.y + 120} fill={night ? "#ffffff" : "#0b1416"} fontSize="13" fontWeight="600" textAnchor="middle">{live.court.short}</text>
              <text x={c.x} y={c.y + 136} fill={night ? "#a9d4bc" : "#3f7b80"} fontSize="10" textAnchor="middle">{live.label}</text>
            </g>
          );
        })}
        {/* café */}
        <g onClick={() => pick("cafe", "cafe")} className="cursor-pointer">
          <rect x="150" y="360" width="220" height="100" rx="18" fill="#c46a3a" stroke={zone === "cafe" ? "#ffffff" : "none"} strokeWidth="4" />
          <text x="260" y="405" fill="#fff" fontSize="18" textAnchor="middle" fontFamily="var(--font-comfortaa)">sip café</text>
          <text x="260" y="425" fill="#ffe3cf" fontSize="10" textAnchor="middle" letterSpacing="2">TERRACE · ORDER TO COURT</text>
        </g>
        {/* club deck */}
        <g onClick={() => pick("club", "club")} className="cursor-pointer">
          <circle cx="470" cy="410" r="52" fill={night ? "#16353a" : "#f7f2ea"} stroke="#82be9d" strokeWidth="3" />
          {["#8cc63f", "#3fb6a8", "#f28a3b", "#f3cf7a"].map((c, i) => (
            <circle key={c} cx={440 + i * 20} cy={410} r="7" fill={c} />
          ))}
          <text x="470" y="440" fill={night ? "#fff" : "#235c62"} fontSize="10" textAnchor="middle" letterSpacing="2">THE CLUB</text>
        </g>
        {/* suites (planned) */}
        {[0, 1, 2, 3].map((i) => (
          <g key={i} onClick={() => pick("suite", `sp${i + 1}`)} className="cursor-pointer">
            <rect x="82" y={40 + i * 70} width="38" height="46" rx="16" fill="#f5f1e8" stroke={focusId === `sp${i + 1}` ? "#82be9d" : "#c9b89a"} strokeDasharray="4 3" strokeWidth="2" />
          </g>
        ))}
        <text x="100" y="335" fill={night ? "#a9d4bc" : "#235c62"} fontSize="9" textAnchor="middle" letterSpacing="2">BAY SUITES</text>
        <text x="100" y="347" fill={night ? "#a9d4bc" : "#235c62"} fontSize="8" textAnchor="middle" letterSpacing="2">(PLANNED)</text>
      </svg>
    </div>
  );
}
