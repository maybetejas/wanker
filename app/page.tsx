"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Particle = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  opacity: number;
  emoji: string;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export default function Home() {
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [arousal, setArousal] = useState(0);
  const [intensity, setIntensity] = useState(0);
  const [hasMotionStarted, setHasMotionStarted] = useState(false);
  const [strokesPerSec, setStrokesPerSec] = useState(0);
  const [testMode, setTestMode] = useState(false);
  const [simIntensity, setSimIntensity] = useState(65);
  const [simulating, setSimulating] = useState(false);
  const [repeatStroke, setRepeatStroke] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [burst, setBurst] = useState(false);
  const [rawAccel, setRawAccel] = useState({ x: 0, y: 0, z: 0 });
  const [particles, setParticles] = useState<Particle[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hapticsOn, setHapticsOn] = useState(true);
  const [sensitivity, setSensitivity] = useState(6); // 1-10
  const [vibrationIntensity, setVibrationIntensity] = useState(7); // 1-10
  const [peakCount, setPeakCount] = useState(0);

  const prevMagnitude = useRef(0);
  const lastMotionTimestamp = useRef(0);
  const frameRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const repeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const peakLockRef = useRef(false);
  const peakHoldStartRef = useRef(0);
  const particleIdRef = useRef(0); 
  const strokeEvents = useRef<number[]>([]);
  const arousalRef = useRef(0);
  const intensityRef = useRef(0);
  const pausedRef = useRef(false);
  const cooldownRef = useRef(0);
  const lastHapticAtRef = useRef(0);
  const motionKickRef = useRef(0);
  const burstIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const burstTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const colorMeter = useMemo(() => {
    if (arousal < 35) return "from-sky-400 to-indigo-500";
    if (arousal < 75) return "from-violet-500 to-fuchsia-500";
    return "from-rose-500 to-orange-400";
  }, [arousal]);
  const hapticsSupported = "vibrate" in navigator;

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    cooldownRef.current = cooldown;
  }, [cooldown]);

  useEffect(() => {
    arousalRef.current = arousal;
  }, [arousal]);

  useEffect(() => {
    intensityRef.current = intensity;
  }, [intensity]);

  const scaleVibrate = (pattern: number | number[], intensity01: number) => {
    const scale = 0.4 + intensity01 * 0.9; // avoid fully silent at low values
    if (typeof pattern === "number") return Math.max(0, Math.round(pattern * scale));
    return pattern.map((ms) => Math.max(0, Math.round(ms * scale)));
  };
  const feedMotion = useCallback(
    (x: number, y: number, z: number) => {
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      const delta = Math.abs(magnitude - prevMagnitude.current);
      prevMagnitude.current = magnitude;
      lastMotionTimestamp.current = performance.now();
      setRawAccel({ x, y, z });

      if (delta > 1.2) motionKickRef.current = Math.min(8, motionKickRef.current + 1);
      else motionKickRef.current = Math.max(0, motionKickRef.current - 1);
      if (!hasMotionStarted && motionKickRef.current >= 3) setHasMotionStarted(true);

      if (!hasMotionStarted) {
        setIntensity((prev) => {
          const next = prev * 0.85;
          intensityRef.current = next;
          return next;
        });
        return;
      }

      const gainScale = 3 + sensitivity; // sensitivity 1-10 => 4..13
      setIntensity((prev) => {
        const next = prev * 0.7 + delta * gainScale;
        intensityRef.current = next;
        return next;
      });
    },
    [sensitivity, hasMotionStarted],
  );

  const triggerBurst = () => {
    setBurst(true);
    setTimeout(() => setBurst(false), 220);

    const count = 12;
    const burstEmojis = ["💦", "✨", "💧", "⚡"];
    const now = performance.now();
    const spawned: Particle[] = Array.from({ length: count }, () => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
      const speed = 4 + Math.random() * 4;
      return {
        id: particleIdRef.current++,
        x: 0,
        y: 0,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: now + 1000 + Math.random() * 800,
        opacity: 1,
        emoji: burstEmojis[Math.floor(Math.random() * burstEmojis.length)],
      };
    });
    setParticles((prev) => [...prev, ...spawned]);
  };

  const triggerBurstStream = useCallback((durationMs = 3500, tickMs = 180) => {
    if (burstIntervalRef.current) clearInterval(burstIntervalRef.current);
    if (burstTimeoutRef.current) clearTimeout(burstTimeoutRef.current);

    triggerBurst();
    burstIntervalRef.current = setInterval(() => {
      triggerBurst();
    }, tickMs);

    burstTimeoutRef.current = setTimeout(() => {
      if (burstIntervalRef.current) clearInterval(burstIntervalRef.current);
      burstIntervalRef.current = null;
    }, durationMs);
  }, []);

  const runPeakPulse = useCallback(() => {
    if (peakLockRef.current) return;
    peakLockRef.current = true;
    triggerBurstStream(3600, 170);
    if (hapticsOn && hapticsSupported) {
      const intensity01 = vibrationIntensity / 10;
      navigator.vibrate(
        scaleVibrate([300, 150, 250, 120, 300, 400, 200, 150, 180, 800], intensity01),
      );
    }
    setArousal(20);
    setCooldown(10);
    setPeakCount((prev) => prev + 1);
    setTimeout(() => {
      peakLockRef.current = false;
    }, 10_000);
  }, [hapticsOn, vibrationIntensity, hapticsSupported, triggerBurstStream]);

  useEffect(() => {
    if (!started) return;
    const onMotion = (e: DeviceMotionEvent) => {
      if (pausedRef.current) return;
      const x = e.accelerationIncludingGravity?.x ?? 0;
      const y = e.accelerationIncludingGravity?.y ?? 0;
      const z = e.accelerationIncludingGravity?.z ?? 0;
      feedMotion(x, y, z);
    };
    window.addEventListener("devicemotion", onMotion);
    return () => window.removeEventListener("devicemotion", onMotion);
  }, [started, feedMotion]);

  useEffect(() => {
    if (!repeatStroke) return;
    repeatRef.current = setInterval(() => {
      const value = simIntensity / 10;
      feedMotion(value * 1.2, value * 1.6, value * 0.7);
    }, 120);
    return () => {
      if (repeatRef.current) clearInterval(repeatRef.current);
      repeatRef.current = null;
    };
  }, [repeatStroke, simIntensity, feedMotion]);

  useEffect(() => {
    if (!started) return;
    let last = performance.now();

    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;

      if (pausedRef.current) {
        frameRef.current = requestAnimationFrame(loop);
        return;
      }

      const inactive = now - lastMotionTimestamp.current > 180;
      const nextIntensity = clamp(
        inactive ? intensityRef.current * 0.94 : intensityRef.current * 0.98,
        0,
        160,
      );
      const normalized = clamp(nextIntensity / 30, 0, 1);
      const gain = normalized > 0.25 ? normalized * 22 * dt : 0;
      const decay = normalized < 0.25 ? 8 * dt : 0;
      const nextArousal = clamp(arousalRef.current + gain - decay, 0, 100);

      intensityRef.current = nextIntensity;
      arousalRef.current = nextArousal;
      setIntensity(nextIntensity);
      setArousal(nextArousal);

      if (cooldownRef.current <= 0 && nextArousal >= 95 && nextIntensity > 35) {
        if (!peakHoldStartRef.current) peakHoldStartRef.current = performance.now();
        if (performance.now() - peakHoldStartRef.current > 1500 && !peakLockRef.current) {
          peakHoldStartRef.current = 0;
          queueMicrotask(() => runPeakPulse());
        }
      } else {
        peakHoldStartRef.current = 0;
      }

      frameRef.current = requestAnimationFrame(loop);
    };

    frameRef.current = requestAnimationFrame(loop);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [started, runPeakPulse]);

  useEffect(() => {
    const now = performance.now();
    if (intensity > 20) {
      strokeEvents.current.push(now);
    }
    strokeEvents.current = strokeEvents.current.filter((t) => now - t < 1000);
    setStrokesPerSec(strokeEvents.current.length);
  }, [intensity]);

  useEffect(() => {
    if (cooldown <= 0) return;
    intervalRef.current = setInterval(() => {
      setCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [cooldown]);

  useEffect(() => {
    if (!started) return;
    let raf: number;
    const tick = () => {
      const now = performance.now();
      setParticles((prev) =>
        prev
          .map((p) => ({
            ...p,
            x: p.x + p.vx,
            y: p.y + p.vy,
            vy: p.vy + 0.18,
            opacity: clamp((p.life - now) / 1200, 0, 1),
          }))
          .filter((p) => p.life > now),
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [started]);

  // Graded haptic feedback that scales with motion quality.
  useEffect(() => {
    if (!started || paused || cooldown > 0 || !hasMotionStarted) return;
    if (!hapticsOn) return;
    if (!hapticsSupported) return;
    if (peakLockRef.current) return; // peak uses its own stronger pattern

    const now = performance.now();
    const intensity01 = vibrationIntensity / 10;
    const minGapMs =
      arousal >= 95 ? 2600 : arousal >= 85 ? 350 : arousal >= 80 ? 750 : arousal >= 60 ? 550 : arousal >= 35 ? 900 : 999999;
    if (now - lastHapticAtRef.current < minGapMs) return;

    if (arousal >= 95 && intensity > 35) return; // peak will handle this after the hold

    let pattern: number | number[] | null = null;
    if (arousal >= 85) pattern = 18; // near-peak micro jolts
    else if (arousal >= 80) pattern = [70, 60, 70];
    else if (arousal >= 60) pattern = [40, 40, 40];
    else if (arousal >= 35) pattern = 25;
    else pattern = null;

    if (!pattern) return;
    lastHapticAtRef.current = now;
    navigator.vibrate(scaleVibrate(pattern, intensity01));
  }, [arousal, intensity, started, paused, cooldown, hasMotionStarted, hapticsOn, vibrationIntensity, hapticsSupported]);

  useEffect(() => {
    return () => {
      if (burstIntervalRef.current) clearInterval(burstIntervalRef.current);
      if (burstTimeoutRef.current) clearTimeout(burstTimeoutRef.current);
    };
  }, []);

  const scale = 0.9 + clamp(arousal / 200, 0, 0.6);
  const bgStrength = clamp(arousal / 100, 0, 1);
  const backgroundStyle = {
    background: `radial-gradient(circle at 50% 30%, rgba(255,255,255,${0.95 - bgStrength * 0.2}) 0%, rgba(241,245,249,0.98) 46%, rgba(224,231,255,${0.78 + bgStrength * 0.2}) 100%)`,
  };
  const statusText =
    !hasMotionStarted
      ? "Shake to begin tracking."
      : cooldown > 0
      ? "Cooldown active. Let the system settle."
      : arousal < 35
        ? "Keep moving with steady rhythm."
        : arousal < 75
          ? "Great pace. Build and hold it."
          : arousal < 95
            ? "Close to peak. Stay consistent."
            : "Edge zone. Hold intensity!";

  return (
    <div className="min-h-screen text-zinc-900 transition-colors duration-300" style={backgroundStyle}>
      {!started ? (
        <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 p-6 text-center">
          <h1 className="text-4xl font-black tracking-[0.08em] text-indigo-700 sm:text-5xl">
            WANKER
          </h1>
          <p className="max-w-lg text-zinc-700">
            SIMULATE WANKS
          </p>
          <button
            onClick={async () => {
              const DME = DeviceMotionEvent as unknown as {
                requestPermission?: () => Promise<unknown>;
              };
              if (typeof DME !== "undefined" && typeof DME.requestPermission === "function") {
                await DME.requestPermission();
              }
              setStarted(true);
              setPaused(false);
              setArousal(0);
              setIntensity(0);
            }}
            className="rounded-xl border-4 border-black bg-yellow-300 px-6 py-3 font-black text-black shadow-[6px_6px_0_0_#000] transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[4px_4px_0_0_#000]"
          >
            WANK
          </button>
        </main>
      ) : (
        <main className="mx-auto flex min-h-screen w-full max-w-none flex-col p-0 sm:p-6 md:max-w-5xl">
          {/* Mobile-only minimal navbar */}
          <div className="fixed left-0 right-0 top-0 z-20 flex items-center justify-between gap-3 border-b-4 border-black bg-white/95 px-3 py-2 md:hidden">
            <div className="text-xs text-zinc-700">
              Score: <span className="font-black text-black">{Math.round(arousal)}/100</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPaused((p) => !p)}
                className="rounded-lg border-2 border-black bg-sky-200 px-3 py-2 text-xs font-black text-black"
              >
                {paused ? "Resume" : "Pause"}
              </button>
              <button
                onClick={() => setSettingsOpen(true)}
                className="rounded-lg border-2 border-black bg-violet-200 px-3 py-2 text-xs font-black text-black"
              >
                Settings
              </button>
              <button
                onClick={() => {
                  setArousal(0);
                  setIntensity(0);
                  setCooldown(0);
                  setHasMotionStarted(false);
                  motionKickRef.current = 0;
                }}
                className="rounded-lg border-2 border-black bg-rose-200 px-3 py-2 text-xs font-black text-black"
              >
                Reset
              </button>
            </div>
          </div>

          <div className="pt-12 md:pt-0">
          <div className="mb-2 rounded-none border-y-4 border-black bg-white/80 p-3 md:mb-4 md:rounded-xl md:border-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span>Arousal Meter</span>
              <span>{Math.round(arousal)}/100</span>
            </div>
            <div className="h-4 overflow-hidden rounded-full border-2 border-black bg-zinc-100">
              <div
                className={`h-full bg-gradient-to-r transition-all duration-150 ${colorMeter}`}
                style={{ width: `${arousal}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-xs text-zinc-700">
              <span>Intensity: {Math.round(intensity)}</span>
              <span>Strokes/sec: {strokesPerSec}</span>
              <span>Cooldown: {cooldown}s</span>
              <span>Peaks: {peakCount}</span>
            </div>
          </div>

          <section className="relative flex min-h-[68vh] flex-1 items-center justify-center overflow-hidden bg-white/40 md:min-h-0 md:rounded-2xl md:border-4 md:border-black">
            {burst && <div className="absolute inset-0 bg-white/20" />}

            <div
              className="relative"
              style={{
                transform: `scale(${scale})`,
                transition: paused ? "transform 0.25s ease" : "transform 0.08s linear",
              }}
            >
              <div
                className="flailTotem"
                style={{
                  animationDuration: `${clamp(1.35 - intensity / 140, 0.35, 1.35)}s`,
                  animationPlayState: intensity > 18 && cooldown <= 0 && !paused ? "running" : "paused",
                }}
              >
                <div className="relative flex h-[280px] w-[180px] items-center justify-center md:h-[320px] md:w-[220px]">
                  <div
                    className="relative z-10 select-none text-[130px] leading-none md:text-[170px]"
                    style={{
                      transform: `translateY(${clamp(arousal / 20, 0, 5)}px) rotate(180deg)`,
                      filter: `drop-shadow(0 0 ${8 + arousal / 5}px rgba(99,102,241,0.45))`,
                    }}
                  >
                    🍆
                  </div>
                </div>
              </div>

              {particles.map((p) => (
                <div
                  key={p.id}
                  className="absolute text-2xl"
                  style={{
                    left: `calc(50% + ${p.x}px)`,
                    top: `${-20 + p.y}px`,
                    opacity: p.opacity,
                  }}
                >
                  {p.emoji}
                </div>
              ))}
            </div>
          </section>

          <p className="mt-3 text-center text-sm font-semibold text-zinc-700">{statusText}</p>

          {/* Desktop controls (hidden on mobile) */}
          <div className="mt-4 hidden grid gap-3 sm:grid-cols-2 md:grid">
            <button
              onClick={() => setRepeatStroke((prev) => !prev)}
              className="rounded-lg border border-zinc-600 bg-zinc-900/80 px-4 py-2 text-sm font-semibold hover:bg-zinc-800"
            >
              {repeatStroke ? "Stop Repeat Motion" : "Repeat Motion (PC Test)"}
            </button>
            <button
              onClick={() => setTestMode((prev) => !prev)}
              className="rounded-lg border border-fuchsia-600 bg-fuchsia-900/20 px-4 py-2 text-sm font-semibold hover:bg-fuchsia-800/30"
            >
              {testMode ? "Hide Test Mode" : "Show Test Mode"}
            </button>
          </div>

          {testMode && (
            <div className="mt-4 hidden rounded-xl border border-cyan-700/70 bg-zinc-950/80 p-4 md:block">
              <p className="mb-3 text-xs uppercase tracking-wide text-cyan-300">
                For PC Testing - simulates mobile gyroscope
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  onClick={() => {
                    setSimulating(true);
                    const endAt = performance.now() + 4000;
                    const timer = setInterval(() => {
                      const amp = simIntensity / 11;
                      feedMotion(
                        (Math.random() - 0.5) * amp * 2,
                        (Math.random() - 0.5) * amp * 2.6,
                        (Math.random() - 0.5) * amp,
                      );
                      if (performance.now() >= endAt) {
                        clearInterval(timer);
                        setSimulating(false);
                      }
                    }, 48);
                  }}
                  disabled={simulating}
                  className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-bold text-black disabled:opacity-60"
                >
                  {simulating ? "Simulating..." : "Simulate Gyro (4s)"}
                </button>
                <button
                  onClick={runPeakPulse}
                  className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-bold text-black"
                >
                  Force Peak Pulse
                </button>
                <button
                  onClick={() => {
                    setArousal(0);
                    arousalRef.current = 0;
                    setIntensity(0);
                    peakHoldStartRef.current = 0;
                    setCooldown(0);
                    setHasMotionStarted(false);
                    motionKickRef.current = 0;
                  }}
                  className="rounded-lg border border-zinc-500 bg-zinc-900 px-4 py-2 text-sm font-semibold"
                >
                  Reset Score
                </button>
                <div className="rounded-lg border border-zinc-700 bg-black/40 p-2 text-xs">
                  Raw accel: x {rawAccel.x.toFixed(2)} | y {rawAccel.y.toFixed(2)} | z{" "}
                  {rawAccel.z.toFixed(2)}
                </div>
              </div>
              <div className="mt-3">
                <label className="mb-1 block text-xs text-zinc-300">
                  Simulated Intensity: {simIntensity}
                </label>
                <input
                  type="range"
                  min={20}
                  max={100}
                  value={simIntensity}
                  onChange={(e) => setSimIntensity(Number(e.target.value))}
                  className="w-full accent-cyan-400"
                />
              </div>
            </div>
          )}

          {/* Desktop settings modal (mobile uses the navbar button) */}
          {settingsOpen && (
            <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4">
              <div className="w-full max-w-md rounded-xl border-4 border-black bg-white p-4 shadow-[8px_8px_0_0_#000]">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm font-black text-zinc-900">Settings</div>
                  <button
                    onClick={() => setSettingsOpen(false)}
                    className="rounded-lg border-2 border-black bg-yellow-200 px-3 py-2 text-xs font-black text-black"
                  >
                    Close
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-zinc-700">
                      Sensitivity: {sensitivity} / 10
                    </label>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={sensitivity}
                      onChange={(e) => setSensitivity(Number(e.target.value))}
                      className="w-full accent-fuchsia-400"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-zinc-700">
                      Haptic strength: {vibrationIntensity} / 10
                    </label>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={vibrationIntensity}
                      onChange={(e) => setVibrationIntensity(Number(e.target.value))}
                      className="w-full accent-fuchsia-400"
                    />
                  </div>
                  <button
                    onClick={() => setHapticsOn((v) => !v)}
                    className="w-full rounded-lg border-2 border-black bg-sky-200 py-2 text-sm font-black text-black"
                  >
                    Haptics: {hapticsOn ? "On" : "Off"}
                  </button>
                  <div className="rounded-lg border-2 border-black bg-indigo-50 p-2 text-xs font-semibold text-zinc-700">
                    Haptics support: {hapticsSupported ? "Detected" : "Not detected on this device/browser"}
                  </div>

                  <div className="rounded-lg border-2 border-black bg-rose-50 p-3 text-xs font-semibold text-zinc-700">
                    Practice guidance: short motion bursts with recovery breaks.
                    The Peak Pulse triggers when your motion-quality score stays high for about 1.5s.
                    Haptics ramp up in levels (light to stronger to peak). If motion feels uncomfortable, stop and rest.
                  </div>
                </div>
              </div>
            </div>
          )}
          </div>
        </main>
      )}

      <style jsx>{`
        @keyframes flailTotem {
          0% {
            transform: rotate(0deg);
          }
          15% {
            transform: rotate(-10deg);
          }
          35% {
            transform: rotate(8deg);
          }
          55% {
            transform: rotate(-6deg);
          }
          75% {
            transform: rotate(9deg);
          }
          100% {
            transform: rotate(0deg);
          }
        }
        .flailTotem {
          transform-origin: 50% 70%;
          animation-name: flailTotem;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
          will-change: transform;
        }
      `}</style>
    </div>
  );
}
