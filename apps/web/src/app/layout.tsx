import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  Architects_Daughter,
  Caveat,
  Geist,
  Geist_Mono,
  Inter,
  JetBrains_Mono,
  Plus_Jakarta_Sans,
} from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
  weight: ["500", "700"],
});

const architectsDaughter = Architects_Daughter({
  variable: "--font-chalk",
  subsets: ["latin"],
  weight: ["400"],
});

export const metadata: Metadata = {
  title: "Chitran",
  description: "Chitran — collaborative drawing canvas with Slides, AI, and MCP.",
};

const THEME_INIT_SCRIPT = `
(function() {
  try {
    var t = localStorage.getItem('excalidraw:theme');
    document.documentElement.dataset.theme = (t === 'light' || t === 'dark') ? t : 'dark';
  } catch (e) {
    document.documentElement.dataset.theme = 'dark';
  }
})();
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  const fontClasses = [
    geistSans.variable,
    geistMono.variable,
    plusJakartaSans.variable,
    inter.variable,
    jetBrainsMono.variable,
    caveat.variable,
    architectsDaughter.variable,
  ].join(" ");

  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${fontClasses} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
