import type { Metadata } from "next";
import type { Viewport } from "next";
import { CapacitorBridge } from "@/components/capacitor-bridge";
import "./globals.css";

export const metadata: Metadata = {
  title: "Voltix | Digital Asset Network",
  description: "Digital asset, copy strategy and network rewards dashboard",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/apk-icon-32-v2.png", sizes: "32x32", type: "image/png" },
      { url: "/apk-icon-192-v2.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/apk-icon-32-v2.png",
    apple: [{ url: "/apk-icon-180-v2.png", sizes: "180x180", type: "image/png" }],
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
        <CapacitorBridge />
        {children}
      </body>
    </html>
  );
}
