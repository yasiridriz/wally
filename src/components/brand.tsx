import Link from "next/link";
import { FlaskConical } from "lucide-react";

/** A rounded square with a meandering dotted path from a start dot to an end dot. */
export function BrandMark({ size = 32 }: { size?: number }) {
  return <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <rect width="32" height="32" rx="9" fill="var(--forest)" />
    <path d="M8.5 23.5c2.5-.5 2.8-5.6 6.4-5.8 3.4-.2 3.6 3.6 7 2.2 3-1.3 1.6-6.6-.4-9.2" fill="none" stroke="var(--cream)" strokeWidth="1.7" strokeLinecap="round" strokeDasharray="0.1 3.4" />
    <circle cx="8.5" cy="23.5" r="2.3" fill="var(--cream)" />
    <circle cx="21.5" cy="10.5" r="2.3" fill="var(--sage)" />
  </svg>;
}

export function Brand({ compact = false, tagline = false }: { compact?: boolean; tagline?: boolean }) {
  return <div className={`brand ${compact ? "compact" : ""}`}>
    <Link className="brand-link" href="/" aria-label="Wally home"><BrandMark size={compact ? 26 : 34} /><span className="wordmark">wally</span></Link>
    {tagline ? <p className="brand-tagline">Take the scenic route to nowhere.</p> : null}
  </div>;
}

export function DemoToggle({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled?: boolean }) {
  return <button type="button" className={`demo-pill ${on ? "on" : ""}`} aria-pressed={on} onClick={onToggle} disabled={disabled} title={on ? "Sample Edinburgh walks are on" : "Use sample Edinburgh walks"}>
    <FlaskConical size={12} aria-hidden="true" />Demo
  </button>;
}

export function LegalLinks() {
  return <nav className="legal-links" aria-label="Legal"><Link href="/terms">Terms of use</Link><Link href="/privacy">Privacy</Link></nav>;
}
