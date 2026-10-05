# game-night workbench

The [fAI](https://jsr.io/@fathym/fai) workbench where a game night gets analyzed. The home server only
writes JSONL (see the repo [README](../README.md#event-stream)). This workbench reads those files and
answers two questions about them: did everything record, and what happened when, including how the
EmotiBit wearer's body reacted.

`fai run` serves it over MCP from one file, [game-night.ts](game-night.ts). There is no server code to
write, and OpenX can host the same file later.

## Tools

| MCP tool | Answers | Arguments (all optional) |
|---|---|---|
| `gamenight-sessions` | Which recordings exist, newest first, with when each started and ended | `Limit` |
| `gamenight-check` | Did everything record: game events, voice and EmotiBit streams, their rates and dropouts, lost game events, missing audio, and each stream's delay relative to the game clock (from sync taps) | `Session` |
| `gamenight-timeline` | Joins, chat, rounds, meetings, votes, kills, ejections and who spoke, all on one clock, each with the wearer's EDA and heart rate at that moment and the rise that followed | `Session`, `Lobby`, `Round`, `From`, `To`, `Kinds`, `Device`, `EmotibitLagMs`, `Biometrics`, `Limit` |

`Session` defaults to the newest recording. Rounds are numbered within each lobby. The timeline keeps
roles, who made each kill, and dead players' ghost chat hidden until a round ends.

## Use it from Claude Code

You need Deno 2.6 or later and the fai CLI (`deno run -A jsr:@fathym/fai/install`). If fai has never
run on this machine, run `fai telemetry status` once first. Its first-run notice prints to stdout, and
on the first launch that would corrupt the MCP stream.

1. Warm Deno's cache, and prove the setup, by running the tests: `cd workbench && deno task test`.
2. Start Claude Code at the repo root and approve the `game-night` server from [.mcp.json](../.mcp.json).
3. Ask something like *"Check the latest game-night session"* or *"What did Ada's body do when she
   was voted for?"*

With `GAMENIGHT_DATA` unset, the workbench serves a synthetic demo session,
[fixtures/synthetic-demo.jsonl](fixtures/synthetic-demo.jsonl). Every result says so. The session is
four players and one round, and it contains a lost game event, an EDA dropout, a meeting that ends
twice, and a skin-conductance and heart-rate response to an accusation.
[test/synthetic.ts](test/synthetic.ts) generates it, and `deno task fixture` rewrites it.

To run the server without Claude Code: `deno task mcp`.

## Your own recordings

Pull sessions from the server into the local `server/data/`, which is gitignored here too. These are
the commands from [server/README.md](../server/README.md#step-8-first-recorded-session), Step 8:

```sh
scp YOUR_USERNAME@192.168.x.y:docker/game-night/server/data/*.jsonl server/data/
scp -r YOUR_USERNAME@192.168.x.y:docker/game-night/server/data/voice server/data/
```

Then point `GAMENIGHT_DATA` at that folder, as an absolute path, in the environment Claude Code starts from.
For example, run `GAMENIGHT_DATA="$PWD/server/data" claude`. For the VS Code extension, set it as a
user environment variable and restart VS Code. Audio files are checked against `voice/` in that
folder.

**Sync taps.** Check can measure how far each stream lags the game clock only if the recording starts
with sync taps. In the lobby, before the first round, do this three times, a few seconds apart: tap the
EmotiBit sharply while pressing Enter on a chat message and saying "now". Only that stretch is searched,
so movement during play can't be mistaken for a tap. The timeline then corrects EmotiBit readings by the
measured delay.

## How it's built

| Path | What |
|---|---|
| [game-night.ts](game-night.ts) | The entry: a fAI `Workbench` with one tool and MCP mode. Reads `GAMENIGHT_DATA`. |
| [src/GameNightTool.ts](src/GameNightTool.ts) | The `GameNight` tool. Each method runs the Operation of the same name on the tool's own steward, which shares one `SessionStore` for the life of the process. |
| [src/operations.ts](src/operations.ts) | `Sessions`, `Check` and `Timeline` as steward Operations. Each validates its own input, because fAI 0.0.785 passes in-process and API-mode calls through unchecked. |
| [src/store/SessionStore.ts](src/store/SessionStore.ts) | Read-only access to the data folder, with a small parse cache. It accepts only session names it listed itself. |
| [src/session/](src/session/) | The analysis, in plain TypeScript with no fAI imports: `parse` (lines to streams), `games` (rounds, meetings and votes, deduplicated), `sync` (tap detection), `check` and `timeline`. |
| [test/](test/) | The generator, unit tests for the analysis, an in-process test of the tool, and an MCP test through `fai run`. |

stdio is the protocol channel, so anything in here that logs uses `console.error`. When the client
disconnects, fAI 0.0.785's stdio mode exits with "Top-level await promise never resolved". That is
expected. Each `fai run` writes `.logs/runtime-*.jsonl` into its working directory, and `.logs/` is
gitignored.

## Hosting in OpenX

The entry is already shaped the way OpenX hosts a workbench: Repo plus Ref, Entry
`workbench/game-night.ts`, Dockerfile left blank, MCP mode. A hosted container sees only committed
files, so it would serve the synthetic demo. Keep it that way until the hosted endpoint is locked
down: raw biometrics and voice don't belong on it.
