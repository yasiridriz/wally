"use client";

import dynamic from "next/dynamic";
import { Compass } from "lucide-react";
import DesktopPanel from "./desktop-panel";
import MobilePlanner from "./mobile-planner";
import { useIsDesktop, usePlanner } from "./use-planner";

const WanderMap = dynamic(() => import("./map/wander-map"), { ssr: false, loading: () => <div className="map-state"><Compass size={28} /><span>Loading map…</span></div> });
const EDINBURGH_CENTER = { lat: 55.9533, lng: -3.1883 };

/** A map-first page: one planner state feeds the desktop panel and the phone layout. */
export default function WallyApp({ hasRoutingKey }: { hasRoutingKey: boolean }) {
  const planner = usePlanner(hasRoutingKey && Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY));
  const desktop = useIsDesktop();
  return <main className={`wally ${desktop ? "is-desktop" : "is-phone"}`}>
    <div className="map-area">
      <WanderMap initialCenter={EDINBURGH_CENTER} start={planner.effectiveStart} startLabel={planner.demo ? "The Meadows · sample start" : planner.start?.label}
        destination={planner.effectiveDestination} routes={planner.shownRoutes} selected={planner.shownRoute} event={planner.preview?.event || planner.selected?.event}
        compact={!desktop} layoutKey={`${desktop}:${planner.loading}:${planner.routes.length}`}
        picking={planner.picking} onPick={planner.dropPin} onCancelPick={planner.cancelPicking}
        onSelectRoute={planner.selectRoute} onCenterChange={planner.setMapCenter} />
    </div>
    {desktop ? <DesktopPanel planner={planner} /> : <MobilePlanner planner={planner} />}
  </main>;
}
