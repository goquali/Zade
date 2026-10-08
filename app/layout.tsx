import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Zade | Baby Dashboard", description: "Private baby care dashboard" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
