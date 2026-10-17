import Link from 'next/link';
export default function TermsPage() {
  return <main style={{ maxWidth: 700, margin: '64px auto', padding: 24, lineHeight: 1.8 }}>
    <Link href="/">← Back to Wally</Link><h1>Terms of use</h1>
    <p>Wally is an experimental walking-discovery application. Walking times and scenic scores are estimates. Check local access, conditions, and signs. Google walking directions may not include all sidewalks or pedestrian paths; use caution.</p>
    <p>Google Maps features are subject to the <a href="https://www.google.com/intl/en_us/help/terms_maps/" target="_blank" rel="noreferrer">Google Maps/Google Earth Additional Terms of Service</a> and <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google Privacy Policy</a>.</p>
    <p>Demo routes are illustrative sample paths with unverified times. All sample events are fictional and are not real listings. Availability depends on mapping providers and internet access. This hackathon MVP is provided as available, without guarantees of route access or suitability.</p>
    <p>Read Wally’s <Link href="/privacy">privacy information</Link> to learn how location and preferences are used.</p>
  </main>;
}
