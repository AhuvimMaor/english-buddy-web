import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "English Buddy",
  description: "Practice English with real people. Get AI-powered feedback.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geist.variable} h-full`} style={{colorScheme: 'light'}} data-theme="light">
      <body className="min-h-full font-sans antialiased" style={{background: '#f8f9fa', color: '#1c1e21'}}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
