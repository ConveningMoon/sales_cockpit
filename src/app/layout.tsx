import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ITMANO Sales Cockpit",
  description: "Herramienta interna de prospección B2B",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`dark ${inter.variable}`}>
      <body className="min-h-screen bg-background text-foreground antialiased font-sans">
        {children}
        <Toaster position="bottom-right" richColors closeButton theme="dark" />
      </body>
    </html>
  );
}
