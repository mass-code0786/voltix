export default function Loading() {
  return <main className="voltix-native-overlay" aria-live="polite">
    <div className="voltix-native-loader">
      <svg viewBox="0 0 120 120" className="voltix-native-v" aria-hidden="true">
        <defs>
          <linearGradient id="voltixRouteV" x1="26" y1="18" x2="91" y2="104" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ecfff7" />
            <stop offset=".36" stopColor="#18ff8a" />
            <stop offset="1" stopColor="#00b86b" />
          </linearGradient>
          <radialGradient id="voltixRouteGlow" cx="50%" cy="52%" r="58%">
            <stop stopColor="#18ff8a" stopOpacity=".76" />
            <stop offset="1" stopColor="#18ff8a" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx="60" cy="92" rx="40" ry="16" fill="url(#voltixRouteGlow)" opacity=".72" />
        <path d="M29 20h17l14 39 14-39h19L66 92l-6 12-6-12L29 20Z" fill="url(#voltixRouteV)" />
        <path d="M45 28 60 70l15-42" fill="none" stroke="#f3fff9" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity=".64" />
        <path d="M29 20h17l14 39 14-39h19L66 92l-6 12-6-12L29 20Z" fill="none" stroke="#9cffd9" strokeOpacity=".46" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    </div>
  </main>;
}
