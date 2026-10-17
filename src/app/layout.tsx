import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Wally — Take the scenic route to nowhere.',
  description: 'Discover a different side of your city. Interesting walking routes, little discoveries, and time to wander.',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#173e35' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
