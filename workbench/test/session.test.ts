import { assert, assertAlmostEquals, assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import { parseSession } from "../src/session/parse.ts";
import { splitGames } from "../src/session/games.ts";
import { checkSession } from "../src/session/check.ts";
import { findSyncMarkers } from "../src/session/sync.ts";
import { buildTimeline } from "../src/session/timeline.ts";
import { DEVICE, LOBBY, syntheticSession, T0, TAPS_S, VOICE_LAG_MS } from "./synthetic.ts";

const full = parseSession(syntheticSession(), "synthetic");

// Extra receiver lines for the cases the synthetic night doesn't contain, at s seconds after T0.
const iso = (s: number) => new Date(T0 + Math.round(s * 1000)).toISOString();
const gameLine = (s: number, seq: number, type: string, data: Record<string, unknown>, lobby = LOBBY) =>
  JSON.stringify({ ts: iso(s), seq, game: lobby, type, data, rx: iso(s + 0.002), src: "game" });
const voiceLine = (s: number, name: string, seconds: number) =>
  JSON.stringify({ type: "utterance", user: "100000000000000009", name, start: iso(s), duration: seconds, file: `voice/${s}.ogg`, rx: iso(s + seconds + 1), src: "voice" });
const joltLine = (s: number) => JSON.stringify({ address: `${DEVICE}/ACC:Z`, args: [3], rx: iso(s), src: "emotibit" });
const plus = (text: string, ...lines: string[]) => text + lines.join("\n") + "\n";

Deno.test("parse: every stream comes back, with periodic samples rebuilt at their nominal rate", () => {
  assertEquals(full.issueCount, 0);
  assertEquals(full.voice.length, 6);
  const eda = full.streams.find((s) => s.device === DEVICE && s.stream === "EDA")!;
  const seconds = (eda.t.at(-1)! - eda.t[0]) / 1000;
  assertAlmostEquals(eda.v.length / seconds, 15, 0.5); // samples per second, minus the 3 s dropout's share
  assert(eda.messages.length < eda.v.length, "messages carry more than one sample");
  for (let i = 1; i < eda.t.length; i++) assert(eda.t[i] >= eda.t[i - 1], "samples are in time order");
});

Deno.test("parse: unreadable lines are reported, not fatal", () => {
  const s = parseSession('{"src":"game"}\nnot json\n{"src":"martian","rx":"2026-10-05T20:00:00Z"}\n', "bad");
  assertEquals(s.issueCount, 3);
  assertEquals(s.game.length, 0);
});

Deno.test("games: meetings keep the final result and each voter's last vote", () => {
  const [lobby] = splitGames(full.game);
  assertEquals(lobby.code, LOBBY);
  assertEquals(lobby.host, "Ada");
  assertEquals(lobby.joins.map((j) => j.player?.name), ["Ada", "Bo", "Cy", "Di"]);
  assertEquals(lobby.chats.length, 3);

  const [round] = lobby.rounds;
  assertEquals(round.roster.filter((p) => p.impostor).map((p) => p.name), ["Bo"]);
  assertEquals(round.murders.map((m) => `${m.killer?.name}>${m.victim?.name}`), ["Bo>Cy"]);

  const [meeting] = round.meetings;
  assertEquals(meeting.trigger, "body");
  assertEquals(meeting.body?.name, "Cy");
  assertEquals(meeting.exiled?.name, "Bo");
  assertEquals(meeting.extraEnds, 1);
  assertEquals(meeting.votes.map((v) => `${v.voter.name}>${v.target?.name}`), ["Di>Bo", "Bo>Ada", "Ada>Bo"]);
});

Deno.test("sync: the three taps are found, the slow tilt is not, and the delays come out right", () => {
  const sync = findSyncMarkers(full);
  assertEquals(sync.markers.length, TAPS_S.length);
  assert(sync.emotibitLagMs! >= 150 && sync.emotibitLagMs! <= 280, `EmotiBit lag ${sync.emotibitLagMs}`);
  assertAlmostEquals(sync.voiceLagMs!, VOICE_LAG_MS, 5);
});

Deno.test("sync: movement during play neither drowns out the lobby taps nor passes for one", () => {
  // 25 jolts through the round, some of them while people talk in the meeting.
  const jolts = Array.from({ length: 25 }, (_, i) => joltLine(47 + i * 3.3));
  const sync = findSyncMarkers(parseSession(plus(syntheticSession(), ...jolts)));
  assertEquals(sync.markers.length, TAPS_S.length);
  assert(sync.emotibitLagMs! >= 150 && sync.emotibitLagMs! <= 280, `EmotiBit lag ${sync.emotibitLagMs}`);
});

Deno.test("games: a round whose game.ended was lost ends when the next one starts", () => {
  const lost = syntheticSession().split("\n").filter((l) => !l.includes('"game.ended"')).join("\n");
  const s = parseSession(plus(lost, gameLine(150, 30, "game.started", { roster: [] })));
  const [lobby] = splitGames(s.game);
  assertEquals(lobby.rounds.length, 2);
  assertEquals(lobby.rounds[0].endedAt, T0 + 150_000 - 1);
  const first = buildTimeline(s, { round: 1 }).entries.map((e) => e.text);
  assert(!first.some((t) => t.startsWith("Round 2")), "the next round is outside this one's window");
  assert(first.includes("Round 1 ended (its end wasn't recorded); impostor(s) were Bo (Blue)"), first.join("\n"));
});

Deno.test("check: flags the lost event, the repeated meeting end and the EDA dropout", () => {
  const report = checkSession(full, (file) => !file.includes("100000000000000002"));
  assertEquals(report.overall, "warnings");
  assertEquals(report.game.lostEvents, 1);
  assertEquals(report.game.roundsStarted, 1);
  assertEquals(report.game.roundsEnded, 1);
  assertEquals(report.game.repeatedMeetingEnds, 1);
  assertEquals(report.voice.utterances, 6);
  assertEquals(report.voice.speakers.length, 3);
  assertEquals(report.voice.missingFiles.length, 1); // Bo's file is "missing" in this test
  const [device] = report.emotibit.devices;
  assertEquals(device.missingExpected, []);
  const eda = device.streams.find((s) => s.stream === "EDA")!;
  assertEquals(eda.dropouts, 1);
  assertAlmostEquals(eda.messagesPerSecond, 10, 1);
});

Deno.test("check: an empty session is a problem on every front", () => {
  const report = checkSession(parseSession("", "empty"));
  assertEquals(report.overall, "problems");
  assertEquals([report.game.status, report.voice.status, report.emotibit.status], ["absent", "absent", "absent"]);
});

Deno.test("timeline: the wearer's body responds after being voted for", () => {
  const t = buildTimeline(full, { lobby: LOBBY, round: 1 });
  assertEquals(t.lagSource, "measured");
  const accused = t.entries.find((e) => e.text === "Bo (Blue) voted for Ada (Red)")!;
  assert(accused.eda!.rise5s > 0.4, `EDA rise ${accused.eda!.rise5s}`);
  assert(accused.hr!.peak10s >= 90, `HR peak ${accused.hr!.peak10s}`);
  assert(t.entries.some((e) => e.text === "Bo (Blue) was ejected (impostor)"));
  assert(t.entries.some((e) => e.text === "Bo (Blue) killed Cy (Green)"));
});

Deno.test("timeline: roles and killers stay hidden while a round is unfinished", () => {
  const live = buildTimeline(parseSession(syntheticSession({ endS: 100 }), "live"));
  const text = live.entries.map((e) => e.text).join("\n");
  assertStringIncludes(text, "roles hidden until the round ends");
  assertStringIncludes(text, "Cy (Green) was killed");
  assert(!text.includes("killed Cy"), "the killer must not be named");
  assert(!text.includes("impostor"), "no role may leak");
});

Deno.test("timeline: dead players' ghost chat stays hidden until the round ends", () => {
  const ghost = gameLine(90, 99, "chat", { from: { id: 2, name: "Cy", color: "Green" }, message: "bo got me in electrical" });
  const live = buildTimeline(parseSession(plus(syntheticSession({ endS: 100 }), ghost))).entries.map((e) => e.text).join("\n");
  assert(!live.includes("bo got me"), "ghost chat can name the killer");
  assertStringIncludes(live, "Cy (Green) wrote in ghost chat (hidden until the round ends)");
  const after = buildTimeline(parseSession(plus(syntheticSession(), ghost)));
  assert(after.entries.some((e) => e.text === "Cy (Green): bo got me in electrical"));
});

Deno.test("timeline: Lobby scopes voice and taps to that lobby, and Round needs it when there are several", () => {
  const s = parseSession(plus(
    syntheticSession(),
    gameLine(150, 30, "game.created", { host: "Di" }, "OTHER2"),
    gameLine(151, 31, "lobby.joined", { player: { client: 4, name: "Di" } }, "OTHER2"),
    voiceLine(160, "Di", 2),
  ));
  const first = buildTimeline(s, { lobby: LOBBY });
  assert(first.entries.every((e) => Date.parse(e.at) < T0 + 150_000), "the first lobby stops where the next begins");
  assert(first.entries.some((e) => e.kind === "sync"));
  assertEquals(buildTimeline(s, { lobby: "other2" }).entries.map((e) => e.kind), ["lobby", "lobby", "voice"]);
  assertThrows(() => buildTimeline(s, { lobby: "NOPE" }), Error, "GNIGHT, OTHER2");
  assertThrows(() => buildTimeline(s, { round: 1 }), Error, "Give Lobby too");
});

Deno.test("timeline: offsets round to a tenth of a second without a 60th second", () => {
  const s = parseSession(plus("", gameLine(0, 1, "game.created", { host: "Ada" }), gameLine(119.97, 2, "chat", { from: { name: "Ada" }, message: "hi" })));
  assertEquals(buildTimeline(s, { kinds: ["chat"] }).entries[0].offset, "+02:00.0");
});

Deno.test("timeline: limit and kinds narrow the output", () => {
  const t = buildTimeline(full, { kinds: ["vote"], limit: 2 });
  assertEquals(t.entries.length, 2);
  assertEquals(t.total, 3);
  assert(t.truncated);
  assert(t.entries.every((e) => e.kind === "vote"));
});
