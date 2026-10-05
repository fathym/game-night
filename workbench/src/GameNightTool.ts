/**
 * GameNight, the workbench's one tool. Each method an agent calls (gamenight-sessions, gamenight-check,
 * gamenight-timeline over MCP) runs the Operation of the same name on the tool's own steward, which holds
 * one SessionStore for the life of the process, so follow-up questions about a session reuse its parse.
 */
import { z } from "zod";
import { Tool } from "@fathym/fai/tools";
import type { OperationRunFn } from "@fathym/fai/composition";
import type { OperationTypeMap } from "@fathym/steward/operations";
import { CheckArgs, GameNightOps, SessionsArgs, type SessionsResult, STORE, TimelineArgs } from "./operations.ts";
import type { CheckReport } from "./session/check.ts";
import type { TimelineResult } from "./session/timeline.ts";
import { SessionStore } from "./store/SessionStore.ts";

export interface GameNightConfig {
  /** Folder holding the receiver's session files. */
  DataDir: string;
  /** DataDir is the bundled synthetic demo session, not real recordings. */
  Demo?: boolean;
}

export function GameNightTool(config: GameNightConfig) {
  return Tool("GameNight", "Game-night recordings: what was captured, and what happened when.")
    .Configure((plane) =>
      plane
        .OnInit((ioc) => {
          const store = new SessionStore(config.DataDir, config.Demo);
          ioc.Register(() => store, { Type: ioc.Symbol(STORE) });
        })
        .Operations(GameNightOps)
    )
    .Handle(z.object({
      Sessions: z.function({ input: [SessionsArgs], output: z.promise(z.custom<SessionsResult>()) }).describe(
        "List the game-night recordings, newest first, with when each started and ended. " +
          "The other gamenight tools take these session names.",
      ),
      Check: z.function({ input: [CheckArgs], output: z.promise(z.custom<CheckReport>()) }).describe(
        "Check what one recording captured: game events from the Impostor server, Discord voice and EmotiBit " +
          "biometrics, at what rates, where they dropped out, which game events were lost, and how far each " +
          "stream lags the game clock (measured from sync taps). Run it first after a game night or a test lobby.",
      ),
      Timeline: z.function({ input: [TimelineArgs], output: z.promise(z.custom<TimelineResult>()) }).describe(
        "What happened when: lobby joins, chat, rounds, meetings, votes, kills and ejections, who spoke, and " +
          "the EmotiBit wearer's skin conductance (EDA, µS) and heart rate at each moment, with the rise that " +
          "followed. Everything is on the game clock, with EmotiBit readings shifted by their measured delay. " +
          "Roles, killers and dead players' ghost chat stay hidden until a round ends. Filter by lobby, round, " +
          "time or kind.",
      ),
    }))
    .Execute(async (ctx) => {
      const run = ctx.StewardRun as OperationRunFn<OperationTypeMap<typeof GameNightOps>>;
      return {
        Sessions: (args) => run("Sessions", args),
        Check: (args) => run("Check", args),
        Timeline: (args) => run("Timeline", args),
      };
    });
}
