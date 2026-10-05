/**
 * One merged, time-ordered view of a session: game moments (from the cleaned game model, not raw events),
 * who spoke when, and what the wearer's body was doing at each moment.
 *
 * Biometric context is taken on the game clock: EmotiBit samples are shifted by the EmotiBit's measured
 * delay (from sync taps) when one is known. Roles, who made a kill, and dead players' ghost chat stay
 * hidden until the round ends.
 */
import type { Session, Stream } from "./parse.ts";
import { type Lobby, type Player, type Round, rolesVisible, splitGames } from "./games.ts";
import { findSyncMarkers } from "./sync.ts";

export const ENTRY_KINDS = ["lobby", "round", "meeting", "vote", "kill", "chat", "voice", "sync"] as const;
export type EntryKind = typeof ENTRY_KINDS[number];

export interface TimelineEntry {
  at: string;
  /** Time since the session started, "+mm:ss.s". */
  offset: string;
  kind: EntryKind;
  text: string;
  /** Wearer's EDA at the moment, and its largest rise over the next 5 s (µS). */
  eda?: { now: number; rise5s: number };
  /** Wearer's heart rate at the moment, and its peak over the next 10 s (bpm). */
  hr?: { now: number; peak10s: number };
}

export interface TimelineOptions {
  lobby?: string;
  /** Round number within the lobby (1-based); narrows the window to that round. */
  round?: number;
  from?: string;
  to?: string;
  kinds?: EntryKind[];
  /** EmotiBit device whose biometrics annotate the entries; defaults to the first one with EDA. */
  device?: string;
  /** Override the EmotiBit delay; defaults to the one measured from sync taps, else 0. */
  emotibitLagMs?: number;
  biometrics?: boolean;
  limit?: number;
}

export interface TimelineResult {
  session: string;
  device?: string;
  emotibitLagMs: number;
  lagSource: "given" | "measured" | "none";
  from: string;
  to: string;
  total: number;
  truncated: boolean;
  entries: TimelineEntry[];
  note?: string;
}

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

export function buildTimeline(session: Session, options: TimelineOptions = {}): TimelineResult {
  const lobbies = splitGames(session.game);
  const sync = findSyncMarkers(session);
  const lagSource = options.emotibitLagMs !== undefined ? "given" : sync.emotibitLagMs !== undefined ? "measured" : "none";
  const lag = options.emotibitLagMs ?? sync.emotibitLagMs ?? 0;

  let from = options.from ? Date.parse(options.from) : -Infinity;
  let to = options.to ? Date.parse(options.to) : Infinity;
  let pickedLobbies = lobbies;
  if (options.lobby) {
    const i = lobbies.findIndex((l) => l.code.toUpperCase() === options.lobby!.toUpperCase());
    if (i < 0) throw new Error(`No lobby "${options.lobby}" in this session. Its lobbies: ${codes(lobbies)}.`);
    pickedLobbies = [lobbies[i]];
    // Voice and sync taps belong to no lobby: keep the ones from its creation until the next lobby's.
    from = Math.max(from, lobbies[i].firstAt);
    to = Math.min(to, lobbies[i + 1]?.firstAt ?? Infinity);
  }
  if (options.round !== undefined) {
    if (pickedLobbies.length > 1) {
      throw new Error(`Rounds are numbered within a lobby, and this session has ${lobbies.length}: ${codes(lobbies)}. Give Lobby too.`);
    }
    const r = pickedLobbies[0]?.rounds.find((x) => x.index === options.round);
    if (r) {
      from = Math.max(from, r.startedAt - 1);
      to = Math.min(to, r.endedAt ?? Infinity);
    } else {
      from = Infinity; // no such round: nothing to show
    }
  }

  const raw: { t: number; kind: EntryKind; text: string }[] = [];
  for (const l of pickedLobbies) raw.push(...lobbyEntries(l));
  for (const u of session.voice) {
    raw.push({ t: u.start, kind: "voice", text: `${u.name} spoke for ${((u.end - u.start) / 1000).toFixed(1)} s (${u.file})` });
  }
  for (const m of sync.markers) {
    raw.push({ t: m.chatAt ?? m.voiceAt ?? m.at - lag, kind: "sync", text: `Sync tap on ${m.device}` });
  }

  const kinds = options.kinds?.length ? new Set(options.kinds) : undefined;
  const selected = raw
    .filter((e) => e.t >= from && e.t <= to && (!kinds || kinds.has(e.kind)))
    .sort((a, b) => a.t - b.t);

  const limit = Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const device = options.device ?? session.streams.find((s) => s.stream === "EDA")?.device;
  const eda = device ? session.streams.find((s) => s.device === device && s.stream === "EDA") : undefined;
  const hr = device ? session.streams.find((s) => s.device === device && s.stream === "HR") : undefined;
  const withBio = options.biometrics !== false;

  const entries = selected.slice(0, limit).map((e): TimelineEntry => {
    const entry: TimelineEntry = { at: new Date(e.t).toISOString(), offset: offset(e.t - session.firstMs), kind: e.kind, text: e.text };
    if (withBio && eda) {
      const now = nearest(eda, e.t + lag, 1000);
      if (now !== undefined) entry.eda = { now: round2(now), rise5s: round2(Math.max(0, maxIn(eda, e.t + lag, e.t + lag + 5000) - now)) };
    }
    if (withBio && hr) {
      const now = lastBefore(hr, e.t + lag, 15000);
      if (now !== undefined) entry.hr = { now: Math.round(now), peak10s: Math.round(Math.max(now, maxIn(hr, e.t + lag, e.t + lag + 10000))) };
    }
    return entry;
  });

  return {
    session: session.name,
    device,
    emotibitLagMs: Math.round(lag),
    lagSource,
    from: selected.length ? new Date(selected[0].t).toISOString() : "",
    to: selected.length ? new Date(selected.at(-1)!.t).toISOString() : "",
    total: selected.length,
    truncated: selected.length > entries.length,
    entries,
  };
}

function lobbyEntries(l: Lobby) {
  const out: { t: number; kind: EntryKind; text: string }[] = [];
  out.push({ t: l.firstAt, kind: "lobby", text: `Lobby ${l.code}${l.host ? ` hosted by ${l.host}` : ""}` });
  for (const j of l.joins) out.push({ t: j.t, kind: "lobby", text: `${who(j.player)} joined` });
  for (const x of l.leaves) out.push({ t: x.t, kind: "lobby", text: `${who(x.player)} left${x.ban ? " (banned)" : ""}` });
  for (const c of l.chats) out.push({ t: c.t, kind: "chat", text: `${who(c.from)}: ${c.message}` });
  for (const r of l.rounds) out.push(...roundEntries(r));
  return out;
}

function roundEntries(r: Round) {
  const visible = rolesVisible(r);
  const out: { t: number; kind: EntryKind; text: string }[] = [];
  const impostors = r.roster.filter((p) => p.impostor).map(who).join(", ");
  out.push({
    t: r.startedAt,
    kind: "round",
    text: `Round ${r.index} started with ${r.roster.length} players` +
      (visible ? (impostors ? `; impostor(s): ${impostors}` : "") : "; roles hidden until the round ends"),
  });
  for (const m of r.meetings) {
    out.push({
      t: m.calledAt,
      kind: "meeting",
      text: m.trigger === "body" ? `${who(m.by)} reported ${who(m.body)}'s body` : `${who(m.by)} called an emergency meeting`,
    });
    for (const v of m.votes) {
      out.push({
        t: v.t,
        kind: "vote",
        text: v.target ? `${who(v.voter)} voted for ${who(v.target)}` : `${who(v.voter)} ${v.kind === "Skipped" ? "skipped" : "didn't vote"}`,
      });
    }
    if (m.endedAt !== undefined) {
      const role = visible && m.exiled ? (isImpostor(r, m.exiled) ? " (impostor)" : " (crewmate)") : "";
      out.push({
        t: m.endedAt,
        kind: "meeting",
        text: m.exiled ? `${who(m.exiled)} was ejected${role}` : `No one was ejected${m.tie ? " (tie)" : ""}`,
      });
    }
  }
  for (const k of r.murders) {
    out.push({ t: k.t, kind: "kill", text: visible ? `${who(k.killer)} killed ${who(k.victim)}` : `${who(k.victim)} was killed` });
  }
  // The dead chat among themselves all round. The living can't see it, and it often names the killer.
  const dead = (p: Player | undefined, t: number) =>
    !!p && (r.murders.some((k) => k.victim?.name === p.name && k.t < t) ||
      r.meetings.some((m) => m.exiled?.name === p.name && m.endedAt !== undefined && m.endedAt < t));
  for (const c of r.chats) {
    const hidden = !visible && dead(c.from, c.t);
    out.push({ t: c.t, kind: "chat", text: hidden ? `${who(c.from)} wrote in ghost chat (hidden until the round ends)` : `${who(c.from)}: ${c.message}` });
  }
  if (r.endedAt !== undefined) {
    const how = r.reason ? `: ${r.reason}` : " (its end wasn't recorded)";
    out.push({ t: r.endedAt, kind: "round", text: `Round ${r.index} ended${how}${impostors ? `; impostor(s) were ${impostors}` : ""}` });
  }
  return out;
}

function codes(lobbies: Lobby[]) {
  return lobbies.map((l) => l.code).join(", ") || "none";
}

function isImpostor(r: Round, p: Player): boolean {
  return r.roster.find((q) => q.name === p.name)?.impostor === true;
}

function who(p?: Player): string {
  if (!p) return "someone";
  return p.color ? `${p.name} (${p.color})` : p.name;
}

/** Index of the first sample at or after t. */
function lowerBound(s: Stream, t: number) {
  let lo = 0, hi = s.t.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (s.t[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function nearest(s: Stream, t: number, within: number): number | undefined {
  const i = lowerBound(s, t);
  let best: number | undefined;
  for (const k of [i - 1, i]) {
    if (k >= 0 && k < s.t.length && Math.abs(s.t[k] - t) <= within) {
      if (best === undefined || Math.abs(s.t[k] - t) < Math.abs(s.t[best] - t)) best = k;
    }
  }
  return best === undefined ? undefined : s.v[best];
}

function lastBefore(s: Stream, t: number, within: number): number | undefined {
  const i = lowerBound(s, t + 1) - 1;
  return i >= 0 && t - s.t[i] <= within ? s.v[i] : undefined;
}

function maxIn(s: Stream, from: number, to: number): number {
  let m = -Infinity;
  for (let i = lowerBound(s, from); i < s.t.length && s.t[i] <= to; i++) m = Math.max(m, s.v[i]);
  return m;
}

function offset(ms: number) {
  const tenths = Math.round(Math.max(0, ms) / 100);
  const m = Math.floor(tenths / 600);
  return `+${String(m).padStart(2, "0")}:${((tenths % 600) / 10).toFixed(1).padStart(4, "0")}`;
}

function round2(x: number) {
  return Math.round(x * 100) / 100;
}
