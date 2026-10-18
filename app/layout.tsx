import './globals.css';
import Providers from './providers';
import type { Metadata, Viewport } from 'next';
import { TelegramAppShell } from '@/components/TelegramAppShell';

export const metadata: Metadata = {
  title: 'TZ Store — Telegram Mini App',
  description: 'TZ Store — Telegram Mini App & Web Storefront',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'TZ Store' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#2481CC',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="antialiased overflow-x-hidden">
        <Providers>
          <TelegramAppShell>{children}</TelegramAppShell>
        </Providers>
      </body>
    </html>
  );
}
