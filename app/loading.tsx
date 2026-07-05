export default function Loading() {
  return <main className="system-state-page grid place-items-center p-4">
    <section className="system-state-card">
      <svg viewBox="0 0 180 126" aria-hidden="true">
        <defs><radialGradient id="loadingGlow" cx="50%" cy="65%" r="58%"><stop stopColor="#18ff8a" stopOpacity=".42"/><stop offset="1" stopColor="#18ff8a" stopOpacity="0"/></radialGradient></defs>
        <ellipse cx="90" cy="100" rx="58" ry="18" fill="url(#loadingGlow)"/>
        <ellipse cx="90" cy="96" rx="52" ry="13" fill="#06110d" stroke="#18ff8a" strokeOpacity=".42" strokeDasharray="24 12"/>
        <path d="M74 34H62l20 47 8 14 8-14 20-47h-12L90 71 74 34Z" fill="#18ff8a" fillOpacity=".28" stroke="#9cffd9" strokeOpacity=".48"/>
      </svg>
      <h1>Loading</h1>
      <p>Preparing the latest Voltix market data and account experience.</p>
    </section>
  </main>;
}
