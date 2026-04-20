import type { Metadata } from "next";
import { Inter_Tight, JetBrains_Mono } from "next/font/google";
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

export const metadata: Metadata = {
  title: "pointcloud3D — Photo to 3D point cloud for crystal engraving",
  description:
    "Turn any photo into a 3D point cloud of 500k–2M fracture points, tuned for inner-crystal laser engraving.",
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
        className={`${interTight.variable} ${jetbrainsMono.variable}`}
      >
        <body className="flex min-h-screen flex-col">
          {children}
          <Toaster richColors />
        </body>
      </html>
    </ClerkProvider>
  );
}
