/**
 * The fAI layer: the tool and its operations in-process, against a data folder laid out as the receiver
 * writes it, and the real entry served over MCP by `fai run`, the way Claude Code launches it.
 */
import { assert, assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { fromFileUrl, join } from "@std/path";
import { initWorkbenchTelemetry, Workbench, WorkbenchRunner } from "@fathym/fai/workbenches";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { GameNightTool } from "../src/GameNightTool.ts";
import { syntheticSession } from "./synthetic.ts";
import { FIXTURE } from "./write-fixture.ts";

initWorkbenchTelemetry(); // keeps fAI's debug logging out of the test output

const VOTES = ["Di (Yellow) voted for Bo (Blue)", "Bo (Blue) voted for Ada (Red)", "Ada (Red) voted for Bo (Blue)"];

/** One session file, with every utterance's audio beside it in voice/. */
async function recordedFolder() {
  const dir = await Deno.makeTempDir({ prefix: "game-night-wb-" });
  const text = syntheticSession();
  await Deno.writeTextFile(join(dir, "2026-10-05T20-00-00-000Z.jsonl"), text);
  await Deno.mkdir(join(dir, "voice"));
  for (const line of text.split("\n")) {
    if (line.includes('"src":"voice"')) await Deno.writeTextFile(join(dir, JSON.parse(line).file), "audio");
  }
  return dir;
}

Deno.test("tool: sessions, check and timeline run as operations over the data folder", async () => {
  const workbench = Workbench("test", "test").Tools({ GameNight: GameNightTool({ DataDir: await recordedFolder() }) });
  const bench = await WorkbenchRunner(workbench).Open();
  try {
    const night = bench.Tools.GameNight;
    const listed = await night.Sessions({});
    assertEquals(listed.sessions.map((s) => s.name), ["2026-10-05T20-00-00-000Z"]);
    assertEquals(listed.note, undefined);

    const report = await night.Check({});
    assertEquals(report.voice.missingFiles, []);
    assertEquals(report.game.lostEvents, 1);
    assertEquals(report.sync.markers.length, 3);
    assert(report.sync.emotibitLagMs! >= 150 && report.sync.emotibitLagMs! <= 280, `EmotiBit lag ${report.sync.emotibitLagMs}`);

    const votes = await night.Timeline({ Round: 1, Kinds: ["vote"] });
    assertEquals(votes.entries.map((e) => e.text), VOTES);
    assertEquals(votes.note, undefined);

    // The operations validate their own input: fAI passes in-process and API-mode calls through as given.
    await assertRejects(() => night.Timeline({ Round: 0 }));
    await assertRejects(() => night.Timeline({ From: "2026-10-05T20:02:00" })); // no offset: whose clock?
    await assertRejects(() => night.Check({ Session: "nope" }), Error, "No session named");
  } finally {
    await bench.Close();
  }
});

Deno.test("fixture: the bundled demo session is what the generator writes", async () => {
  const committed = (await Deno.readTextFile(FIXTURE)).replaceAll("\r\n", "\n");
  assert(committed === syntheticSession(), "fixtures/synthetic-demo.jsonl is out of date: run `deno task fixture`");
});

Deno.test({
  name: "mcp: fai run serves the entry over stdio, with the demo session when GAMENIGHT_DATA isn't set",
  // The MCP SDK's StdioClientTransport.close() leaves a timer behind.
  sanitizeOps: false,
  sanitizeResources: false,
}, async () => {
  const transport = new StdioClientTransport({
    // The fai CLI at a pinned version, so the test doesn't depend on a global install.
    command: Deno.execPath(),
    args: ["run", "-A", "--no-config", "jsr:@fathym/fai@0.0.785", "run", "game-night.ts", "--mode", "MCP"],
    cwd: fromFileUrl(new URL("..", import.meta.url)),
    stderr: "pipe",
    // The SDK gives the server a minimal environment plus this, so GAMENIGHT_DATA is never inherited.
    env: { FAI_TELEMETRY_DISABLED: "1", DO_NOT_TRACK: "1" },
  });
  transport.stderr?.on("data", () => {}); // drained, so the server never blocks on a full pipe
  const client = new Client({ name: "game-night-test", version: "0.0.0" });
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    assertEquals(tools.map((t) => t.name).sort(), ["gamenight-check", "gamenight-sessions", "gamenight-timeline"]);
    const timelineArgs = tools.find((t) => t.name === "gamenight-timeline")!.inputSchema.properties ?? {};
    assert(["Session", "Round", "Kinds", "From"].every((k) => k in timelineArgs), Object.keys(timelineArgs).join());

    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const result = await client.callTool({ name, arguments: args });
      const text = (result.content as { type: string; text: string }[])[0].text;
      assert(!result.isError, text);
      return JSON.parse(text);
    };

    const listed = await call("gamenight-sessions");
    assertEquals(listed.sessions.map((s: { name: string }) => s.name), ["synthetic-demo"]);
    assertStringIncludes(listed.note, "synthetic demo session");

    const report = await call("gamenight-check");
    assertEquals(report.overall, "warnings");
    assertStringIncludes(report.summary[0], "synthetic demo session");
    assertEquals(report.voice.status, "ok");

    const votes = await call("gamenight-timeline", { Round: 1, Kinds: ["vote"] });
    assertEquals(votes.entries.map((e: { text: string }) => e.text), VOTES);
    assertStringIncludes(votes.note, "synthetic demo session");
    assert(votes.entries[1].eda.rise5s > 0.4, `EDA rise after Bo's vote: ${votes.entries[1].eda.rise5s}`);

    const bad = await client.callTool({ name: "gamenight-timeline", arguments: { Round: "first" } });
    assertEquals(bad.isError, true);
  } finally {
    await client.close();
  }
});
