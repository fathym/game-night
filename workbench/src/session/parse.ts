/**
 * Turns one receiver session file (JSONL) into a session model. The receiver only stamps and appends; this
 * is where its lines become things you can analyze:
 *
 * - game lines → events on the plugin's clock (`ts`), the join key for everything game-related;
 * - voice lines → utterances placed at the relay's `start` stamp;
 * - EmotiBit lines → per-stream sample series. Each OSC message carries every sample since the previous
 *   one, so periodic samples are spread back from the message's arrival at the stream's nominal rate.
 *
 * All times are milliseconds since the epoch, on the server's clock.
 */
import { splitAddress, streamInfo } from "./streams.ts";

export interface GameEvent {
  seq: number;
  lobby: string;
  type: string;
  /** The plugin's stamp (`ts`). */
  t: number;
  rx: number;
  data: Record<string, unknown>;
}

export interface Utterance {
  user: string;
  name: string;
  start: number;
  end: number;
  file: string;
  rx: number;
}

export interface Stream {
  device: string;
  stream: string;
  /** Arrival time of each OSC message. */
  messages: number[];
  /** Reconstructed sample times, ascending, and their values. */
  t: number[];
  v: number[];
}

export interface Issue {
  line: number;
  problem: string;
}

export interface Session {
  name: string;
  lines: number;
  game: GameEvent[];
  voice: Utterance[];
  streams: Stream[];
  issues: Issue[];
  issueCount: number;
  /** Earliest and latest arrival stamp in the file. */
  firstMs: number;
  lastMs: number;
}

const MAX_ISSUES = 25;

export function parseSession(text: string, name = "session"): Session {
  const session: Session = {
    name,
    lines: 0,
    game: [],
    voice: [],
    streams: [],
    issues: [],
    issueCount: 0,
    firstMs: Infinity,
    lastMs: -Infinity,
  };
  const streams = new Map<string, Stream>();
  const issue = (line: number, problem: string) => {
    session.issueCount++;
    if (session.issues.length < MAX_ISSUES) session.issues.push({ line, problem });
  };

  const rows = text.split("\n");
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i].trim();
    if (!row) continue;
    session.lines++;
    const lineNo = i + 1;

    let o: Record<string, unknown>;
    try {
      o = JSON.parse(row);
    } catch {
      issue(lineNo, "not valid JSON");
      continue;
    }

    const rx = Date.parse(String(o.rx));
    if (Number.isNaN(rx)) {
      issue(lineNo, "missing or unreadable rx");
      continue;
    }
    if (rx < session.firstMs) session.firstMs = rx;
    if (rx > session.lastMs) session.lastMs = rx;

    if (o.src === "game") {
      const t = Date.parse(String(o.ts));
      if (Number.isNaN(t) || typeof o.type !== "string" || typeof o.seq !== "number") {
        issue(lineNo, "game line without ts, seq or type");
        continue;
      }
      session.game.push({
        seq: o.seq,
        lobby: typeof o.game === "string" ? o.game : "",
        type: o.type,
        t,
        rx,
        data: (o.data && typeof o.data === "object") ? o.data as Record<string, unknown> : {},
      });
    } else if (o.src === "voice") {
      const start = Date.parse(String(o.start));
      const duration = typeof o.duration === "number" ? o.duration : NaN;
      if (Number.isNaN(start) || Number.isNaN(duration) || typeof o.user !== "string" || typeof o.file !== "string") {
        issue(lineNo, "voice line without start, duration, user or file");
        continue;
      }
      session.voice.push({
        user: o.user,
        name: typeof o.name === "string" && o.name ? o.name : o.user,
        start,
        end: start + duration * 1000,
        file: o.file,
        rx,
      });
    } else if (o.src === "emotibit") {
      if (typeof o.address !== "string" || !Array.isArray(o.args)) {
        issue(lineNo, "emotibit line without address or args");
        continue;
      }
      const values = o.args.filter((a): a is number => typeof a === "number" && Number.isFinite(a));
      const key = o.address;
      let s = streams.get(key);
      if (!s) {
        const { device, stream } = splitAddress(key);
        s = { device, stream, messages: [], t: [], v: [] };
        streams.set(key, s);
      }
      s.messages.push(rx);
      const info = streamInfo(s.stream);
      const step = info.kind === "periodic" && info.hz ? 1000 / info.hz : 0;
      for (let k = 0; k < values.length; k++) {
        s.t.push(rx - (values.length - 1 - k) * step);
        s.v.push(values[k]);
      }
    } else {
      issue(lineNo, `unknown src ${JSON.stringify(o.src)}`);
    }
  }

  session.game.sort((a, b) => a.t - b.t || a.seq - b.seq);
  session.voice.sort((a, b) => a.start - b.start);
  session.streams = [...streams.values()].sort((a, b) => a.device.localeCompare(b.device) || a.stream.localeCompare(b.stream));
  for (const s of session.streams) sortSamples(s);
  if (session.lines === 0) session.firstMs = session.lastMs = NaN;
  return session;
}

/** Batches arriving with network jitter can overlap by a sample; keep each series in time order. */
function sortSamples(s: Stream) {
  for (let i = 1; i < s.t.length; i++) {
    if (s.t[i] < s.t[i - 1]) {
      const order = s.t.map((_, k) => k).sort((a, b) => s.t[a] - s.t[b]);
      s.t = order.map((k) => s.t[k]);
      s.v = order.map((k) => s.v[k]);
      return;
    }
  }
}
