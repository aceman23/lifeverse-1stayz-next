import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "1Stayz by Lifeverse",
  icons: {
    icon: { url: "/icons/favicon.ico", type: "image/x-icon" },
    // iOS home-screen icons must be PNG; .ico isn't supported there.
    apple: "/icons/ic_fav_lifeverse.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
