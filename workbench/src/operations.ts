/**
 * The workbench's analysis steps, as steward Operations on the GameNight tool's own steward. Each one
 * validates its input itself (fAI hands in-process and API-mode calls over unvalidated), takes the session
 * from the tool's shared SessionStore and runs the pure analysis in session/.
 */
import { z } from "zod";
import { Operation } from "@fathym/steward/operations";
import { type CheckReport, checkSession } from "./session/check.ts";
import { buildTimeline, ENTRY_KINDS, type TimelineResult } from "./session/timeline.ts";
import type { SessionListing, SessionStore } from "./store/SessionStore.ts";

/** IoC name of the tool's one SessionStore, which keeps parsed sessions between calls. */
export const STORE = "GameNightSessionStore";

const DEMO_NOTE = "This is the synthetic demo session bundled with the workbench, not a recording. " +
  "Set GAMENIGHT_DATA to the receiver's data folder to read real ones.";

const Session = z.string().optional().describe("Session name, as listed by gamenight-sessions. The newest when omitted.");
/** With Z or an explicit offset: a bare time would be read in whatever time zone the server runs in. */
const Time = z.iso.datetime({ offset: true });

export const SessionsArgs = z.object({
  Limit: z.number().int().min(1).max(100).optional().describe("How many sessions to list, newest first (default 20)."),
});

export const CheckArgs = z.object({ Session });

export const TimelineArgs = z.object({
  Session,
  Lobby: z.string().optional().describe("Only this lobby, by its game code (gamenight-check lists them)."),
  Round: z.number().int().min(1).optional().describe(
    "Only this round of the lobby, counting from 1. Give Lobby too when the session has more than one.",
  ),
  From: Time.optional().describe("Only entries at or after this time, e.g. 2026-10-05T20:02:00Z."),
  To: Time.optional().describe("Only entries at or before this time, e.g. 2026-10-05T20:05:00Z."),
  Kinds: z.array(z.enum(ENTRY_KINDS)).optional().describe("Only these kinds of entry."),
  Device: z.string().optional().describe("EmotiBit whose readings annotate the entries, e.g. /EmotiBit/0. The first one with EDA by default."),
  EmotibitLagMs: z.number().optional().describe("EmotiBit delay to correct for, in ms. Measured from sync taps by default."),
  Biometrics: z.boolean().optional().describe("Annotate entries with EDA and heart rate (default true)."),
  Limit: z.number().int().min(1).max(1000).optional().describe("Most entries to return (default 200)."),
});

export interface SessionsResult {
  total: number;
  sessions: SessionListing[];
  note?: string;
}

export const SessionsOp = Operation("sessions", "List recorded sessions, newest first")
  .Input(SessionsArgs)
  .Output(z.custom<SessionsResult>())
  .Services(async (_ctx, ioc) => ({ Store: await ioc.Resolve<SessionStore>(ioc.Symbol(STORE)) }))
  .Execute(async (ctx) => {
    const { Limit } = SessionsArgs.parse(ctx.Input ?? {});
    const store = ctx.Services!.Store;
    const sessions = await store.list();
    return { total: sessions.length, sessions: sessions.slice(0, Limit ?? 20), note: store.demo ? DEMO_NOTE : undefined };
  });

export const CheckOp = Operation("check", "Which streams a session captured, at what rates, with what gaps and offsets")
  .Input(CheckArgs)
  .Output(z.custom<CheckReport>())
  .Services(async (_ctx, ioc) => ({ Store: await ioc.Resolve<SessionStore>(ioc.Symbol(STORE)) }))
  .Execute(async (ctx) => {
    const { Session } = CheckArgs.parse(ctx.Input ?? {});
    const store = ctx.Services!.Store;
    const session = await store.load(Session);
    if (!store.demo) return checkSession(session, (file) => store.fileExists(file));
    // The demo ships no audio, so there are no utterance files to look for.
    const report = checkSession(session);
    report.summary.unshift(DEMO_NOTE);
    return report;
  });

export const TimelineOp = Operation("timeline", "Game moments, speech and the wearer's biometrics on one clock")
  .Input(TimelineArgs)
  .Output(z.custom<TimelineResult>())
  .Services(async (_ctx, ioc) => ({ Store: await ioc.Resolve<SessionStore>(ioc.Symbol(STORE)) }))
  .Execute(async (ctx) => {
    const args = TimelineArgs.parse(ctx.Input ?? {});
    const store = ctx.Services!.Store;
    const timeline = buildTimeline(await store.load(args.Session), {
      lobby: args.Lobby,
      round: args.Round,
      from: args.From,
      to: args.To,
      kinds: args.Kinds,
      device: args.Device,
      emotibitLagMs: args.EmotibitLagMs,
      biometrics: args.Biometrics,
      limit: args.Limit,
    });
    return store.demo ? { ...timeline, note: DEMO_NOTE } : timeline;
  });

export const GameNightOps = { Sessions: SessionsOp, Check: CheckOp, Timeline: TimelineOp };
