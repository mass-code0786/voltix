import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function HomePage() {
  const currentUser = await getCurrentUser();
  if (currentUser) redirect("/dashboard");

  const androidHref = process.env.NEXT_PUBLIC_ANDROID_APK_URL || "/downloads/voltix.apk";
  const iosHref = process.env.NEXT_PUBLIC_IOS_APP_URL || process.env.NEXT_PUBLIC_IOS_IPA_URL || "#";

  return (
    <main className="voltix-landing">
      <header className="voltix-landing-header">
        <Link href="/" className="voltix-landing-logo" aria-label="Voltix home">
          <img src="/logo.png" alt="Voltix" />
        </Link>
        <nav className="voltix-landing-actions" aria-label="Account actions">
          <Link href="/auth?mode=login&returnTo=%2Fdashboard" className="voltix-landing-login">Login</Link>
          <Link href="/auth?mode=register&returnTo=%2Fdashboard" className="voltix-landing-register">Register</Link>
        </nav>
      </header>

      <section className="voltix-landing-hero" aria-label="Voltix mobile apps">
        <div className="voltix-landing-copy">
          <p>Welcome to VOLTIX</p>
          <h1>Trade Smarter. Earn Faster.</h1>
        </div>
        <div className="voltix-phone-stage">
          <img src="/mobile.png" alt="Voltix mobile app screens" className="voltix-hero-mobile-image" />
        </div>
      </section>

      <section className="voltix-install-grid" aria-label="Install Voltix">
        <InstallCard title="Install APK Android" button="Download APK" href={androidHref} />
        <InstallCard title="Install App iOS" button="Download iOS" href={iosHref} />
      </section>

      <footer className="voltix-landing-footer">Secure • Fast • Reliable</footer>
    </main>
  );
}

function InstallCard({ title, button, href }: { title: string; button: string; href: string }) {
  return (
    <article className="voltix-install-card">
      <h2>{title}</h2>
      <a href={href} className="voltix-install-button">{button}</a>
    </article>
  );
}
