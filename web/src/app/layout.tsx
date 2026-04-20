import type { Metadata } from "next";
import { Inter_Tight, JetBrains_Mono, DM_Sans } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "sonner";
import "./globals.css";

const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "pointcloud·3d — studio",
  description:
    "Turn any photo into a 3D point cloud tuned for inner-crystal laser engraving.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        data-theme="light"
        className={`${interTight.variable} ${jetbrainsMono.variable} ${dmSans.variable}`}
      >
        <body>
          {children}
          <Toaster richColors />
        </body>
      </html>
    </ClerkProvider>
  );
}
