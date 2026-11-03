import type { Metadata } from "next";
import { Caveat, DM_Sans } from "next/font/google";
import { Footer } from "@/components/footer";
import { Nav } from "@/components/nav";
import { ExtensionAutoConnect } from "@/features/extension/components/auto-connect";
import "./globals.css";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", weight: ["400", "500", "600", "700", "800"] });
const caveat = Caveat({ subsets: ["latin"], variable: "--font-caveat", weight: ["500"] });

export const metadata: Metadata = {
  title: "Ranklark — rank-first App Store optimization",
  description:
    "Track real App Store keyword ranks for your apps, find keywords worth targeting, and audit your metadata. Every number labelled with where it came from.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${caveat.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh">
        <Nav />
        <ExtensionAutoConnect />
        {children}
        <Footer />
      </body>
    </html>
  );
}
