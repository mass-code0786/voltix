"use client";

import { useEffect, useState } from "react";

const SPLASH_DURATION_MS = 2800;
const REDUCED_MOTION_DURATION_MS = 650;

export function AppLaunchSplash() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setVisible(false), reducedMotion ? REDUCED_MOTION_DURATION_MS : SPLASH_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="app-launch-splash" aria-hidden="true">
      <div className="app-launch-particles">
        {Array.from({ length: 16 }).map((_, index) => {
          const style = {
            "--i": index,
            "--x": `${(index * 37) % 100}%`,
            "--y": `${12 + ((index * 29) % 72)}%`,
            "--h": `${14 + (index % 5) * 5}px`,
          } as React.CSSProperties;
          return <i key={index} style={style} />;
        })}
      </div>
      <div className="app-launch-logo-scene">
        <div className="app-launch-glow" />
        <div className="app-launch-logo-shell">
          <img src="/apk-icon.png" alt="" draggable={false} />
          <span />
        </div>
      </div>
    </div>
  );
}
