import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Kerf — Material Cut List",
  description:
    "Estimate stock material, break down the cuts on every bar, and send your boss a PNG snapshot.",
  applicationName: "Kerf",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Kerf",
    statusBarStyle: "black-translucent",
  },
  // The apple-touch icon comes from app/apple-icon.tsx; Next wires it up.
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0b1220",
  width: "device-width",
  initialScale: 1,
  // The app is a fixed-width tool; letting iOS zoom on rotate breaks the layout.
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
