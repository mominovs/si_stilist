/**
 * SI Stilist logotipi: ilgich + uchqun (kiyim + SI). Belgi to'q fonda (ilova ikonkasi), yonida "SI Stilist" yozuvi.
 * Claude Design brend tizimidan.
 */
export function LogoMark({ size = 40, tone = "brand" }: { size?: number; tone?: "brand" | "accent" | "light" }) {
  const bg = tone === "accent" ? "#C23B44" : tone === "light" ? "#F7F1EA" : "#2B1638";
  const stroke = tone === "light" ? "#2B1638" : "#fff";
  const spark = tone === "accent" ? "#FFD3CC" : tone === "light" ? "#C23B44" : "#F2685C";
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" className="shrink-0">
      <rect width="64" height="64" rx="16" fill={bg} />
      <path d="M32 24 V20.5 C32 18 36.5 17 36.5 13 A4.5 4.5 0 0 0 27.5 13" fill="none" stroke={stroke} strokeWidth="4" strokeLinecap="round" />
      <path
        d="M32 24 L12.5 39.5 C9.8 41.6 11 45 14.4 45 H49.6 C53 45 54.2 41.6 51.5 39.5 Z"
        fill="none"
        stroke={stroke}
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d="M47 7 C47.7 11.6 48.9 12.8 53.5 13.5 C48.9 14.2 47.7 15.4 47 20 C46.3 15.4 45.1 14.2 40.5 13.5 C45.1 12.8 46.3 11.6 47 7 Z"
        fill={spark}
      />
    </svg>
  );
}

export function Logo({ size = 40, dark = false }: { size?: number; dark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} tone={dark ? "light" : "brand"} />
      <span className={`font-display text-2xl font-extrabold tracking-tight ${dark ? "text-white" : "text-brand"}`}>
        <span className={dark ? "text-accent-bright" : "text-accent"}>SI</span> Stilist
      </span>
    </span>
  );
}

/** Ilgich belgisi (tugmalar ichida, "O'zimda ko'rish") */
export function HangerIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="5">
      <path d="M32 26 V22.5 C32 20 36.5 19 36.5 15 A4.5 4.5 0 0 0 27.5 15" strokeLinecap="round" />
      <path d="M32 26 L10.5 42.5 C7.8 44.6 9 48 12.4 48 H51.6 C55 48 56.2 44.6 53.5 42.5 Z" strokeLinejoin="round" />
    </svg>
  );
}

/** Uchqun (SI belgisi): yordamchi avatari, "Sifatli surat" tugmasi */
export function SparkIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M12 2 C12.8 7.4 14.6 9.2 20 10 C14.6 10.8 12.8 12.6 12 18 C11.2 12.6 9.4 10.8 4 10 C9.4 9.2 11.2 7.4 12 2 Z" />
    </svg>
  );
}
