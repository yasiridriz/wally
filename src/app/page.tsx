import WallyApp from '@/components/wally-app';
export const dynamic = 'force-dynamic';
export default function Home() {
  return <WallyApp hasRoutingKey={Boolean(process.env.OPENROUTESERVICE_API_KEY?.trim())} />;
}
