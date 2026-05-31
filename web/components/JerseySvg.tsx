"use client";

import { useId } from "react";
import { kitOf } from "@/lib/teamKits";

// Simple stylised football shirt — V-neck collar + short sleeves. Drawn by us
// from each team's kit colours (see lib/teamKits), so no licensed artwork.
const SHIRT =
  "M40 12 L33 12 L12 18 L20 36 L33 30 L33 88 L67 88 L67 30 L80 36 L88 18 L67 12 L60 12 Q55 21 50 21 Q45 21 40 12 Z";

export function JerseySvg({ code, className }: { code: string; className?: string }) {
  const { primary, accent, pattern } = kitOf(code);
  const id = useId().replace(/:/g, "");
  const clip = `clip-${id}`;

  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label={`${code} kit`}>
      <defs>
        <clipPath id={clip}>
          <path d={SHIRT} />
        </clipPath>
      </defs>

      <g clipPath={`url(#${clip})`}>
        <rect x="0" y="0" width="100" height="100" fill={primary} />

        {pattern === "stripes" &&
          [12, 28, 44, 60, 76].map((x) => (
            <rect key={x} x={x} y="0" width="8" height="100" fill={accent} opacity="0.92" />
          ))}

        {pattern === "checker" &&
          Array.from({ length: 8 }).flatMap((_, r) =>
            Array.from({ length: 8 }).map((__, c) =>
              (r + c) % 2 === 0 ? (
                <rect
                  key={`${r}-${c}`}
                  x={c * 12.5}
                  y={r * 12.5}
                  width="12.5"
                  height="12.5"
                  fill={accent}
                />
              ) : null,
            ),
          )}
      </g>

      {/* sleeve cuffs + collar trim in the accent colour */}
      <path d={SHIRT} fill="none" stroke={accent} strokeWidth="3" strokeLinejoin="round" />
      <path
        d="M40 12 Q45 21 50 21 Q55 21 60 12"
        fill="none"
        stroke={accent}
        strokeWidth="4"
        strokeLinecap="round"
      />
      {/* faint outline so white kits read on a white background */}
      <path d={SHIRT} fill="none" stroke="#00000022" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
