import type { Metadata, Viewport } from "next";
import { Comfortaa, Montserrat } from "next/font/google";
import "./globals.css";

// Comfortaa and Metropolis are the faces padelbaycourts.com ships. Metropolis is not on
// Google Fonts, so Montserrat (its closest geometric sibling) stands in for body copy.
const comfortaa = Comfortaa({
  variable: "--font-comfortaa",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Padel Bay Beirut · be the vibe",
    template: "%s · Padel Bay Beirut",
  },
  description:
    "Padel Bay, Ramlet El Baida: an AI-powered sports and hospitality destination. Courts, Sip café, Bay Suites and the Padel Bay club. Interactive demo by Brains AI Solutions.",
  icons: { icon: "/favicon.ico" },
};

export const viewport: Viewport = {
  themeColor: "#0a1d20",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${comfortaa.variable} ${montserrat.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
