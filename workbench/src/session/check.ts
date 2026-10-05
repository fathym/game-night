/**
 * "Did everything record?" — a health report for one session: which streams arrived, at what rates,
 * where they dropped out, whether game events went missing, and how the streams line up in time.
 *
 * Everything here is inference over the raw file; the server writes lines and decides nothing.
 */
import type { Session, Stream } from "./parse.ts";
import { splitGames } from "./games.ts";
import { EXPECTED_STREAMS, streamInfo } from "./streams.ts";
import { findSyncMarkers, median, type SyncResult } from "./sync.ts";

export type Status = "ok" | "warning" | "absent";

export interface StreamReport {
  stream: string;
  label: string;
  unit: string;
  messages: number;
  messagesPerSecond: number;
  samplesPerSecond: number;
  expectedHz?: number;
  dropouts: number;
  longestDropoutSeconds: number;
  median?: number;
}

export interface CheckReport {
  session: string;
  start: string;
  end: string;
  minutes: number;
  overall: "ok" | "warnings" | "problems";
  summary: string[];
  game: {
    status: Status;
    events: number;
    byType: Record<string, number>;
    lobbies: string[];
    roundsStarted: number;
    roundsEnded: number;
    lostEvents: number;
    impostorRestarts: number;
    repeatedMeetingEnds: number;
    notes: string[];
  };
  voice: {
    status: Status;
    utterances: number;
    speakers: { user: string; name: string; utterances: number; seconds: number }[];
    missingFiles: string[];
    notes: string[];
  };
  emotibit: {
    status: Status;
    devices: { device: string; streams: StreamReport[]; missingExpected: string[] }[];
    notes: string[];
  };
  sync: {
    /** Each tap: its onset on the EmotiBit's own (uncorrected) clock, and the chat and utterance it matched. */
    markers: { at: string; device: string; peakG: number; chatAt?: string; voiceAt?: string }[];
    emotibitLagMs?: number;
    voiceLagMs?: number;
    emotibitVsVoiceMs?: number;
    note: string;
  };
  malformedLines: number;
  malformedExamples: { line: number; problem: string }[];
}

const DROPOUT_MS = 2000;

export function checkSession(session: Session, fileExists?: (file: string) => boolean): CheckReport {
  const game = checkGame(session);
  const voice = checkVoice(session, fileExists);
  const emotibit = checkEmotiBit(session);
  const sync = findSyncMarkers(session);

  const statuses = [game.status, voice.status, emotibit.status];
  const overall = statuses.includes("absent") ? "problems" : statuses.includes("warning") ? "warnings" : "ok";
  const line = (name: string, s: Status, detail: string) => `${name}: ${s === "ok" ? "OK" : s === "warning" ? "warning" : "missing"}. ${detail}`;

  const summary = [
    line("Game events", game.status, game.notes[0] ?? `${game.events} events.`),
    line("Voice", voice.status, voice.notes[0] ?? `${voice.utterances} utterances.`),
    line("EmotiBit", emotibit.status, emotibit.notes[0] ?? `${emotibit.devices.length} device(s).`),
    `Sync: ${sync.note}`,
  ];
  if (session.issueCount > 0) summary.push(`${session.issueCount} line(s) could not be read.`);

  const minutes = (session.lastMs - session.firstMs) / 60000;
  return {
    session: session.name,
    start: iso(session.firstMs),
    end: iso(session.lastMs),
    minutes: Number.isFinite(minutes) ? round(minutes, 1) : 0,
    overall,
    summary,
    game,
    voice,
    emotibit,
    sync: syncReport(sync),
    malformedLines: session.issueCount,
    malformedExamples: session.issues.slice(0, 5),
  };
}

function checkGame(session: Session): CheckReport["game"] {
  const events = session.game;
  const byType: Record<string, number> = {};
  for (const e of events) byType[e.type] = (byType[e.type] ?? 0) + 1;

  // seq counts up per Impostor process and starts over when Impostor restarts, so read it in arrival order.
  const byArrival = [...events].sort((a, b) => a.rx - b.rx);
  let lostEvents = 0, impostorRestarts = 0;
  for (let i = 1; i < byArrival.length; i++) {
    const gap = byArrival[i].seq - byArrival[i - 1].seq;
    if (gap > 1) lostEvents += gap - 1;
    if (gap <= 0) impostorRestarts++;
  }

  const lobbies = splitGames(events);
  const rounds = lobbies.flatMap((l) => l.rounds);
  const roundsEnded = rounds.filter((r) => r.endedAt !== undefined).length;
  const repeatedMeetingEnds = rounds.flatMap((r) => r.meetings).reduce((n, m) => n + m.extraEnds, 0);

  const notes: string[] = [];
  let status: Status = "ok";
  if (events.length === 0) {
    status = "absent";
    notes.push("No game events. Is the plugin loaded (\"GameNight Relay enabled\" in the Impostor log) and was a lobby created?");
  } else {
    notes.push(
      rounds.length === 0
        ? `${events.length} events from ${lobbies.length} lobby(ies), lobby only: no round started (a round needs 4 players).`
        : `${events.length} events, ${rounds.length} round(s) started and ${roundsEnded} finished.`,
    );
  }
  if (lostEvents > 0) {
    status = "warning";
    notes.push(`${lostEvents} game event(s) were lost on the way to the receiver (gaps in seq); the plugin doesn't retry.`);
  }
  if (impostorRestarts > 0) notes.push(`Impostor restarted ${impostorRestarts} time(s) during the session.`);
  if (rounds.length > roundsEnded) {
    notes.push(`${rounds.length - roundsEnded} round(s) have no end: the recording stopped mid-round, Impostor restarted, or game.ended was lost.`);
  }
  if (repeatedMeetingEnds > 0) {
    notes.push(`${repeatedMeetingEnds} meeting(s) ended more than once, which happens when Voting Time is ∞; the last result is used.`);
  }
  if (events.length > 0 && !byType["chat"]) notes.push("No chat events: only Free Chat is relayed, not Quick Chat.");

  return {
    status,
    events: events.length,
    byType,
    lobbies: lobbies.map((l) => l.code),
    roundsStarted: rounds.length,
    roundsEnded,
    lostEvents,
    impostorRestarts,
    repeatedMeetingEnds,
    notes,
  };
}

function checkVoice(session: Session, fileExists?: (file: string) => boolean): CheckReport["voice"] {
  const speakers = new Map<string, { user: string; name: string; utterances: number; seconds: number }>();
  for (const u of session.voice) {
    const s = speakers.get(u.user) ?? { user: u.user, name: u.name, utterances: 0, seconds: 0 };
    s.utterances++;
    s.seconds += (u.end - u.start) / 1000;
    s.name = u.name;
    speakers.set(u.user, s);
  }
  const missingFiles = fileExists ? session.voice.filter((u) => !fileExists(u.file)).map((u) => u.file) : [];

  const notes: string[] = [];
  let status: Status = "ok";
  if (session.voice.length === 0) {
    status = "absent";
    notes.push("No utterances. Was /gamenight start run by a listed player, and did anyone speak?");
  } else {
    const list = [...speakers.values()].map((s) => `${s.name} (${s.utterances}, ${round(s.seconds, 1)} s)`).join(", ");
    notes.push(`${session.voice.length} utterance(s) from ${speakers.size} speaker(s): ${list}.`);
  }
  if (missingFiles.length > 0) {
    status = "warning";
    notes.push(`${missingFiles.length} utterance file(s) are missing from the data folder.`);
  }
  return {
    status,
    utterances: session.voice.length,
    speakers: [...speakers.values()].map((s) => ({ ...s, seconds: round(s.seconds, 1) })),
    missingFiles: missingFiles.slice(0, 10),
    notes,
  };
}

function checkEmotiBit(session: Session): CheckReport["emotibit"] {
  const byDevice = new Map<string, Stream[]>();
  for (const s of session.streams) byDevice.set(s.device, [...(byDevice.get(s.device) ?? []), s]);

  const notes: string[] = [];
  let status: Status = "ok";
  if (byDevice.size === 0) {
    status = "absent";
    notes.push("No EmotiBit data. In the Oscilloscope, Output List → OSC has to be turned on after every launch.");
  }

  const devices = [...byDevice.entries()].map(([device, streams]) => {
    const reports = streams.map(streamReport);
    const missingExpected = EXPECTED_STREAMS.filter((e) => !streams.some((s) => s.stream === e));
    const eda = reports.find((r) => r.stream === "EDA");
    const hr = streams.find((s) => s.stream === "HR");

    const problems: string[] = [];
    if (missingExpected.length > 0) problems.push(`missing ${missingExpected.join(", ")}`);
    if (eda && eda.messagesPerSecond < 5) problems.push(`EDA arriving at only ${eda.messagesPerSecond} messages/s (expected about 10)`);
    if (eda?.median !== undefined && eda.median < 0.15) {
      problems.push(`EDA sits near ${eda.median} µS, which usually means poor electrode contact or very dry skin`);
    }
    if (eda && eda.dropouts > 0) problems.push(`EDA dropped out ${eda.dropouts} time(s), longest ${eda.longestDropoutSeconds} s`);
    if (hr && hr.v.length > 5) {
      const implausible = hr.v.filter((b) => b < 35 || b > 200).length / hr.v.length;
      if (implausible > 0.1) problems.push(`${Math.round(implausible * 100)}% of heart-rate values are outside 35-200 bpm (check the PPG fit)`);
    }

    if (problems.length > 0) {
      status = "warning";
      notes.push(`${device}: ${problems.join("; ")}.`);
    } else {
      notes.push(`${device}: ${streams.length} streams; EDA at ${eda?.messagesPerSecond ?? 0} messages/s.`);
    }
    return { device, streams: reports, missingExpected };
  });

  return { status, devices, notes };
}

function streamReport(s: Stream): StreamReport {
  const info = streamInfo(s.stream);
  const seconds = (s.messages.at(-1)! - s.messages[0]) / 1000;
  let dropouts = 0, longest = 0;
  if (info.kind === "periodic") {
    for (let i = 1; i < s.messages.length; i++) {
      const gap = s.messages[i] - s.messages[i - 1];
      if (gap > DROPOUT_MS) {
        dropouts++;
        longest = Math.max(longest, gap);
      }
    }
  }
  const med = median(s.v);
  return {
    stream: s.stream,
    label: info.label,
    unit: info.unit,
    messages: s.messages.length,
    messagesPerSecond: seconds > 0 ? round((s.messages.length - 1) / seconds, 1) : 0,
    samplesPerSecond: seconds > 0 ? round(s.v.length / seconds, 1) : 0,
    expectedHz: info.hz,
    dropouts,
    longestDropoutSeconds: round(longest / 1000, 1),
    median: med === undefined ? undefined : round(med, 3),
  };
}

/** Sync results for a reader: times as ISO stamps, delays in whole milliseconds. */
function syncReport(sync: SyncResult): CheckReport["sync"] {
  const ms = (x?: number) => (x === undefined ? undefined : Math.round(x));
  return {
    markers: sync.markers.map((m) => ({
      at: iso(m.at),
      device: m.device,
      peakG: round(m.peakG, 2),
      chatAt: m.chatAt === undefined ? undefined : iso(m.chatAt),
      voiceAt: m.voiceAt === undefined ? undefined : iso(m.voiceAt),
    })),
    emotibitLagMs: ms(sync.emotibitLagMs),
    voiceLagMs: ms(sync.voiceLagMs),
    emotibitVsVoiceMs: ms(sync.emotibitVsVoiceMs),
    note: sync.note,
  };
}

function iso(ms: number) {
  return Number.isFinite(ms) ? new Date(ms).toISOString() : "";
}

function round(x: number, digits: number) {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}
