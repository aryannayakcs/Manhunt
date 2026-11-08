import type { Metadata, Viewport } from 'next';
import { Barlow_Condensed, Inter, JetBrains_Mono } from 'next/font/google';
import 'maplibre-gl/dist/maplibre-gl.css';
import './globals.css';

const disp = Barlow_Condensed({ subsets: ['latin'], weight: ['600', '800'], variable: '--font-disp' });
const ui = Inter({ subsets: ['latin'], variable: '--font-ui' });
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['700', '800'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Manhunt',
  description: 'Real-life tag after dark. Your phone is the referee.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'Manhunt', statusBarStyle: 'black-translucent' },
};
export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: 'cover', themeColor: '#000000',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${disp.variable} ${ui.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
