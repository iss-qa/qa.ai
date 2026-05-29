import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import { ThemeProvider, THEME_INIT_SCRIPT } from "@/components/theme/theme-provider";

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: "QAMind - Plataforma de Automação de Testes",
  description: "IA Generativa para Automação de QA",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // `dark` is set pre-paint by THEME_INIT_SCRIPT; suppressHydrationWarning
    // avoids a mismatch warning on the class it toggles.
    <html lang="pt-BR" className={cn("font-sans", inter.variable)} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="antialiased bg-background text-foreground">
        <ThemeProvider>
          <NuqsAdapter>
            {children}
          </NuqsAdapter>
        </ThemeProvider>
      </body>
    </html>
  );
}
