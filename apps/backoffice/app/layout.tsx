import type { Metadata } from "next";
import "./globals.css";
import { ConfirmProvider, Toaster } from "@/components/controls";
import { LangProvider } from "@/components/lang";
import { getPrefs } from "@/lib/prefs";

export const metadata: Metadata = {
  title: { default: "Orda Backoffice", template: "%s · Orda" },
  description: "Orda: point of sale and backoffice for your cafés",
  applicationName: "Orda",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { theme, lang } = await getPrefs();
  return (
    <html lang={lang} data-theme={theme} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&display=swap"
        />
      </head>
      <body className="min-h-dvh font-sans antialiased">
        <LangProvider lang={lang}>
          <ConfirmProvider>{children}</ConfirmProvider>
          <Toaster />
        </LangProvider>
      </body>
    </html>
  );
}
