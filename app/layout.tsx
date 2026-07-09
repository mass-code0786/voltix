import type { Metadata } from "next";
import type { Viewport } from "next";
import { CapacitorBridge } from "@/components/capacitor-bridge";
import "./globals.css";

export const metadata: Metadata = {
  title: "Voltix | Digital Asset Network",
  description: "Digital asset, copy strategy and network rewards dashboard",
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
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
