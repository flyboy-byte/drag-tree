// Programmatic audio cues: amber ticks, a soft green beep, result tones.
// Uses expo-av with synthesized WAV data URIs — no bundled asset files needed.
// Android plays them on the media stream (media volume); iOS plays through the
// silent switch. Background music dips briefly rather than stopping.

import { Platform } from "react-native";
import { Audio } from "expo-av";
import type { ReactionGrade } from "@/components/ReactionDisplay";
import { settings } from "./settings";

const SR = 44100; // sample rate

// ── WAV synthesis helpers ──────────────────────────────────────────────────

function buildWavUri(samples: Float32Array): string {
  const n = samples.length;
  const dataBytes = n * 2; // 16-bit PCM
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const u8 = new Uint8Array(buf);

  const wr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) u8[off + i] = s.charCodeAt(i);
  };

  wr(0, "RIFF");
  v.setUint32(4, 36 + dataBytes, true);
  wr(8, "WAVE");
  wr(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);      // PCM
  v.setUint16(22, 1, true);      // mono
  v.setUint32(24, SR, true);     // sample rate
  v.setUint32(28, SR * 2, true); // byte rate
  v.setUint16(32, 2, true);      // block align
  v.setUint16(34, 16, true);     // bits per sample
  wr(36, "data");
  v.setUint32(40, dataBytes, true);

  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  let bin = "";
  for (let i = 0; i < u8.byteLength; i++) bin += String.fromCharCode(u8[i]);
  return "data:audio/wav;base64," + btoa(bin);
}

// Phone speakers are small and thin, so bare high sine waves sound harsh and
// tinny. These cues sit in the low-mid range, add a couple of softer
// harmonics for body, and use rounded attacks so nothing clicks or pierces.

// One pitched note: fundamental plus decaying harmonics, soft attack,
// exponential decay. `glide` moves the pitch by that many Hz over the note.
function note(
  seconds: number,
  freq: number,
  amp: number,
  decay: number,
  attack: number,
  harmonics: number[] = [1, 0.35, 0.12],
  glide = 0,
): Float32Array {
  const n = Math.floor(SR * seconds);
  const out = new Float32Array(n);
  const attackN = Math.max(1, Math.floor(SR * attack));
  const norm = harmonics.reduce((a, b) => a + b, 0);
  const phases = harmonics.map(() => 0);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = freq + (glide * t) / seconds;
    // cosine-shaped attack, exponential decay, and a short fade at the end
    const a = i < attackN ? 0.5 - 0.5 * Math.cos((Math.PI * i) / attackN) : 1;
    const tail = Math.min(1, (n - i) / Math.floor(SR * 0.008));
    const env = a * Math.exp(-t * decay) * tail;
    let v = 0;
    for (let h = 0; h < harmonics.length; h++) {
      phases[h] += (2 * Math.PI * f * (h + 1)) / SR;
      v += harmonics[h] * Math.sin(phases[h]);
    }
    out[i] = (amp * env * v) / norm;
  }
  return out;
}

function concat(...parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function mix(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(Math.max(a.length, b.length));
  for (let i = 0; i < out.length; i++) out[i] = (a[i] ?? 0) + (b[i] ?? 0);
  return out;
}

// Amber tick (~45 ms): a low, dry "tock" that marks each amber without
// reading as a cue to react to.
function makeTickSamples(): Float32Array {
  return note(0.045, 430, 0.6, 70, 0.003, [1, 0.5, 0.2]);
}

// Green beep (~140 ms): one clear mid-pitch note with a soft attack.
function makeGreenSamples(): Float32Array {
  return note(0.14, 660, 0.6, 9, 0.010, [1, 0.4, 0.15]);
}

// Clean result (~260 ms): a gentle two-note chime, rising.
function makeResultGoodSamples(): Float32Array {
  const first = note(0.26, 587, 0.5, 11, 0.006, [1, 0.3, 0.1]);
  const second = concat(
    new Float32Array(Math.floor(SR * 0.09)),
    note(0.17, 784, 0.5, 11, 0.006, [1, 0.3, 0.1]),
  );
  return mix(first, second);
}

// Red light (~220 ms): a low, falling thud, not a buzz.
function makeResultRedLightSamples(): Float32Array {
  return note(0.22, 180, 0.7, 10, 0.006, [1, 0.5, 0.25], -70);
}

// ── Sound cache ────────────────────────────────────────────────────────────

type SoundSlot = { sound: Audio.Sound } | null;

type SoundKey = "tick" | "green" | "good" | "redlight";

const cache: Record<SoundKey, SoundSlot> = {
  tick:     null,
  green:    null,
  good:     null,
  redlight: null,
};

// Lazily-built WAV data URIs — generated once the first time ensureReady() runs.
let wavUris: Record<SoundKey, string> | null = null;

let initPromise: Promise<void> | null = null;

async function ensureReady(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    // Build WAV data URIs on first use (sync ~1–2ms on device).
    if (!wavUris) {
      wavUris = {
        tick:     buildWavUri(makeTickSamples()),
        green:    buildWavUri(makeGreenSamples()),
        good:     buildWavUri(makeResultGoodSamples()),
        redlight: buildWavUri(makeResultRedLightSamples()),
      };
    }

    // iOS needs the audio mode so cues play through the silent switch. Android
    // is left on expo-av's defaults: setAudioModeAsync always calls
    // setSpeakerphoneOn(true) there, which left the first cues silent until the
    // volume was nudged. The defaults already duck music for a cue.
    if (Platform.OS === "ios") {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: false,
          playThroughEarpieceAndroid: false,
        });
      } catch {
        // Play with the defaults.
      }
    }

    const keys = ["tick", "green", "good", "redlight"] as const;
    await Promise.all(
      keys.map(async (key) => {
        if (cache[key]) return;
        try {
          const { sound } = await Audio.Sound.createAsync(
            { uri: wavUris![key] },
            { shouldPlay: false, volume: 1.0 },
          );
          cache[key] = { sound };
        } catch {
          // Audio unavailable on this device — silently no-op.
        }
      }),
    );
  })().catch(() => {
    // Let the next cue try again instead of staying broken for the session.
    initPromise = null;
  });
  return initPromise;
}

async function playSlot(key: SoundKey): Promise<void> {
  const slot = cache[key];
  if (!slot) return;
  try {
    await slot.sound.replayAsync();
  } catch {
    // Best-effort — ignore playback errors.
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

// Build the sounds ahead of the first run so the first green beep isn't late
// while the player loads (noticeable on slower phones).
export function preloadAudio(): void {
  if (!settings.get().soundEnabled) return;
  void ensureReady();
}

// One tick per amber. Pro Tree ambers light together (three state updates in
// the same instant), so ticks closer than TICK_GAP_MS collapse into one.
const TICK_GAP_MS = 120;
let lastTickAt = 0;
export async function playAmberTick(): Promise<void> {
  if (!settings.get().soundEnabled) return;
  const now = Date.now();
  if (now - lastTickAt < TICK_GAP_MS) return;
  lastTickAt = now;
  await ensureReady();
  await playSlot("tick");
}

export async function playGreenBeep(): Promise<void> {
  if (!settings.get().soundEnabled) return;
  await ensureReady();
  await playSlot("green");
}

// "late" grade → intentional silence; null means no result yet.
export async function playResultTone(grade: ReactionGrade): Promise<void> {
  if (!settings.get().soundEnabled) return;
  if (grade === "late" || grade === null) return;
  await ensureReady();
  await playSlot(grade === "redlight" ? "redlight" : "good");
}
