"use client";

import { useState } from "react";

// Small SVG charts for the Command Center. Palette validated (dark mode, surface #0a1d20):
// courts #36a678 · Sip #dc6d34 · stays #5a88e6. Sequential = one hue (sage), light = more.

export const SERIES = {
  courts: { key: "courts", label: "Courts", color: "#36a678" },
  cafe: { key: "cafe", label: "Sip café", color: "#dc6d34" },
  stays: { key: "stays", label: "Bay Suites", color: "#5a88e6" },
} as const;

export interface BarDatum {
  label: string;
  values: Record<string, number>;
}

export function Legend({ series }: { series: { key: string; label: string; color: string }[] }) {
  if (series.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-3">
      {series.map((s) => (
        <span key={s.key} className="flex items-center gap-1.5 text-[11px] text-white/70">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} /> {s.label}
        </span>
      ))}
    </div>
  );
}

export function StackedBars({
  data,
  series,
  height = 150,
  format = (n: number) => `$${Math.round(n).toLocaleString()}`,
  highlightLast = true,
}: {
  data: BarDatum[];
  series: { key: string; label: string; color: string }[];
  height?: number;
  format?: (n: number) => string;
  highlightLast?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const totals = data.map((d) => series.reduce((s, x) => s + (d.values[x.key] ?? 0), 0));
  const max = Math.max(1, ...totals) * 1.08;
  const W = 100 / data.length;
  return (
    <div className="space-y-2">
      <Legend series={series} />
      <div className="relative" style={{ height }}>
        {[0.25, 0.5, 0.75].map((g) => (
          <div key={g} className="absolute inset-x-0 border-t border-dashed border-white/[0.06]" style={{ bottom: `${g * 100}%` }} />
        ))}
        <div className="absolute inset-x-0 bottom-0 border-t border-white/15" />
        <div className="absolute inset-0 flex items-end">
          {data.map((d, i) => {
            const total = totals[i];
            return (
              <div
                key={d.label + i}
                className="relative flex h-full items-end justify-center"
                style={{ width: `${W}%` }}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <div className="flex w-[62%] max-w-7 flex-col-reverse gap-[2px]" style={{ height: `${(total / max) * 100}%`, opacity: hover === null || hover === i ? 1 : 0.45 }}>
                  {series.map((s, si) => {
                    const v = d.values[s.key] ?? 0;
                    if (!v) return null;
                    const top = series.slice(si + 1).every((x) => !(d.values[x.key] ?? 0));
                    return <div key={s.key} style={{ flexGrow: v, background: s.color, borderRadius: top ? "4px 4px 0 0" : 0, minHeight: 2 }} />;
                  })}
                </div>
                {hover === i && (
                  <div className="pointer-events-none absolute bottom-full z-10 mb-1 w-max min-w-[120px] rounded-xl border border-white/15 bg-ink/95 px-3 py-2 text-[11px] shadow-xl">
                    <p className="font-semibold text-white">{d.label}</p>
                    {series.map((s) => (
                      <p key={s.key} className="flex items-center justify-between gap-3 text-white/75">
                        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px]" style={{ background: s.color }} />{s.label}</span>
                        <span className="tabular">{format(d.values[s.key] ?? 0)}</span>
                      </p>
                    ))}
                    {series.length > 1 && <p className="mt-1 flex justify-between border-t border-white/10 pt-1 font-semibold text-white"><span>Total</span><span className="tabular">{format(total)}</span></p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex">
        {data.map((d, i) => (
          <span key={d.label + i} className={`text-center text-[9.5px] ${highlightLast && i === data.length - 1 ? "font-semibold text-white" : "text-white/45"}`} style={{ width: `${W}%` }}>
            {data.length > 16 ? (i % 2 ? "" : d.label) : d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Single-hue sequential heatmap. */
export function Heatmap({
  rows,
  cols,
  format = (v: number) => `${Math.round(v * 100)}%`,
  flag,
}: {
  rows: { label: string; cells: number[] }[];
  cols: string[];
  format?: (v: number) => string;
  flag?: (v: number, r: number, c: number) => boolean;
}) {
  const [hover, setHover] = useState<string | null>(null);
  return (
    <div className="overflow-x-auto thin-scrollbar">
      <div className="min-w-[520px]">
        <div className="flex pl-14">
          {cols.map((c, i) => (
            <span key={c} className="flex-1 text-center text-[9.5px] text-white/45">{i % 2 ? "" : c}</span>
          ))}
        </div>
        {rows.map((r, ri) => (
          <div key={r.label} className="mt-[2px] flex items-center">
            <span className="w-14 shrink-0 text-[10.5px] text-white/60">{r.label}</span>
            {r.cells.map((v, ci) => {
              const id = `${ri}-${ci}`;
              const f = flag?.(v, ri, ci);
              return (
                <div key={ci} className="relative flex-1 px-[1px]" onMouseEnter={() => setHover(id)} onMouseLeave={() => setHover(null)}>
                  <div
                    className="h-6 rounded-[4px]"
                    style={{ background: `rgba(130, 214, 168, ${0.06 + Math.min(1, v) * 0.86})`, outline: f ? "2px solid #f6b26b" : undefined, outlineOffset: -2 }}
                  />
                  {hover === id && (
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 w-max -translate-x-1/2 rounded-lg border border-white/15 bg-ink/95 px-2.5 py-1.5 text-[10.5px] text-white shadow-xl">
                      {r.label} {cols[ci]} · <span className="font-semibold tabular">{format(v)}</span>
                      {f && <span className="block text-gold">Low demand · promo candidate</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        <div className="mt-2 flex items-center gap-2 pl-14 text-[10px] text-white/45">
          <span>Low</span>
          <span className="h-2 w-28 rounded-full" style={{ background: "linear-gradient(90deg, rgba(130,214,168,0.08), rgba(130,214,168,0.92))" }} />
          <span>High</span>
          {flag && <span className="ml-3 flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-[3px] outline outline-2 outline-gold" /> promo candidate</span>}
        </div>
      </div>
    </div>
  );
}

export function HBars({ items, format = (n: number) => String(n), color = "#36a678" }: { items: { label: string; value: number; sub?: string }[]; format?: (n: number) => string; color?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="space-y-2">
      {items.map((it) => (
        <div key={it.label}>
          <div className="flex justify-between text-[11.5px]">
            <span className="text-white/80">{it.label}</span>
            <span className="tabular text-white">{format(it.value)}{it.sub && <span className="ml-1 text-white/45">{it.sub}</span>}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full" style={{ width: `${(it.value / max) * 100}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Meter({ value, label, tone = "#36a678" }: { value: number; label: string; tone?: string }) {
  return (
    <div>
      <div className="flex justify-between text-[11px] text-white/65"><span>{label}</span><span className="tabular font-semibold text-white">{Math.round(value * 100)}%</span></div>
      <div className="mt-1 h-1.5 rounded-full bg-white/[0.07]"><div className="h-full rounded-full" style={{ width: `${Math.min(100, value * 100)}%`, background: tone }} /></div>
    </div>
  );
}
