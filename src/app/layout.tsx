import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "English Buddy - Practice English with Real People",
  description: "Call partners, practice English, get AI-powered grammar reports.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" style={{colorScheme: 'light'}}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
