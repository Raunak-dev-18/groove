import type { Metadata } from "next";
import { Quicksand } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { SwRegister } from "@/components/sw-register";

const quicksand = Quicksand({
  subsets: ["latin"],
  variable: "--font-quicksand",
});

export const metadata: Metadata = {
  title: "Groove — Music, together",
  description:
    "Stream music, host live Jams with friends, blend your tastes, and follow your favorite artists.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={quicksand.variable}>
      <body className="min-h-screen bg-brand font-sans text-softwhite antialiased">
        <Providers>{children}</Providers>
        <SwRegister />
      </body>
    </html>
  );
}
