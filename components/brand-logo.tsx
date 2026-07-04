type BrandLogoProps = {
  compact?: boolean;
};

export function BrandLogo({ compact = false }: BrandLogoProps) {
  const width = compact ? 120 : 120;
  const height = compact ? 34 : 34;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 120 34"
      role="img"
      aria-label="Voltix"
      className="block h-[34px] w-[120px] shrink-0"
    >
      <defs>
        <radialGradient id="voltix-bloom" cx="50%" cy="52%" r="58%">
          <stop offset="0" stopColor="#18FF8A" stopOpacity=".45" />
          <stop offset=".56" stopColor="#18FF8A" stopOpacity=".12" />
          <stop offset="1" stopColor="#18FF8A" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="voltix-v-face" x1="13.5" x2="15.7" y1="3.2" y2="29.6" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8CFFD9" />
          <stop offset=".48" stopColor="#24F28B" />
          <stop offset="1" stopColor="#00C96B" />
        </linearGradient>
        <linearGradient id="voltix-v-shadow" x1="6" x2="28" y1="5" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#007A4A" />
          <stop offset="1" stopColor="#003624" />
        </linearGradient>
        <linearGradient id="voltix-v-side" x1="17" x2="26" y1="9" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#00A862" stopOpacity=".75" />
          <stop offset="1" stopColor="#005C3B" />
        </linearGradient>
        <linearGradient id="voltix-v-bevel" x1="7" x2="18" y1="5" y2="23" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#D9FFF2" stopOpacity=".86" />
          <stop offset=".52" stopColor="#D9FFF2" stopOpacity=".22" />
          <stop offset="1" stopColor="#D9FFF2" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="voltix-v-gloss" x1="5" x2="25" y1="4" y2="13" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity=".72" />
          <stop offset=".42" stopColor="#D9FFF2" stopOpacity=".22" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="voltix-text-shine" x1="39" x2="116" y1="6" y2="26" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset=".42" stopColor="#F8FAFC" />
          <stop offset="1" stopColor="#CFE9DD" />
        </linearGradient>
        <filter id="voltix-v-glow" x="-55%" y="-55%" width="210%" height="210%">
          <feGaussianBlur stdDeviation="2.4" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="0 0 0 0 0.094 0 0 0 0 1 0 0 0 0 0.541 0 0 0 .45 0"
            result="glow"
          />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="voltix-text-glow" x="-10%" y="-40%" width="120%" height="180%">
          <feGaussianBlur stdDeviation=".55" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="0 0 0 0 0.094 0 0 0 0 1 0 0 0 0 0.541 0 0 0 .2 0"
            result="glow"
          />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="voltix-inner-depth" x="-15%" y="-15%" width="130%" height="130%">
          <feDropShadow dx=".65" dy=".9" stdDeviation=".45" floodColor="#003B27" floodOpacity=".62" />
        </filter>
      </defs>

      <g>
        <circle cx="15" cy="17" r="16" fill="url(#voltix-bloom)" />
        <ellipse cx="15.4" cy="30.5" rx="11.6" ry="2.35" fill="#18FF8A" opacity=".18" />
      </g>

      <g filter="url(#voltix-v-glow)" strokeLinejoin="round">
        <path
          d="M3.15 4.55h7.55l4.42 14.05 4.54-14.05h7.72L17.6 29.42h-5.02L3.15 4.55Z"
          fill="url(#voltix-v-shadow)"
          opacity=".9"
          transform="translate(1.45 1.25)"
        />
        <path
          d="M2.35 3.55h7.84l4.88 15.18 5.02-15.18h7.78L17.62 29.85h-5.15L2.35 3.55Z"
          fill="#003E2A"
        />
        <path
          d="M5.62 5.85h4.12l5.35 16.08 5.48-16.08h4.22L16.78 27.15h-3.42L5.62 5.85Z"
          fill="url(#voltix-v-face)"
          filter="url(#voltix-inner-depth)"
        />
        <path
          d="M20.58 5.85h4.22L16.78 27.15h-2.2l1.1-4.9 4.9-16.4Z"
          fill="url(#voltix-v-side)"
          opacity=".72"
        />
        <path
          d="M5.62 5.85h4.12l5.35 16.08-1.72 5.22L5.62 5.85Z"
          fill="url(#voltix-v-bevel)"
          opacity=".58"
        />
        <path
          d="M7.2 6.7h2.12l1.75 5.28 2.2 6.52 1.67 4.8 1.67-4.8 2.3-6.72 1.73-5.08h2.16"
          fill="none"
          stroke="#E8FFF7"
          strokeLinecap="round"
          strokeOpacity=".2"
          strokeWidth="1.05"
        />
        <path
          d="M5.8 5.85h4.02l.9 2.75H6.8L5.8 5.85Zm14.78 0h4.02l-1.02 2.75h-3.92l.92-2.75Z"
          fill="url(#voltix-v-gloss)"
        />
        <path
          d="M2.35 3.55h7.84l4.88 15.18 5.02-15.18h7.78L17.62 29.85h-5.15L2.35 3.55Z"
          fill="none"
          stroke="#D9FFF2"
          strokeOpacity=".28"
          strokeWidth=".72"
        />
      </g>

      <g filter="url(#voltix-text-glow)">
        <text
          x="38"
          y="23"
          fill="url(#voltix-text-shine)"
          fontFamily="Inter, Satoshi, SF Pro Display, Arial, Helvetica, sans-serif"
          fontSize="17"
          fontWeight="800"
          letterSpacing="1.38"
        >
          VOLTIX
        </text>
        <rect x="38.3" y="8.3" width="76.5" height="5.4" rx="2.7" fill="#FFFFFF" opacity=".08" />
      </g>
    </svg>
  );
}
