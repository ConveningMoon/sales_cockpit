import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ITMANO Sales Cockpit",
  description: "Herramienta interna de prospección B2B",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-white text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
