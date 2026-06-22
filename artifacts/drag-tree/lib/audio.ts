// Programmatic audio cues for tree countdown and result tones.
// Uses expo-av with synthesized WAV data URIs — no bundled asset files needed.
// Sounds fire even when the device is on silent/vibrate (playsInSilentModeIOS,
// shouldDuckAndroid: false) and mix alongside the user's background music.

import { Audio } from "expo-av";
import type { ReactionGrade } from "@/components/ReactionDisplay";
import { settings } from "./settings";

const SR = 22050; // sample rate

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

// Short mechanical click for each amber stage (~40ms, 900 Hz decaying)
function makeAmberSamples(): Float32Array {
  const n = Math.floor(SR * 0.040);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.exp(-t * 90);
    out[i] = 0.65 * env * (
      0.55 * Math.sin(2 * Math.PI * 900  * t) +
      0.35 * Math.sin(2 * Math.PI * 1800 * t) +
      0.10 * Math.sin(2 * Math.PI * 450  * t)
    );
  }
  return out;
}

// Rising chirp for green (~70ms, sweeps 1400→2000 Hz)
function makeGreenSamples(): Float32Array {
  const n = Math.floor(SR * 0.070);
  const out = new Float32Array(n);
  let phase = 0;
  const attackN = Math.floor(SR * 0.008);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.min(1, i / attackN) * Math.exp(-t * 16);
    const freq = 1400 + (t / 0.070) * 600;
    phase += (2 * Math.PI * freq) / SR;
    out[i] = 0.50 * env * Math.sin(phase);
  }
  return out;
}

// Bright rising ping for clean results (~110ms, 1600→2100 Hz)
function makeResultGoodSamples(): Float32Array {
  const n = Math.floor(SR * 0.110);
  const out = new Float32Array(n);
  let phase = 0;
  const attackN = Math.floor(SR * 0.006);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.min(1, i / attackN) * Math.exp(-t * 9);
    const freq = 1600 + (t / 0.110) * 500;
    phase += (2 * Math.PI * freq) / SR;
    out[i] = 0.42 * env * Math.sin(phase);
  }
  return out;
}

// Low descending buzz for red light (~180ms, 220→60 Hz with square distortion)
function makeResultRedLightSamples(): Float32Array {
  const n = Math.floor(SR * 0.180);
  const out = new Float32Array(n);
  let phase = 0;
  const attackN = Math.floor(SR * 0.005);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.min(1, i / attackN) * Math.exp(-t * 7);
    const freq = Math.max(60, 220 - (t / 0.180) * 160);
    phase += (2 * Math.PI * freq) / SR;
    const sine = Math.sin(phase);
    out[i] = 0.46 * env * (0.7 * sine + 0.3 * Math.sign(sine));
  }
  return out;
}

// ── Sound cache ────────────────────────────────────────────────────────────

type SoundSlot = { sound: Audio.Sound } | null;

const cache: Record<"amber" | "green" | "good" | "redlight", SoundSlot> = {
  amber:    null,
  green:    null,
  good:     null,
  redlight: null,
};

// Lazily-built WAV data URIs — generated once the first time ensureReady() runs.
let wavUris: Record<"amber" | "green" | "good" | "redlight", string> | null = null;

let initPromise: Promise<void> | null = null;

async function ensureReady(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    // Build WAV data URIs on first use (sync ~1–2ms on device).
    if (!wavUris) {
      wavUris = {
        amber:    buildWavUri(makeAmberSamples()),
        green:    buildWavUri(makeGreenSamples()),
        good:     buildWavUri(makeResultGoodSamples()),
        redlight: buildWavUri(makeResultRedLightSamples()),
      };
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,   // fire through silent switch on iOS
      staysActiveInBackground: false,
      shouldDuckAndroid: false,     // don't duck background music
      playThroughEarpieceAndroid: false,
    });

    const keys = ["amber", "green", "good", "redlight"] as const;
    await Promise.all(
      keys.map(async (key) => {
        if (cache[key]) return;
        try {
          const { sound } = await Audio.Sound.createAsync(
            { uri: wavUris![key] },
            { shouldPlay: false, volume: 0.8 },
          );
          cache[key] = { sound };
        } catch {
          // Audio unavailable on this device — silently no-op.
        }
      }),
    );
  })();
  return initPromise;
}

async function playSlot(key: "amber" | "green" | "good" | "redlight"): Promise<void> {
  const slot = cache[key];
  if (!slot) return;
  try {
    await slot.sound.setPositionAsync(0);
    await slot.sound.playAsync();
  } catch {
    // Best-effort — ignore playback errors.
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function playAmberClick(): Promise<void> {
  if (!settings.get().soundEnabled) return;
  await ensureReady();
  await playSlot("amber");
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
