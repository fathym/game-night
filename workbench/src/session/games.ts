/**
 * Lobbies, rounds and meetings, rebuilt from the plugin's raw event stream.
 *
 * The plugin relays what Impostor raises, warts included, so the cleanup happens here:
 * - When Impostor's own vote timer fires before every vote is in (always the case with an ∞ voting time),
 *   one meeting can end more than once, and a late vote overwrites an earlier "Missed". The last
 *   meeting.ended before the next meeting or the end of the round is the real result, and each voter's
 *   last vote is their vote.
 * - player.exiled can repeat for the same reason, so ejections come from the final meeting result.
 * - A round whose game.ended was lost (the plugin doesn't retry) is closed by the next round's start.
 * - Player ids are reassigned every round; names are the identity that holds across rounds.
 * - player.murdered also fires for failed or protected kills (the plugin doesn't say which).
 */
import type { GameEvent } from "./parse.ts";

export interface Player {
  id?: number;
  name: string;
  color?: string;
  impostor?: boolean;
  role?: string;
}

export interface Vote {
  t: number;
  voter: Player;
  /** Who they voted for; absent for skips and misses. */
  target?: Player;
  kind: string;
}

export interface Meeting {
  calledAt: number;
  by?: Player;
  trigger: "button" | "body";
  body?: Player;
  /** Each voter's final vote, in the order they were cast. */
  votes: Vote[];
  endedAt?: number;
  exiled?: Player;
  tie?: boolean;
  /** Extra meeting.ended events for this meeting (see the module note). */
  extraEnds: number;
}

export interface Round {
  lobby: string;
  /** 1-based, counting rounds within the lobby. */
  index: number;
  startedAt: number;
  endedAt?: number;
  /** Why it ended, from game.ended; absent when that event was lost and the next round's start closed it. */
  reason?: string;
  roster: Player[];
  meetings: Meeting[];
  murders: { t: number; killer?: Player; victim?: Player }[];
  chats: { t: number; from?: Player; message: string }[];
}

export interface Lobby {
  code: string;
  firstAt: number;
  lastAt: number;
  host?: string;
  joins: { t: number; player?: Player }[];
  leaves: { t: number; player?: Player; ban: boolean }[];
  /** Chat outside any round, e.g. while waiting in the lobby. */
  chats: { t: number; from?: Player; message: string }[];
  rounds: Round[];
}

export function splitGames(events: GameEvent[]): Lobby[] {
  const lobbies = new Map<string, Lobby>();
  const current = new Map<string, Round>();

  for (const e of events) {
    let lobby = lobbies.get(e.lobby);
    if (!lobby) {
      lobby = { code: e.lobby, firstAt: e.t, lastAt: e.t, joins: [], leaves: [], chats: [], rounds: [] };
      lobbies.set(e.lobby, lobby);
    }
    lobby.lastAt = e.t;
    const round = current.get(e.lobby);
    const d = e.data;

    switch (e.type) {
      case "game.created":
        lobby.host = str(d.host);
        break;
      case "lobby.joined":
        lobby.joins.push({ t: e.t, player: player(d.player) });
        break;
      case "lobby.left":
        lobby.leaves.push({ t: e.t, player: player(d.player), ban: d.isBan === true });
        break;
      case "game.started": {
        // A round still open here lost its game.ended on the way; the next one starting means it's over.
        if (round) round.endedAt = e.t - 1;
        const r: Round = {
          lobby: e.lobby,
          index: lobby.rounds.length + 1,
          startedAt: e.t,
          roster: list(d.roster),
          meetings: [],
          murders: [],
          chats: [],
        };
        lobby.rounds.push(r);
        current.set(e.lobby, r);
        break;
      }
      case "game.ended":
        if (round) {
          round.endedAt = e.t;
          round.reason = str(d.reason);
          // Fill in roles for anyone the start roster lacked; the start roster stays authoritative.
          for (const p of list(d.roster)) {
            if (!round.roster.some((q) => q.name === p.name)) round.roster.push(p);
          }
          current.delete(e.lobby);
        }
        break;
      case "meeting.called":
        round?.meetings.push({
          calledAt: e.t,
          by: player(d.by),
          trigger: d.trigger === "body" ? "body" : "button",
          body: player(d.body),
          votes: [],
          extraEnds: 0,
        });
        break;
      case "meeting.vote": {
        const m = round?.meetings.at(-1);
        if (!m) break;
        const voter = player(d.voter);
        if (!voter) break;
        const vote: Vote = { t: e.t, voter, target: player(d.for), kind: str(d.kind) ?? "Player" };
        const prior = m.votes.findIndex((v) => sameSeat(v.voter, voter));
        if (prior >= 0) m.votes.splice(prior, 1);
        m.votes.push(vote);
        break;
      }
      case "meeting.ended": {
        const m = round?.meetings.at(-1);
        if (!m) break;
        if (m.endedAt !== undefined) m.extraEnds++;
        m.endedAt = e.t;
        m.exiled = player(d.exiled);
        m.tie = d.isTie === true;
        break;
      }
      case "player.murdered":
        round?.murders.push({ t: e.t, killer: player(d.killer), victim: player(d.victim) });
        break;
      case "chat": {
        const c = { t: e.t, from: player(d.from), message: str(d.message) ?? "" };
        (round ? round.chats : lobby.chats).push(c);
        break;
      }
      // player.exiled is deliberately unused: the final meeting.ended says who was ejected.
    }
  }
  return [...lobbies.values()].sort((a, b) => a.firstAt - b.firstAt);
}

/** A seat is its player id; the name stands in only when an id is missing. */
function sameSeat(a: Player, b: Player) {
  return a.id !== undefined && b.id !== undefined ? a.id === b.id : a.name === b.name;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function player(v: unknown): Player | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const name = str(o.name);
  if (name === undefined) return undefined;
  return {
    id: typeof o.id === "number" ? o.id : undefined,
    name,
    color: str(o.color),
    impostor: typeof o.impostor === "boolean" ? o.impostor : undefined,
    role: str(o.role),
  };
}

function list(v: unknown): Player[] {
  return Array.isArray(v) ? v.map(player).filter((p): p is Player => !!p) : [];
}

/** Roles may only be shown for a round that has ended; before that they'd spoil the game. */
export function rolesVisible(round: Round): boolean {
  return round.endedAt !== undefined;
}
