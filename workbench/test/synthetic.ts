/**
 * A deterministic, synthetic receiver session: four players, three sync taps in the lobby, then one full
 * round. It stands in for the parts that can't be recorded alone (a round needs four players), and it
 * deliberately contains what the analysis must cope with:
 *
 * - one lost game event (a gap in seq);
 * - a meeting that ends twice, as Impostor's own vote timer causes with an ∞ voting time, with Ada's
 *   early "Missed" vote overwritten by her real one;
 * - a 3 s EDA dropout, and a slow arm tilt that must not register as a tap;
 * - sync taps with known delays: EmotiBit messages arrive EMOTIBIT_LAG_MS after real time, utterances
 *   start VOICE_LAG_MS after the chat that marks the tap;
 * - a skin-conductance response and a heart-rate rise starting ~2.5 s after Bo votes for Ada, the wearer.
 *
 * The lines come out in arrival order, exactly as the receiver would have written them.
 */

export const T0 = Date.UTC(2026, 9, 5, 20, 0, 0);
export const EMOTIBIT_LAG_MS = 180;
export const VOICE_LAG_MS = 120;
export const DEVICE = "/EmotiBit/0";
export const LOBBY = "GNIGHT";
export const TAPS_S = [15, 25, 35];
/** When Bo votes for Ada, and when her body responds. */
export const ACCUSED_S = 122;
export const RESPONSE_S = 124.5;

const PLAYERS = {
  Ada: { id: 0, name: "Ada", color: "Red", discord: "100000000000000001" },
  Bo: { id: 1, name: "Bo", color: "Blue", discord: "100000000000000002" },
  Cy: { id: 2, name: "Cy", color: "Green", discord: "100000000000000003" },
  Di: { id: 3, name: "Di", color: "Yellow", discord: "100000000000000004" },
};
type Name = keyof typeof PLAYERS;
const seat = (n: Name) => ({ id: PLAYERS[n].id, name: n, color: PLAYERS[n].color });
const roster = () => (Object.keys(PLAYERS) as Name[]).map((n) => ({ ...seat(n), impostor: n === "Bo", role: n === "Bo" ? "Impostor" : "Crewmate" }));

export interface SyntheticOptions {
  /** Stop the recording at this many seconds (default 240); stopping before 130 leaves the round unfinished. */
  endS?: number;
}

export function syntheticSession(options: SyntheticOptions = {}): string {
  const endS = options.endS ?? 240;
  const rand = mulberry32(42);
  const lines: { rx: number; line: Record<string, unknown> }[] = [];
  const at = (s: number) => T0 + Math.round(s * 1000);

  // --- game events, as the plugin posts them (rx a few ms after ts) -------------------------------------
  let seq = 0;
  const game = (s: number, type: string, data: Record<string, unknown>) => {
    seq++;
    if (seq === 13) seq++; // one event lost in transit
    if (s > endS) return;
    const ts = at(s);
    lines.push({ rx: ts + 2, line: { ts: iso(ts), seq, game: LOBBY, type, data, rx: iso(ts + 2), src: "game" } });
  };
  game(5, "game.created", { host: "Ada" });
  game(6, "lobby.joined", { player: { client: 1, name: "Ada" } });
  game(8, "lobby.joined", { player: { client: 2, name: "Bo" } });
  game(9, "lobby.joined", { player: { client: 3, name: "Cy" } });
  game(10, "lobby.joined", { player: { client: 4, name: "Di" } });
  TAPS_S.forEach((s, i) => game(s, "chat", { from: seat("Ada"), message: `sync ${i + 1}` }));
  game(45, "game.started", { roster: roster() });
  game(80, "player.murdered", { killer: seat("Bo"), victim: seat("Cy") });
  game(95, "meeting.called", { by: seat("Di"), body: seat("Cy"), trigger: "body" });
  game(110, "meeting.vote", { voter: seat("Ada"), kind: "Missed" }); // Impostor's timer fires early...
  game(110.1, "meeting.ended", { isTie: true });
  game(120, "meeting.vote", { voter: seat("Di"), for: seat("Bo"), kind: "Player" }); // ...then real votes land
  game(ACCUSED_S, "meeting.vote", { voter: seat("Bo"), for: seat("Ada"), kind: "Player" });
  game(124, "meeting.vote", { voter: seat("Ada"), for: seat("Bo"), kind: "Player" });
  game(126, "player.exiled", { player: seat("Bo") });
  game(126.05, "meeting.ended", { exiled: seat("Bo"), isTie: false });
  game(130, "game.ended", { reason: "CrewmatesByVote", roster: roster() });
  game(140, "lobby.left", { player: seat("Cy"), isBan: false });

  // --- voice: one line per utterance, posted a second after the speaker stops -------------------------
  const voice = (who: Name, startS: number, seconds: number) => {
    const start = at(startS);
    const rx = start + seconds * 1000 + 1000 + 20;
    if (rx > at(endS)) return;
    lines.push({
      rx,
      line: {
        type: "utterance",
        user: PLAYERS[who].discord,
        name: who,
        start: iso(start),
        duration: seconds,
        file: `voice/${iso(start).replace(/[:.]/g, "-")}-${PLAYERS[who].discord}.ogg`,
        rx: iso(rx),
        src: "voice",
      },
    });
  };
  for (const s of TAPS_S) voice("Ada", s + VOICE_LAG_MS / 1000, 0.6);
  voice("Di", 100, 4);
  voice("Bo", 105, 3);
  voice("Ada", 110, 3);

  // --- EmotiBit, as the Oscilloscope relays it: one OSC message per stream per ~100 ms packet ---------
  const emotibit = (stream: string, sampleTimesS: number[], value: (s: number) => number) => {
    const messages = new Map<number, number[]>();
    for (const s of sampleTimesS) {
      if (s < 2 || s > endS - 1) continue;
      if (stream === "EDA" && s >= 200 && s < 203) continue; // dropout
      const packet = Math.ceil(s * 10) / 10; // sent at the next 100 ms boundary
      messages.set(packet, [...(messages.get(packet) ?? []), value(s)]);
    }
    for (const [packet, args] of messages) {
      const rx = at(packet) + EMOTIBIT_LAG_MS + Math.round((rand() - 0.5) * 20);
      lines.push({ rx, line: { address: `${DEVICE}/${stream}`, args: args.map((a) => Math.fround(a)), rx: iso(rx), src: "emotibit" } });
    }
  };
  const every = (hz: number) => Array.from({ length: Math.floor(endS * hz) }, (_, i) => i / hz);

  const scr = (s: number, onset: number, amp: number) => {
    if (s < onset) return 0;
    const rise = Math.min(1, (s - onset) / 1.5);
    return amp * rise * Math.exp(-Math.max(0, s - onset - 1.5) / 4);
  };
  emotibit("EDA", every(15), (s) => 2 + 0.05 * Math.sin(s / 20) + scr(s, 96.5, 0.3) + scr(s, RESPONSE_S, 0.6) + (rand() - 0.5) * 0.01);
  emotibit("PPG:IR", every(25), (s) => 100000 + 2000 * Math.sin(2 * Math.PI * 1.25 * s));
  emotibit("SCR:FREQ", every(3), () => 2);

  const tilt = (s: number) => (s < 60 ? 0 : s < 70 ? (s - 60) / 20 : 0.5); // slow, must not count as a tap
  const tap = (s: number) => (TAPS_S.some((t) => Math.abs(s - t) < 0.02) ? 1 : 0);
  emotibit("ACC:X", every(25), (s) => tilt(s) + 1.5 * tap(s) + (rand() - 0.5) * 0.04);
  emotibit("ACC:Y", every(25), (s) => (rand() - 0.5) * 0.04);
  emotibit("ACC:Z", every(25), (s) => 1 - tilt(s) / 2 + 2.5 * tap(s) + (rand() - 0.5) * 0.04);

  // Heart rate: one value per beat; ~75 bpm, rising toward 95 after the accusation.
  const beats: number[] = [];
  for (let s = 2; s < endS; s += 60 / bpm(s)) beats.push(s);
  for (const s of beats) {
    const rx = at(s) + EMOTIBIT_LAG_MS + 50;
    if (rx <= at(endS)) lines.push({ rx, line: { address: `${DEVICE}/HR`, args: [Math.fround(bpm(s))], rx: iso(rx), src: "emotibit" } });
  }
  // The device reports each skin-conductance response once its peak is detected.
  for (const [onset, amp] of [[96.5, 0.3], [RESPONSE_S, 0.6]]) {
    const rx = at(onset + 1.5) + EMOTIBIT_LAG_MS;
    if (rx > at(endS)) continue;
    lines.push({ rx, line: { address: `${DEVICE}/SCR:AMP`, args: [Math.fround(amp)], rx: iso(rx), src: "emotibit" } });
    lines.push({ rx, line: { address: `${DEVICE}/SCR:RIS`, args: [1.5], rx: iso(rx), src: "emotibit" } });
  }

  lines.sort((a, b) => a.rx - b.rx);
  return lines.map((l) => JSON.stringify(l.line)).join("\n") + "\n";
}

function bpm(s: number) {
  const lift = s < RESPONSE_S ? 0 : 20 * Math.exp(-((s - RESPONSE_S - 3) ** 2) / 50);
  return 75 + lift;
}

function iso(ms: number) {
  return new Date(ms).toISOString();
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
