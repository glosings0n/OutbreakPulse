"use client";

import { useState } from "react";
import type { EpiDay } from "@/lib/surveillance/epicurve";

/** Validated pair (light surface): CVD separation and 3:1 contrast pass. */
const SUSPECTED = "#eb6834";
const OTHER = "#2a78d6";

function dayLabel(ts: number): string {
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Stacked daily columns, with a hover readout and a table view for screen readers. */
export function EpiCurve({ days, windowDays, title }: { days: EpiDay[]; windowDays: number; title: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const W = 720;
  const H = 200;
  const left = 28;
  const bottom = 22;
  const top = 20;
  const plotH = H - bottom - top;
  const slot = (W - left) / days.length;
  const barW = Math.min(24, slot - 2);
  const max = Math.max(1, ...days.map((d) => d.suspected + d.other));
  const step = max <= 5 ? 1 : max <= 10 ? 2 : 5;
  const ticks = Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
  const y = (v: number) => top + plotH - (v / max) * plotH;
  const windowStartX = left + (days.length - windowDays) * slot;
  const totalSuspected = days.reduce((n, d) => n + d.suspected, 0);
  const total = days.reduce((n, d) => n + d.suspected + d.other, 0);
  const active = hover !== null ? days[hover] : null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-4 text-sm text-ink-2">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: SUSPECTED }} />
            Suspected cholera
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: OTHER }} />
            Other cases
          </span>
        </div>
        <p className="min-h-5 text-sm text-ink" aria-live="polite">
          {active ? (
            <>
              {dayLabel(active.day)}: <span className="mono">{active.suspected + active.other}</span> cases,{" "}
              <span className="mono">{active.suspected}</span> suspected cholera
            </>
          ) : (
            <>
              <span className="mono">{total}</span> cases, <span className="mono">{totalSuspected}</span> suspected cholera
            </>
          )}
        </p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 block h-auto w-full" role="img" aria-label={`${title}. ${total} cases, ${totalSuspected} suspected cholera.`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={W} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth={1} />
            <text x={left - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#475569">
              {t}
            </text>
          </g>
        ))}
        <line x1={windowStartX} x2={windowStartX} y1={top - 18} y2={top + plotH} stroke="#94a3b8" strokeWidth={1} />
        <text x={windowStartX + 4} y={top - 8} fontSize={11} fill="#475569">
          Recent window
        </text>
        {days.map((d, i) => {
          const x = left + i * slot + (slot - barW) / 2;
          const otherTop = y(d.other);
          const suspTop = y(d.other + d.suspected);
          const gap = d.other > 0 && d.suspected > 0 ? 2 : 0;
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={left + i * slot} y={top} width={slot} height={plotH} fill={hover === i ? "#f1f5f9" : "transparent"} />
              {d.other > 0 && <rect x={x} y={otherTop} width={barW} height={top + plotH - otherTop} rx={2} fill={OTHER} />}
              {d.suspected > 0 && <rect x={x} y={suspTop} width={barW} height={otherTop - suspTop - gap} rx={2} fill={SUSPECTED} />}
            </g>
          );
        })}
        {days.map((d, i) =>
          i % 7 === 0 || i === days.length - 1 ? (
            <text key={d.day} x={left + i * slot + slot / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="#475569">
              {dayLabel(d.day)}
            </text>
          ) : null,
        )}
        <line x1={left} x2={W} y1={top + plotH} y2={top + plotH} stroke="#cbd5e1" strokeWidth={1} />
      </svg>
      <button type="button" className="mt-1 text-sm text-brand underline" aria-expanded={showTable} onClick={() => setShowTable((v) => !v)}>
        {showTable ? "Hide" : "Show"} the data as a table
      </button>
      {showTable && (
        <table className="mt-2 w-full max-w-md border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-line text-ink-2">
              <th className="py-1 pr-3 font-medium">Onset day</th>
              <th className="py-1 pr-3 text-right font-medium">Suspected cholera</th>
              <th className="py-1 text-right font-medium">Other</th>
            </tr>
          </thead>
          <tbody>
            {days
              .filter((d) => d.suspected + d.other > 0)
              .map((d) => (
                <tr key={d.day} className="border-b border-line last:border-0">
                  <td className="py-1 pr-3">{dayLabel(d.day)}</td>
                  <td className="mono py-1 pr-3 text-right">{d.suspected}</td>
                  <td className="mono py-1 text-right">{d.other}</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
