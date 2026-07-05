import Link from "next/link";

export default function NotFound() {
  return <main className="system-state-page grid place-items-center p-4">
    <section className="system-state-card">
      <StateVisual/>
      <h1>Page Not Found</h1>
      <p>The page you are looking for is unavailable or has moved inside Voltix.</p>
      <Link href="/">Back to Home</Link>
    </section>
  </main>;
}

function StateVisual() {
  return <svg viewBox="0 0 180 126" aria-hidden="true">
    <defs><radialGradient id="notFoundGlow" cx="50%" cy="65%" r="58%"><stop stopColor="#18ff8a" stopOpacity=".42"/><stop offset="1" stopColor="#18ff8a" stopOpacity="0"/></radialGradient></defs>
    <ellipse cx="90" cy="100" rx="58" ry="18" fill="url(#notFoundGlow)"/>
    <ellipse cx="90" cy="96" rx="52" ry="13" fill="#06110d" stroke="#18ff8a" strokeOpacity=".42" strokeDasharray="24 12"/>
    <path d="M66 30h48l18 18v35H48V48l18-18Z" fill="rgba(24,255,138,.08)" stroke="#18ff8a" strokeOpacity=".4"/>
    <path d="M72 58h36M78 72h24" stroke="#9cffd9" strokeOpacity=".52" strokeLinecap="round"/>
    <text x="90" y="51" textAnchor="middle" fill="#18ff8a" fontSize="18" fontWeight="900">404</text>
  </svg>;
}
