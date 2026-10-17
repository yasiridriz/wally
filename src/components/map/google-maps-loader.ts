let mapsPromise: Promise<typeof google.maps> | undefined;
type MapsWindow = Window & { google?: typeof google; __wallyGoogleMapsReady?: () => void; gm_authFailure?: () => void };

/** One official direct-script load shared by all map mounts. */
export function loadGoogleMaps(): Promise<typeof google.maps> {
  const browser = window as MapsWindow;
  if (browser.google?.maps?.marker?.AdvancedMarkerElement) return Promise.resolve(browser.google.maps);
  if (mapsPromise) return mapsPromise;
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return Promise.reject(new Error("Google Maps needs NEXT_PUBLIC_GOOGLE_MAPS_API_KEY. Configure the browser key to choose locations on a live map."));
  mapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => fail("Google Maps took too long to load. Check your connection and refresh."), 20000);
    function fail(message: string) { window.clearTimeout(timeout); reject(new Error(message)); }
    browser.__wallyGoogleMapsReady = () => {
      window.clearTimeout(timeout);
      if (browser.google?.maps?.marker?.AdvancedMarkerElement) resolve(browser.google.maps);
      else fail("Google Maps couldn’t initialise its markers. Check your Maps JavaScript API setup.");
    };
    browser.gm_authFailure = () => {
      const message = "Google Maps couldn’t authorise this browser key. Check billing, Maps JavaScript API access and allowed website referrers.";
      fail(message);
      window.dispatchEvent(new CustomEvent("wally:maps-auth-error", { detail: message }));
    };
    script.src = `https://maps.googleapis.com/maps/api/js?${new URLSearchParams({ key: apiKey, loading: "async", libraries: "marker", callback: "__wallyGoogleMapsReady", v: "weekly" })}`;
    script.async = true;
    script.onerror = () => fail("Google Maps couldn’t load. Check your connection and browser content blockers, then refresh.");
    document.head.appendChild(script);
  });
  return mapsPromise;
}
