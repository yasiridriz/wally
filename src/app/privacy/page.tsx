import Link from 'next/link';
export default function PrivacyPage() {
  return <main style={{ maxWidth: 700, margin: '64px auto', padding: 24, lineHeight: 1.8 }}>
    <Link href="/">← Back to Wally</Link><h1>Privacy</h1>
    <p>Wally uses your selected start, destination, walking preferences, and visited-place IDs to suggest walks. In Live Mode, if you search for walks without choosing a start, Wally asks your browser for your current location. Location access is optional: you can deny it and choose a place through search or the map instead. You can also request your location with the location button.</p>
    <p>Preferences and visited-place IDs are stored in your browser’s localStorage. Clear your browser’s site data to remove them. Wally has no accounts, database, or analytics integration.</p>
    <p>Live map interactions load Google Maps in your browser. When you type three or more characters in a place field, Wally sends your search text and a nearby location bias to Google Places through Wally’s server. Walking and nearby-place requests also send coordinates to Google Maps Platform. When you select a live route, Wally’s server asks Google Places for up to three photos of its stops; your browser then loads those images directly from Google. Generated routes and requests are retained temporarily in server memory for event detours and walk previews and expire after 20 minutes. The “Get me to Google Maps” button opens Google Maps with the route start, stops, and finish in the link. Hosting providers may keep ordinary request logs.</p>
    <p>Google handles information under its <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>. Demo route generation uses local sample data; loading an interactive Google map still contacts Google. Without a map key, sample routes use a local schematic preview.</p>
  </main>;
}
