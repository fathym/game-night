/**
 * Measures how the three streams line up, from "sync taps": a sharp tap on the EmotiBit made at the same
 * moment as pressing Enter on a chat message and saying "now".
 *
 * Game events and voice are both stamped on the server's clock, but each pipeline adds its own delay (the
 * EmotiBit batches samples for ~100 ms before sending, then Wi-Fi, the Oscilloscope and the LAN add more).
 * A tap shows up as a spike on the accelerometer; matching each spike to the nearest chat and utterance
 * gives each stream's delay relative to the game clock. Human timing adds roughly ±150 ms per tap, so the
 * median over a few taps is what's reported.
 *
 * Taps are done in the lobby, before the first round, so only that stretch is searched: movement during
 * play can neither drown them out nor pass for one.
 */
import type { Session, Stream } from "./parse.ts";

export interface Marker {
  /** Onset of the tap on the EmotiBit's (uncorrected) clock. */
  at: number;
  device: string;
  /** Largest deviation from rest on any accelerometer axis. */
  peakG: number;
  /** Plugin stamp of the matched chat message. */
  chatAt?: number;
  /** Start of the matched utterance. */
  voiceAt?: number;
}

export interface SyncResult {
  markers: Marker[];
  /** Median of tap − chat: how late EmotiBit samples are stamped relative to the game clock. */
  emotibitLagMs?: number;
  /** Median of utterance start − chat: how late voice is stamped relative to the game clock. */
  voiceLagMs?: number;
  /** When no chat matched: median of tap − utterance start. */
  emotibitVsVoiceMs?: number;
  note: string;
}

const MATCH_WINDOW_MS = 3000;
const MERGE_MS = 300;
const MIN_SPACING_MS = 1500;
const MIN_DEVIATION_G = 0.5;
const MAX_MARKERS = 20;

export function findSyncMarkers(session: Session): SyncResult {
  const markers: Marker[] = [];
  const devices = [...new Set(session.streams.map((s) => s.device))];
  const firstRound = session.game.find((e) => e.type === "game.started")?.t ?? Infinity;

  for (const device of devices) {
    const axes = ["ACC:X", "ACC:Y", "ACC:Z"].map((a) => session.streams.find((s) => s.device === device && s.stream === a));
    if (axes.some((a) => !a || a.v.length < 10)) continue;
    const spikes = axes.flatMap((a) => spikesOf(a!)).filter((s) => s.t < firstRound).sort((x, y) => x.t - y.t);

    const found: Marker[] = [];
    for (const s of spikes) {
      const last = found.at(-1);
      if (last && s.t - last.at <= MERGE_MS) {
        last.peakG = Math.max(last.peakG, s.dev);
      } else if (!last || s.t - last.at >= MIN_SPACING_MS) {
        found.push({ at: s.t, device, peakG: s.dev });
      }
    }
    if (found.length > MAX_MARKERS) {
      return {
        markers: [],
        note: `Found ${found.length} accelerometer spikes on ${device} before the first round: too much movement to pick out deliberate taps.`,
      };
    }
    markers.push(...found);
  }
  markers.sort((a, b) => a.at - b.at);

  const chats = session.game.filter((e) => e.type === "chat").map((e) => e.t);
  const voices = session.voice.map((u) => u.start);
  claimNearest(markers, chats, (m, t) => (m.chatAt = t));
  claimNearest(markers, voices, (m, t) => (m.voiceAt = t));
  // A spike with nothing to line up against is just movement, not a sync tap.
  const unmatched = markers.filter((m) => m.chatAt === undefined && m.voiceAt === undefined).length;
  for (let i = markers.length - 1; i >= 0; i--) {
    if (markers[i].chatAt === undefined && markers[i].voiceAt === undefined) markers.splice(i, 1);
  }

  if (markers.length === 0) {
    return {
      markers,
      note: "No sync taps found. To measure the offsets, in the lobby before the first round, tap the EmotiBit " +
        "sharply while pressing Enter on a chat message and saying \"now\", three times, a few seconds apart.",
    };
  }

  const emotibitLagMs = median(markers.filter((m) => m.chatAt !== undefined).map((m) => m.at - m.chatAt!));
  const voiceLagMs = median(markers.filter((m) => m.chatAt !== undefined && m.voiceAt !== undefined).map((m) => m.voiceAt! - m.chatAt!));
  const emotibitVsVoiceMs = emotibitLagMs === undefined
    ? median(markers.filter((m) => m.voiceAt !== undefined).map((m) => m.at - m.voiceAt!))
    : undefined;

  const parts = [`${markers.length} sync tap(s) found.`];
  if (emotibitLagMs !== undefined) parts.push(`EmotiBit samples arrive ${Math.round(emotibitLagMs)} ms after the game clock.`);
  if (voiceLagMs !== undefined) parts.push(`Voice is stamped ${Math.round(voiceLagMs)} ms after the game clock.`);
  if (emotibitVsVoiceMs !== undefined) {
    parts.push(`No chat matched (Quick Chat isn't relayed), so EmotiBit is measured against voice: ${Math.round(emotibitVsVoiceMs)} ms.`);
  }
  if (unmatched > 0) parts.push(`${unmatched} other movement spike(s) had no chat or utterance nearby and were ignored.`);
  parts.push("Each tap carries about ±150 ms of human timing; the figures are medians.");
  return { markers, emotibitLagMs, voiceLagMs, emotibitVsVoiceMs, note: parts.join(" ") };
}

/**
 * Samples that jump away from the axis's local average (±500 ms). Measuring against a moving baseline
 * ignores slow changes such as the arm tilting, which shift gravity between axes; a tap is a sharp
 * transient. The threshold is a robust z-score with an absolute floor.
 */
function spikesOf(s: Stream): { t: number; dev: number }[] {
  const n = s.v.length;
  const highPassed = new Array<number>(n);
  let lo = 0, hi = 0, sum = 0;
  for (let i = 0; i < n; i++) {
    while (hi < n && s.t[hi] <= s.t[i] + 500) sum += s.v[hi++];
    while (s.t[lo] < s.t[i] - 500) sum -= s.v[lo++];
    highPassed[i] = s.v[i] - sum / (hi - lo);
  }
  const med = median(highPassed)!;
  const mad = median(highPassed.map((v) => Math.abs(v - med)))!;
  const threshold = Math.max(MIN_DEVIATION_G, 6 * 1.4826 * mad);
  const out: { t: number; dev: number }[] = [];
  for (let i = 0; i < n; i++) {
    const dev = Math.abs(highPassed[i] - med);
    if (dev > threshold) out.push({ t: s.t[i], dev });
  }
  return out;
}

/** Each marker takes the nearest unclaimed time within the window. */
function claimNearest(markers: Marker[], times: number[], set: (m: Marker, t: number) => void) {
  const taken = new Set<number>();
  for (const m of markers) {
    let best = -1;
    for (let i = 0; i < times.length; i++) {
      if (taken.has(i) || Math.abs(times[i] - m.at) > MATCH_WINDOW_MS) continue;
      if (best < 0 || Math.abs(times[i] - m.at) < Math.abs(times[best] - m.at)) best = i;
    }
    if (best >= 0) {
      taken.add(best);
      set(m, times[best]);
    }
  }
}

export function median(xs: number[]): number | undefined {
  if (xs.length === 0) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
