import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ballast — the guardian inclinometer',
  description:
    "A liquidation guardian on KeeperHub. Watch a loan position's health factor; when a crash threatens, Ballast repays the debt and the needle swings back to green.",
};

export const viewport: Viewport = {
  themeColor: '#0E1B24',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Typefaces load in the browser (not at build), so an offline build still succeeds. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {children}
      </body>
    </html>
  );
}
