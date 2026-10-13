import { useEffect, useRef, useState } from "react";

type Challenge = { id: string; step: number; total: number; pose: string | null; nonce: string; complete: boolean; expires_at: string };
type Props = {
  purpose: "enroll" | "in" | "out";
  request: <T>(path: string, method?: string, body?: unknown) => Promise<T>;
  onVerified: (id: string) => Promise<void>;
};
const prompts: Record<string, string> = {
  front: "Look straight ahead with your eyes open",
  left: "Slowly turn your head to your left",
  right: "Slowly turn your head to your right",
  up: "Gently tilt your head up",
  down: "Gently tilt your head down",
  blink: "Look straight ahead. When prompted, close your eyes for one second, then reopen",
};
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function CameraChallenge({ purpose, request, onVerified }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const instructions = useRef<HTMLDivElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const alive = useRef(true);
  const running = useRef(false);
  const generation = useRef(0);
  const [ready, setReady] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  function stop() {
    generation.current++;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }
  useEffect(() => {
    alive.current = true;
    const hidden = () => {
      if (document.hidden) { stop(); setReady(false); setChallenge(null); setStatus("Camera paused. Restart when you’re ready."); }
    };
    document.addEventListener("visibilitychange", hidden);
    return () => { alive.current = false; stop(); document.removeEventListener("visibilitychange", hidden); };
  }, []);
  async function start() {
    if (running.current) return;
    running.current = true;
    setBusy(true); setError(""); setStatus(""); setReady(false); setChallenge(null);
    stop();
    const attempt = generation.current;
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera access needs HTTPS on phones and tablets. Open this app through a trusted HTTPS address. On this computer, localhost also works.");
      }
      const media = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "user" }, width: { ideal: 640 }, height: { ideal: 480 } } });
      if (!alive.current || attempt !== generation.current) { media.getTracks().forEach((t) => t.stop()); return; }
      stream.current = media;
      for (const track of media.getVideoTracks()) track.onended = () => { stop(); setReady(false); setChallenge(null); setError("Camera disconnected. Reconnect it and restart."); };
      const v = video.current!;
      v.srcObject = media;
      await v.play();
      const c = await request<Challenge>("/face/challenges", "POST", { purpose, consent: true });
      if (alive.current && attempt === generation.current) { setChallenge(c); setReady(true); }
    } catch (e) {
      stop();
      if (alive.current) {
        const err = e as Error;
        setError(err.name === "NotAllowedError" ? "Camera permission was denied. Allow camera access in your browser’s site settings, then retry." : err.name === "NotFoundError" ? "No camera found. Connect a webcam or open this page on your phone." : err.name === "NotReadableError" ? "Camera is in use. Close other camera apps, then retry." : err.message);
      }
    } finally { running.current = false; if (alive.current) setBusy(false); }
  }
  async function verify() {
    if (!challenge || running.current || !consent) return;
    running.current = true;
    setBusy(true); setError("");
    instructions.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const attempt = generation.current;
    const active = () => alive.current && attempt === generation.current;
    try {
      if (challenge.complete) { await onVerified(challenge.id); return; }
      const c = document.createElement("canvas");
      const data = new FormData();
      data.append("nonce", challenge.nonce);
      for (let n = 3; n > 0; n--) {
        if (!active()) return;
        setStatus(`Get ready… ${n}`);
        await pause(1000);
      }
      const blinking = challenge.pose === "blink";
      const count = blinking ? 16 : 4;
      for (let i = 0; i < count; i++) {
        if (!active()) return;
        const v = video.current;
        if (!v || v.readyState < 2 || !v.videoWidth || !stream.current?.active) throw new Error("Camera isn’t ready. Restart it and try again.");
        setStatus(blinking ? (i < 4 ? "Keep your eyes open" : i < 10 ? "Close your eyes now" : "Open your eyes again") : "Hold this position…");
        // Give time to react before collecting frames for each eye phase.
        if (blinking && [0,4,10].includes(i)) await pause(350);
        if (!active()) return;
        const scale = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight));
        c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale);
        c.getContext("2d", { willReadFrequently: true })!.drawImage(v, 0, 0, c.width, c.height);
        // Small, bounded frames: synchronous encoding avoids waiting indefinitely
        // for an idle canvas callback on constrained mobile browsers.
        const encoded = c.toDataURL("image/jpeg", .85).split(",")[1];
        if (!encoded) throw new Error("Capture failed. Restart the camera and retry.");
        const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
        const blob = new Blob([bytes], { type: "image/jpeg" });
        data.append("frames[]", blob, `frame-${i}.jpg`);
        await pause(blinking ? 180 : 250);
      }
      if (!active()) return;
      setStatus("Checking your live camera step…");
      const next = await request<Challenge>(`/face/challenges/${challenge.id}/step`, "POST", data);
      if (!active()) return;
      setChallenge(next);
      setStatus(next.complete ? "All steps verified. Saving…" : "Step verified. Follow the next prompt.");
      if (next.complete) { await onVerified(next.id); if (active()) stop(); }
    } catch (e) { if (active()) { setError((e as Error).message); setStatus(""); } }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }
  return <div className={`camera-flow${ready ? " is-ready" : ""}`}>
    <p className="camera-intro">{purpose === "enroll" ? "Enroll your own face once. We’ll check every direction and a slow blink before saving your profile." : "Complete the live camera checks to record your attendance."}</p>
    <div className="camera">
      <video ref={video} autoPlay muted playsInline aria-label="Live camera preview" />
      <div className="face-guide" />
      {!ready && <span className="camera-placeholder">Your live camera preview</span>}
    </div>
    <div ref={instructions} className="camera-instructions" aria-live="polite" aria-atomic="true">
      {challenge && <><small>STEP {Math.min(challenge.step + 1, challenge.total)} OF {challenge.total}</small><progress value={challenge.step} max={challenge.total} aria-label="Verified camera steps" /><h3>{challenge.complete ? "All steps verified" : prompts[challenge.pose || "front"]}</h3></>}
      <p>{status || "Use good lighting. Keep your whole face visible. No photo uploads."}</p>
    </div>
    {error && <div className="alert error" role="alert">{error}</div>}
    <label className="consent"><input type="checkbox" checked={consent} disabled={busy} onChange={(e) => setConsent(e.target.checked)} />{purpose === "enroll" ? "I consent to processing my camera images and storing my face template for attendance verification." : "I consent to live face verification and storing a photo with my attendance record."}</label>
    <button className="primary wide" disabled={busy || !consent} onClick={ready && challenge ? verify : start}>{busy ? "Verifying…" : !ready ? "Start camera" : challenge?.complete ? "Save verified result" : "Verify this step"}</button>
    {ready && <button className="wide camera-restart" disabled={busy} onClick={start}>Restart camera checks</button>}
    <small className="muted">Use your live face. Motion checks help reject static photos but cannot guarantee protection against video replay or virtual cameras.</small>
  </div>;
}
