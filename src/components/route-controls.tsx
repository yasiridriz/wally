"use client";

import { ArrowRight, CircleHelp, Footprints, Leaf, MapPin, Navigation, Repeat2, Sparkles, Trees, Landmark, Compass } from "lucide-react";
import type { GenerateRequest, Mood } from "@/lib/types";

export type Preferences = Pick<GenerateRequest, "duration" | "mood" | "mode" | "includeEvents" | "demo">;
const moods: { value: Mood; label: string; icon: typeof Leaf }[] = [
  { value: "surprise", label: "Surprise me", icon: Sparkles },
  { value: "scenic", label: "Scenic", icon: Leaf },
  { value: "green", label: "Green & peaceful", icon: Trees },
  { value: "historic", label: "Historic", icon: Landmark },
  { value: "hidden", label: "Hidden gems", icon: Compass },
];

export default function RouteControls({ preferences, onChange, onGenerate, onLocate, locating, loading, locationLabel }: {
  preferences: Preferences; onChange: (value: Preferences) => void; onGenerate: () => void; onLocate: () => void;
  locating: boolean; loading: boolean; locationLabel: string;
}) {
  const update = (value: Partial<Preferences>) => onChange({ ...preferences, ...value });
  return <div className="controls-content">
    <div className="eyebrow"><span className="status-dot" /> A LITTLE CURIOSITY GOES A LONG WAY</div>
    <h1>Your next little<br />adventure starts here<span className="accent-dot">.</span></h1>
    <p className="intro-copy">A fresh perspective. A few unexpected turns.<br />Let’s see where your feet take you.</p>
    <div className="location-field"><MapPin size={19} /><div><span className="field-caption">STARTING FROM</span><strong>{locationLabel}</strong></div><button className="icon-button" onClick={onLocate} disabled={locating || loading || preferences.demo} title={preferences.demo ? "Switch to Live Mode to use your location" : "Use my current location"} aria-label="Use my current location"><Navigation size={17} className={locating ? "pulse" : ""} /></button></div>
    <p className="map-help">{preferences.demo ? "Sample walks start in central Edinburgh." : "Tap anywhere on the map to change your start."}</p>
    <fieldset><legend>How much time have you got?</legend><div className="duration-options">{([15, 30, 45, 60, 90] as const).map(value => <button key={value} disabled={loading} aria-pressed={preferences.duration === value} className={preferences.duration === value ? "duration active" : "duration"} onClick={() => update({ duration: value })}><strong>{value}</strong><span>min</span></button>)}</div></fieldset>
    <fieldset><legend>What’s your mood?</legend><div className="mood-options">{moods.map(({ value, label, icon: Icon }) => <button key={value} disabled={loading} aria-pressed={preferences.mood === value} className={preferences.mood === value ? "mood active" : "mood"} onClick={() => update({ mood: value })}><Icon size={15} />{label}</button>)}</div></fieldset>
    <fieldset><legend>Where shall we end up?</legend><div className="mode-options"><button disabled={loading} aria-pressed={preferences.mode === "loop"} className={preferences.mode === "loop" ? "mode active" : "mode"} onClick={() => update({ mode: "loop" })}><Repeat2 size={17} /><span>Make a loop<small>Back where you started</small></span></button><button disabled={loading} aria-pressed={preferences.mode === "explore"} className={preferences.mode === "explore" ? "mode active" : "mode"} onClick={() => update({ mode: "explore" })}><Footprints size={17} /><span>Keep exploring<small>Somewhere new</small></span></button></div></fieldset>
    <label className="toggle-row"><span><strong>A little something happening</strong><small>Find sample event detours along the way</small></span><input type="checkbox" checked={preferences.includeEvents} disabled={loading} onChange={event => update({ includeEvents: event.target.checked })} /><span className="toggle-track" aria-hidden="true" /></label>
    <button className="primary-button" onClick={onGenerate} disabled={loading}>{loading ? "Finding your kind of wander…" : "Take me somewhere"}{loading ? <span className="button-loader" /> : <ArrowRight size={19} />}</button>
    <div className="controls-footer"><span><Footprints size={13} /> The journey is the whole point.</span><label className="demo-switch"><input type="checkbox" checked={preferences.demo} disabled={loading} onChange={event => update({ demo: event.target.checked })} />Demo Mode <CircleHelp size={12} /></label></div>
  </div>;
}
