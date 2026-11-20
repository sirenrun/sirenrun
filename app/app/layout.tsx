import type { Metadata } from "next";
import { Barlow_Condensed, Inter } from "next/font/google";
import type { ReactNode } from "react";
import { Header } from "../components/header";
import { Providers } from "../components/providers";
import { Toasts } from "../components/toasts";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const display = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "800"],
  style: ["normal", "italic"],
  variable: "--font-barlow",
});

export const metadata: Metadata = {
  title: "SIRENRUN",
  description: "Drive an onchain getaway. Trade how long it lasts.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable}`}>
      <body className="font-sans antialiased">
        <Providers>
          <Header />
          {children}
          <Toasts />
        </Providers>
      </body>
    </html>
  );
}
