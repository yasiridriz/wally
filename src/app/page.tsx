import WallyApp from '@/components/wally-app';
export const dynamic = 'force-dynamic';
export default function Home() {
  return <WallyApp hasRoutingKey={Boolean(process.env.GOOGLE_MAPS_API_KEY?.trim() && process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim())} />;
}
