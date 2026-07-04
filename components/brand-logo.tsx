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
        <linearGradient id="voltix-v-face" x1="14" x2="14" y1="3" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7DFFD1" />
          <stop offset=".48" stopColor="#27F28C" />
          <stop offset="1" stopColor="#00C96B" />
        </linearGradient>
        <linearGradient id="voltix-v-edge" x1="4" x2="28" y1="4" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#E9FFF7" stopOpacity=".9" />
          <stop offset=".32" stopColor="#5CFFC0" stopOpacity=".18" />
          <stop offset="1" stopColor="#006E42" stopOpacity=".7" />
        </linearGradient>
        <linearGradient id="voltix-text-shine" x1="39" x2="116" y1="6" y2="26" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset=".42" stopColor="#F8FAFC" />
          <stop offset="1" stopColor="#CFE9DD" />
        </linearGradient>
        <filter id="voltix-v-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.4" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="0 0 0 0 0.094 0 0 0 0 1 0 0 0 0 0.541 0 0 0 .58 0"
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
        <clipPath id="voltix-v-clip">
          <path d="M2.7 3.5h7.15l5.05 15.65L20.05 3.5h7.25L17.5 30.4h-5.05L2.7 3.5Z" />
        </clipPath>
      </defs>

      <g filter="url(#voltix-v-glow)">
        <path d="M4.8 5.1h6.25l4.12 13.05L19.42 5.1h5.9L17.05 28.15h-3.92L4.8 5.1Z" fill="#002E1F" opacity=".75" transform="translate(1.6 1.5)" />
        <path d="M2.7 3.5h7.15l5.05 15.65L20.05 3.5h7.25L17.5 30.4h-5.05L2.7 3.5Z" fill="url(#voltix-v-edge)" />
        <path d="M6.35 5.8h3.35l5.25 16.05L20.2 5.8h3.42l-7.58 21.6h-2.22L6.35 5.8Z" fill="url(#voltix-v-face)" />
        <path d="M8.7 6.6h1.2l4.92 14.9L19.75 6.6h1.25l-5.62 17.52h-1.1L8.7 6.6Z" fill="#F4FFF9" opacity=".24" />
        <path d="M2.7 3.5h7.15l5.05 15.65L20.05 3.5h7.25L17.5 30.4h-5.05L2.7 3.5Z" fill="none" stroke="#B6FFE4" strokeOpacity=".28" strokeWidth=".65" />
        <ellipse cx="15" cy="30.3" rx="10.7" ry="2.25" fill="#18FF8A" opacity=".18" />
      </g>

      <g filter="url(#voltix-text-glow)">
        <text
          x="38"
          y="22.9"
          fill="url(#voltix-text-shine)"
          fontFamily="Inter, Satoshi, SF Pro Display, Arial, Helvetica, sans-serif"
          fontSize="17.2"
          fontWeight="900"
          letterSpacing="1.38"
        >
          VOLTIX
        </text>
        <rect x="38.3" y="8.3" width="76.5" height="5.4" rx="2.7" fill="#FFFFFF" opacity=".08" />
      </g>
    </svg>
  );
}
