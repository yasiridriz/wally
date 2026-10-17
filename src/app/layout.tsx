import type { Metadata, Viewport } from 'next';
// Self-hosted fonts: Fraunces for display text, DM Sans for everything else.
import '@fontsource-variable/fraunces';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/dm-sans/wght-italic.css';
import './globals.css';
export const metadata: Metadata = {
  title: 'Wally — Take the scenic route to nowhere.',
  description: 'Discover a different side of your city. Interesting walking routes, little discoveries, and time to wander.',
};
// viewport-fit=cover exposes the safe-area insets that the floating phone panels respect.
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#214d3c' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
