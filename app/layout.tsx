import type { Metadata } from "next";
import type { Viewport } from "next";
import { AppLaunchSplash } from "@/components/app-launch-splash";
import { CapacitorBridge } from "@/components/capacitor-bridge";
import "./globals.css";

export const metadata: Metadata = {
  title: "Voltix | Digital Asset Network",
  description: "Digital asset, copy strategy and network rewards dashboard",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/apk-icon.png",
    shortcut: "/apk-icon.png",
    apple: "/apk-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#050807",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppLaunchSplash />
        <CapacitorBridge />
        {children}
      </body>
    </html>
  );
}
