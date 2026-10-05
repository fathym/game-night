/**
 * The game-night workbench. `fai run workbench/game-night.ts --mode MCP` serves it to an MCP client (the
 * repo's .mcp.json registers it with Claude Code), and OpenX can host this same file as its Entry.
 *
 * GAMENIGHT_DATA is the receiver's data folder; without it, the workbench serves the synthetic demo session
 * in fixtures/.
 */
import { join } from "@std/path";
import { MCPMode, Workbench } from "@fathym/fai/workbenches";
import { GameNightTool } from "./src/GameNightTool.ts";

const data = Deno.env.get("GAMENIGHT_DATA") || undefined;

export default Workbench("game-night", "Among Us as a lie detector: checks and lines up what a game night recorded.")
  .Tools({
    GameNight: GameNightTool({ DataDir: data ?? join(import.meta.dirname!, "fixtures"), Demo: !data }),
  })
  .Modes({ MCP: MCPMode() });
