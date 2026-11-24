"use client";

import { ALERT_LABELS, type AlertStatus } from "@/lib/surveillance/detect";

/** Fictional Lakeshore County. Shapes are schematic, not a real place. */
const AREAS: { name: string; points: string; label: [number, number] }[] = [
  { name: "North Bay", points: "120,16 300,16 300,95 200,110 128,88", label: [212, 56] },
  { name: "Riverside", points: "128,88 200,110 208,180 140,198 108,148", label: [160, 146] },
  { name: "Old Town", points: "200,110 300,95 308,170 208,180", label: [254, 142] },
  { name: "Market Hill", points: "300,16 392,28 388,190 308,170 300,95", label: [346, 98] },
  { name: "Kilima", points: "140,198 208,180 308,170 388,190 372,284 158,284", label: [262, 236] },
];

const FILL: Record<AlertStatus, string> = { NORMAL: "#f0fdf4", WATCH: "#fffbeb", CRITICAL: "#fef2f2" };
const INK: Record<AlertStatus, string> = { NORMAL: "#15803d", WATCH: "#b45309", CRITICAL: "#b91c1c" };

export function CountyMap({
  statuses,
  declared,
  selected,
  onSelect,
}: {
  statuses: Record<string, AlertStatus>;
  declared: readonly string[];
  selected: string | null;
  onSelect: (subCounty: string | null) => void;
}) {
  return (
    <svg viewBox="0 0 400 300" className="block h-auto w-full" role="group" aria-label="Map of Lakeshore County by alert status">
      <path d="M0,0 H124 L128,88 L108,148 L140,198 L158,284 L150,300 H0 Z" fill="#e0f2fe" />
      <text x={40} y={150} fontSize={12} fill="#475569">
        Lake
      </text>
      <path d="M118,128 C135,132 150,124 168,134 S196,150 205,146" fill="none" stroke="#7dd3fc" strokeWidth={3} strokeLinecap="round" />
      {/* The selected area is drawn last so its outline is not covered by its neighbours. */}
      {[...AREAS].sort((x, y) => Number(x.name === selected) - Number(y.name === selected)).map((a) => {
        const status = statuses[a.name] ?? "NORMAL";
        const isSelected = selected === a.name;
        const isDeclared = declared.includes(a.name);
        const toggle = () => onSelect(isSelected ? null : a.name);
        return (
          <g
            key={a.name}
            role="button"
            tabIndex={0}
            aria-pressed={isSelected}
            aria-label={`${a.name}: ${ALERT_LABELS[status]}${isDeclared ? ", outbreak declared" : ""}. ${isSelected ? "Show the whole county" : "Show only this sub-county"}`}
            className="cursor-pointer outline-none [&:focus-visible>polygon]:stroke-[3]"
            onClick={toggle}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggle();
              }
            }}
          >
            <polygon
              points={a.points}
              fill={FILL[status]}
              stroke={isSelected ? "#0f766e" : INK[status]}
              strokeWidth={isSelected ? 3 : 1.5}
              strokeLinejoin="round"
            />
            <text x={a.label[0]} y={a.label[1]} textAnchor="middle" fontSize={13} fontWeight={600} fill="#0f172a">
              {a.name}
            </text>
            <text x={a.label[0]} y={a.label[1] + 16} textAnchor="middle" fontSize={12} fill={INK[status]}>
              {ALERT_LABELS[status]}
              {isDeclared ? ", declared" : ""}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
