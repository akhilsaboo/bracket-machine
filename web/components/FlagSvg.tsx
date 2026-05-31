"use client";

import { flagImg } from "@/lib/flags";

// Current official flag (SVG) for a team, from flagcdn.
export function FlagSvg({ code, className }: { code: string; className?: string }) {
  const src = flagImg(code);
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={`${code} flag`}
      loading="lazy"
      className={className}
    />
  );
}
