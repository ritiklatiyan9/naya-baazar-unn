/**
 * Background ambience for the 3D model: one licensed track looping quietly while the model is on screen.
 * The track is a local file (no third-party player); without it the sound control stays hidden.
 * Browsers only allow sound after the visitor has interacted with the page, so a blocked start retries on the next tap or key.
 */
export const ambientTrack = "/media/ambient.mp3";
const level = 0.32, fadeIn = 1.6, fadeOut = 0.5;
const gestures = ["pointerdown", "keydown", "touchend"] as const;

export function createAmbience(src: string, stage: Element, onReady: () => void) {
  const audio = new Audio();
  audio.loop = true;
  audio.preload = "metadata";
  audio.addEventListener("loadedmetadata", onReady, { once: true });
  audio.src = src;
  let context: AudioContext | null = null, gain: GainNode | null = null;
  let enabled = false, onScreen = false, generation = 0, stopTimer = 0;
  const audible = () => enabled && onScreen && !document.hidden;
  const retry = () => { void sync(); };
  const awaitGesture = (on: boolean) => gestures.forEach(type =>
    on ? document.addEventListener(type, retry, true) : document.removeEventListener(type, retry, true));

  function ramp(to: number, seconds: number) {
    if (!context || !gain) { audio.volume = to; return; }
    const now = context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(to, now + seconds);
  }

  async function sync() {
    const run = ++generation;
    window.clearTimeout(stopTimer);
    if (!audible()) {
      awaitGesture(false);
      if (!audio.paused) {
        ramp(0, fadeOut);
        stopTimer = window.setTimeout(() => audio.pause(), fadeOut * 1000);
      }
      return;
    }
    if (!context && typeof AudioContext !== "undefined") {
      context = new AudioContext();
      gain = context.createGain();
      gain.gain.value = 0;
      context.createMediaElementSource(audio).connect(gain).connect(context.destination);
    }
    try {
      // Safari needs play() and resume() called synchronously inside the gesture that allows sound.
      const started = audio.play();
      const resumed = context && context.state !== "running" ? context.resume() : null;
      await started;
      // resume() stays pending until the browser allows sound, so don't wait on it for long.
      if (resumed) await Promise.race([resumed, new Promise(done => window.setTimeout(done, 300))]);
      if (run !== generation) return;
      if (context && context.state !== "running") throw new Error("Sound is waiting for a gesture.");
      awaitGesture(false);
      ramp(level, fadeIn);
    } catch {
      if (run === generation && audible()) awaitGesture(true);
    }
  }

  const observer = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting && entry.intersectionRatio > 0.2;
    void sync();
  }, { threshold: [0, 0.2, 0.5] });
  observer.observe(stage);
  document.addEventListener("visibilitychange", retry);

  return {
    setEnabled(on: boolean) {
      if (on === enabled) return;
      enabled = on;
      void sync();
    },
    dispose() {
      generation++;
      window.clearTimeout(stopTimer);
      awaitGesture(false);
      observer.disconnect();
      document.removeEventListener("visibilitychange", retry);
      audio.removeEventListener("loadedmetadata", onReady);
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      void context?.close();
    },
  };
}
