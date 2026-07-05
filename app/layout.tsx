import type { Metadata } from "next";
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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
