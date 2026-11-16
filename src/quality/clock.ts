/** A shared simulation clock. Display refresh and graphics quality never change game rules. */
export interface ClockStats { frames: number; steps: number; droppedSeconds: number; frameMs: number; p95FrameMs: number }
export function createFixedStepper(step = 1 / 60, maxSteps = 5) {
  if (!(step > 0 && step <= .1) || !Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 12) throw Error('Invalid simulation clock');
  let accumulator = 0, dropped = 0, steps = 0;
  return {
    advance(seconds: number, update: (dt: number) => void) {
      if (!Number.isFinite(seconds) || seconds < 0) throw Error('Invalid elapsed time');
      const accepted = Math.min(seconds, step * maxSteps);
      dropped += seconds - accepted;
      accumulator += accepted;
      let count = 0;
      while (accumulator + 1e-10 >= step && count < maxSteps) {
        update(step); accumulator = Math.max(0, accumulator - step); count++; steps++;
      }
      return Math.min(1, accumulator / step);
    },
    reset() { accumulator = 0; },
    get steps() { return steps; },
    get droppedSeconds() { return dropped; }
  };
}
export interface ClockCallbacks {
  update(dt: number): void;
  render(alpha: number, elapsed: number): void;
  onPause?(): void;
  onResume?(): void;
}
export function createFixedClock(callbacks: ClockCallbacks, options: { step?: number; maxSteps?: number; autoPause?: boolean } = {}) {
  const stepper = createFixedStepper(options.step, options.maxSteps);
  const reasons = new Set<string>();
  let disposed = false, started = false, raf: number | null = null, inFrame = false, renderRequested = true;
  let last: number | null = null, elapsed = 0, frames = 0, frameMs = 0;
  const durations: number[] = [];
  function schedule() {
    if (!disposed && started && !inFrame && raf === null) raf = requestAnimationFrame(frame);
  }
  /** Repaint a resized or edited paused view once, without advancing its simulation. */
  function invalidate() {
    if (disposed) return;
    renderRequested = true;
    schedule();
  }
  function pause(reason = 'user') {
    if (disposed || reasons.has(reason)) return;
    const wasPaused = reasons.size > 0;
    reasons.add(reason); stepper.reset(); last = null;
    if (!wasPaused) callbacks.onPause?.();
    invalidate();
  }
  function resume(reason = 'user') {
    if (disposed || !reasons.delete(reason)) return;
    stepper.reset(); last = null;
    if (!reasons.size) callbacks.onResume?.();
    invalidate();
  }
  function frame(now: number) {
    raf = null;
    if (disposed || !started) return;
    inFrame = true;
    try {
      let alpha = 1;
      if (!reasons.size) {
        const delta = last === null ? 0 : Math.max(0, (now - last) / 1000);
        last = now;
        elapsed += Math.min(delta, .1);
        alpha = stepper.advance(delta, dt => { if (!disposed && !reasons.size) callbacks.update(dt); });
        if (delta > 0) { frameMs = delta * 1000; durations.push(frameMs); if (durations.length > 180) durations.shift(); }
      }
      // An update may synchronously finish the host flow and unmount this game.
      // A pause inside an update paints its latest state, then becomes quiescent.
      if (disposed) return;
      renderRequested = false;
      callbacks.render(reasons.size ? 1 : alpha, elapsed); frames++;
    } finally {
      inFrame = false;
    }
    // A pause or invalidation from render itself needs one fresh paint. All
    // requests coalesce into this single chain, including reentrant callbacks.
    if (!reasons.size || renderRequested) schedule();
  }
  const visibility = () => document.hidden ? pause('visibility') : resume('visibility');
  const blur = () => pause('focus');
  const focus = () => resume('focus');
  if (options.autoPause !== false) {
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('blur', blur); window.addEventListener('focus', focus);
  }
  return {
    start() {
      if (started || disposed) return;
      started = true;
      if (options.autoPause !== false) { visibility(); if (!document.hasFocus()) pause('focus'); }
      invalidate();
    },
    pause, resume, invalidate,
    dispose() {
      if (disposed) return; disposed = true; stepper.reset();
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('blur', blur); window.removeEventListener('focus', focus);
      reasons.clear();
    },
    get paused() { return reasons.size > 0; },
    get stats(): ClockStats {
      const sorted = [...durations].sort((a, b) => a - b);
      return { frames, steps: stepper.steps, droppedSeconds: stepper.droppedSeconds, frameMs,
        p95FrameMs: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .95))] || 0 };
    }
  };
}

export function interpolateBody<T extends { x: number; y: number; angle: number; previousX?: number; previousY?: number; previousAngle?: number }>(body: T, alpha: number): T {
  const t = Math.max(0, Math.min(1, alpha));
  return { ...body, x: (body.previousX ?? body.x) + (body.x - (body.previousX ?? body.x)) * t,
    y: (body.previousY ?? body.y) + (body.y - (body.previousY ?? body.y)) * t,
    angle: (body.previousAngle ?? body.angle) + (body.angle - (body.previousAngle ?? body.angle)) * t };
}
