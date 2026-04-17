import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "pointcloud3D — sharper point clouds for crystal laser engraving",
    template: "%s · pointcloud3D",
  },
  description:
    "Turn photos into 3D point clouds optimized for inner-crystal laser engraving. Pay per export or subscribe. Unlimited re-exports per photo for 30 days.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://pointcloud3d.com",
  ),
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col">
          {children}
          <Toaster richColors position="top-center" />
        </body>
      </html>
    </ClerkProvider>
  );
}
