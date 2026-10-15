import { useEffect, useRef, useState } from "react";

type Challenge = { id: string; step: number; total: number; pose: string | null; nonce: string; complete: boolean; expires_at: string };
type Props = {
  allowed?: boolean;
  purpose: "enroll" | "in" | "out";
  target?: { id: number; name: string };
  request: <T>(path: string, method?: string, body?: unknown) => Promise<T>;
  onVerified: (id: string) => Promise<void>;
};
const prompts: Record<string, string> = {
  front: "Look straight at the camera",
  left: "Turn your head slightly to your LEFT",
  right: "Turn your head slightly to your RIGHT",
  up: "Gently tilt your head up",
  down: "Gently tilt your head down",
  blink: "Look forward, close your eyes, then open them",
};
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function CameraChallenge({allowed=true, purpose, target, request, onVerified }: Props) {
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
      const c = await request<Challenge>("/face/challenges", "POST", { purpose, consent: true, ...(target ? { user_id: target.id } : {}) });
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
      const current = challenge;
      if (purpose !== "enroll" && current.pose === "capture") {
        const v = video.current;
        if (!v || v.readyState < 2 || !v.videoWidth || !stream.current?.active) throw new Error("Camera isn’t ready. Restart it and retry.");
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight));
        canvas.width = Math.round(v.videoWidth * scale); canvas.height = Math.round(v.videoHeight * scale);
        const data = new FormData();
        data.append("nonce", challenge.nonce);
        const seen = new Set<string>();
        const deadline = Date.now()+6000;
        let count=0;
        while(count<4){
          if(!active())return;
          if(v.readyState<2||!stream.current?.active)throw new Error("Camera stopped. Restart and retry.");
          canvas.getContext("2d", { willReadFrequently: true })!.drawImage(v, 0, 0, canvas.width, canvas.height);
          const encoded=canvas.toDataURL("image/jpeg", .9);
          if(!seen.has(encoded)){
            seen.add(encoded);
            const raw=atob(encoded.split(",")[1]);
            const blob=new Blob([Uint8Array.from(raw,c=>c.charCodeAt(0))],{type:"image/jpeg"});
            data.append("frames[]",blob,`frame-${count}.jpg`);
            if(count===0)data.append("photo",blob,"capture.jpg");
            count++;
            setStatus(`Checking live camera · ${count}/4 · hold naturally still…`);
          }
          if(Date.now()>deadline)throw new Error("Camera frames are not updating. Restart the camera and retry.");
          if(count<4)await new Promise(resolve=>setTimeout(resolve,250));
        }
        setStatus("Checking liveness and matching your enrolled face…");
        const next = await request<Challenge>(`/face/challenges/${challenge.id}/capture`, "POST", data);
        if (!active()) return;
        if (!next.complete) throw new Error("Face verification did not complete. Restart the camera and retry.");
        setChallenge(next);
        await onVerified(next.id);
        if (active()) stop();
        return;
      }
      const c = document.createElement("canvas");
      const data = new FormData();
      data.append("nonce", current.nonce);
      for (let n = 1; n > 0; n--) {
        if (!active()) return;
        setStatus(purpose !== "enroll" ? `${prompts[current.pose || "left"]}. Capturing in ${n}…` : `Starting in ${n}…`);
        await pause(1000);
      }
      const blinking = current.pose === "blink";
      const count = blinking ? 16 : 4;
      const capturedFrames = new Set<string>();
      const captureDeadline = Date.now() + 5000;
      for (let i = 0; i < count; i++) {
        if (!active()) return;
        const v = video.current;
        if (!v || v.readyState < 2 || !v.videoWidth || !stream.current?.active) throw new Error("Camera isn’t ready. Restart it and try again.");
        setStatus(blinking ? (i < 4 ? "OPEN — look forward" : i < 10 ? "CLOSE — for one second" : "OPEN — look forward") : "Hold still — capturing…");
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
        if (capturedFrames.has(encoded)) {
          if (Date.now() >= captureDeadline) throw new Error("Camera frames are not updating. Restart the camera and retry.");
          await pause(100);
          i--;
          continue;
        }
        capturedFrames.add(encoded);
        const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
        const blob = new Blob([bytes], { type: "image/jpeg" });
        data.append("frames[]", blob, `frame-${i}.jpg`);
        if (i < count - 1) await pause(blinking ? 180 : 150);
      }
      if (!active()) return;
      setStatus("Checking your live camera step…");
      const next = await request<Challenge>(`/face/challenges/${current.id}/step`, "POST", data);
      if (!active()) return;
      setChallenge(next);
      setStatus(next.complete ? "All steps verified. Saving…" : "Step verified. Follow the next prompt.");
      if (next.complete) { await onVerified(next.id); if (active()) stop(); }
    } catch (e) { if (active()) { setError((e as Error).message); setStatus(""); } }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }
  return <div className={`camera-flow${ready ? " is-ready" : ""}`}>
    <p className="camera-intro">{purpose === "enroll" ? (target ? `Ask ${target.name} to sit in front of the camera. Confirm their identity and permission before starting.` : "Three quick checks: look forward, look left, and look right.") : "Capture one image. We’ll match it against your enrolled face to record attendance."}</p>
    {purpose === "enroll" && <ol className="camera-steps" aria-label="Camera checks">
      {(purpose === "enroll" ? ["Look forward", "Look left", "Look right"] : ["Look forward", "Turn slightly", "Close & open eyes"]).map((title, i) => <li key={title} className={challenge?.step === i ? "current" : challenge && challenge.step > i ? "done" : ""}><span>{challenge && challenge.step > i ? "✓" : i + 1}</span>{title}</li>)}
    </ol>}
    <div className="camera">
      <video ref={video} autoPlay muted playsInline aria-label="Live camera preview" />
      <div className="face-guide" />
      {busy && <span className="capture-status" role="status">{status}</span>}
      {!ready && <span className="camera-placeholder">Your live camera preview</span>}
    </div>
    <div ref={instructions} className="camera-instructions" aria-live="polite" aria-atomic="true">
      {challenge && purpose === "enroll" && <>{purpose === "enroll" && <><small>STEP {Math.min(challenge.step + 1, challenge.total)} OF {challenge.total}</small><progress value={challenge.step} max={challenge.total} aria-label="Verified camera steps" /></>}<div className={`pose-example ${challenge.pose || "front"}`} aria-hidden="true"><svg viewBox="0 0 100 90"><g className="demo-face"><ellipse cx="50" cy="43" rx="23" ry="30"/><path d="M44 53 Q50 58 56 53"/><path className="demo-nose" d="M50 36 L48 46 L53 46"/><ellipse className="demo-eye" cx="39" cy="34" rx="3" ry="4"/><ellipse className="demo-eye" cx="61" cy="34" rx="3" ry="4"/></g>{challenge.pose === "left" && <path className="demo-arrow" d="M24 76 H5 M5 76 L12 69 M5 76 L12 83"/>}{challenge.pose === "right" && <path className="demo-arrow" d="M76 76 H95 M95 76 L88 69 M95 76 L88 83"/>}</svg></div><h3>{challenge.complete ? "All steps verified" : prompts[challenge.pose || "front"]}</h3></>}
      <p>{status || (purpose !== "enroll" ? "Look straight at the camera in good light. Tap Capture once and keep your face visible during the brief live check. No head turns needed." : challenge?.pose === "blink" ? "Press Start eye check. Keep eyes open first. When CLOSE appears, close both eyes for one second, then reopen them." : challenge?.pose === "left" || challenge?.pose === "right" ? "Turn a little, about 20°. Keep your whole face in view and hold still. Then press I’m ready — capture." : "Keep your face inside the oval with your eyes open. Press I’m ready — capture and hold still.")}</p>
    </div>
    {error && <div className="alert error" role="alert">{error}</div>}
    {!allowed && <p role="alert">You do not have permission for this action. Ask the Owner to update your access.</p>}
    <label className="consent"><input type="checkbox" checked={consent} disabled={busy} onChange={(e) => setConsent(e.target.checked)} />{purpose === "enroll" ? target ? "I have confirmed this user’s identity and obtained their consent for face enrollment." : "I consent to processing my camera images and storing my face template for attendance verification." : "I consent to matching this camera image with my enrolled face and storing it with my attendance record."}</label>
    <button className="primary wide" disabled={!allowed || busy || !consent} onClick={ready && challenge ? verify : start}>{busy ? "Verifying…" : !ready ? "Start camera" : challenge?.complete ? "Save verified result" : purpose !== "enroll" ? (purpose === "in" ? "Capture & check in" : "Capture & check out") : challenge?.pose === "blink" ? "Start eye check" : "I’m ready — capture"}</button>
    {ready && <button className="wide camera-restart" disabled={!allowed || busy} onClick={start}>Restart camera checks</button>}
    <small className="muted">Use your live face. Attendance uses face matching only. A printed or displayed photo may also match; no liveness or anti-spoof check is performed.</small>
  </div>;
}
