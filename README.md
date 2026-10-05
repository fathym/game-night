# game-night

Among Us as a lie detector. A self-hosted [Impostor](https://github.com/Impostor/Impostor) server
emits game events (meetings, votes, kills, ejections); EmotiBit (later, DIY ESP32 nodes) streams biometrics;
a Discord bot captures what each player says. The streams are joined on one clock and scored — who lied
calmest, who spiked when their name came up.

## Where things run

The home server is dumb: `plugin/` and `voice/` relay, `receiver/` stamps and appends, `server/`
deploys them. Transcription, scoring, storage and the leaderboard belong to the `game-night` fAI
workbench (`fai run` locally, hosted in OpenX); `receiver/` is its seed. Once the workbench is hosted,
the plugin and the voice relay post to it directly — `GAMENIGHT_URL` and `GAMENIGHT_VOICE_URL` are the
only seams, plus a token once the endpoint is public — and only the OSC half of the receiver stays on
the LAN as a forwarder, because EmotiBit's UDP cannot reach a hosted container. Nothing that decides
anything lives in `plugin/`, `voice/`, `server/`, or the forwarder half of `receiver/`.

Players join from their own homes over Tailscale: the server is shared with each player and reachable
only on the game ports, and nothing on the home network is exposed to the internet
([server/README.md](server/README.md), Step 0).

## Layout

| Path | What |
|---|---|
| `plugin/` | C# Impostor plugin. Turns game events into JSON and POSTs them to the receiver. Thin by design. |
| `voice/` | Node Discord bot. Joins a voice channel on `/gamenight start` and POSTs each speaker's utterances to the receiver as Ogg Opus. Capture only: no transcription. |
| `receiver/` | Deno process. HTTP intake for game events and voice, UDP/OSC intake for EmotiBit, one JSONL per session. Seed of the fAI workbench; stamp-and-append only. |
| `server/` | Compose file, plugin build script, and the deploy runbook for the home server. |
| `workbench/` | The fAI workbench. Reads the receiver's session files and serves the analysis as MCP tools: what a session captured, and what happened when, with the wearer's biometrics. `.mcp.json` registers it with Claude Code. |
| `PLAYERS.md` | Setup guide for players joining game night. The host sends it along with the Tailscale invite and `regionInfo.json`. |

## Event stream

Each JSONL line under `server/data/` is one event, stamped by the receiver with `rx` (arrival time)
and `src`. Game lines: `{ts, seq, game, type, data, rx, src:"game"}` — `ts`/`seq` come from the
plugin; `ts` is stamped on the same host before the send queue, so game events join on `ts`. `seq`
restarts at 1 when Impostor restarts, and a gap means an event was lost (queue overflow or a failed
POST — the plugin does not retry). EmotiBit lines: `{address, args, rx, src:"emotibit"}`, one per OSC
message, raw; they carry no stamp of their own, so `rx` is their clock.

Game `type` is one of game.created, lobby.joined, lobby.left, game.started, meeting.called, meeting.vote,
meeting.ended, player.exiled, player.murdered, chat, game.ended; `data` shapes are in
`plugin/GameEventListener.cs`. `lobby.joined` identifies the player by connection (`client`, `name`)
because it fires before the character spawns; in-game events use `id`. Roles (`impostor`, `role`)
appear only in the game.started and game.ended rosters; nothing live may show them before game.ended.
`chat` is free-text only — Impostor does not relay Quick Chat.

Voice lines: `{type:"utterance", user, name, start, duration, file, rx, src:"voice"}`, one per
utterance, only for the players in `GAMENIGHT_PLAYERS`. `user` is the speaker's Discord id and `name`
their display name at the time; mapping ids to players is the workbench's job. `start` is the relay's
stamp of the utterance's first packet on the same host clock, so voice joins on `start` (`rx` only
arrives once the utterance has ended); `duration` is in seconds. `file` is Ogg Opus under
`server/data/`, padded with silence wherever it falls behind real time: audio at offset t in the file
reached the relay within about 100 ms of `start` + t (more right after a network stall, until the next
pause).

Recorded sessions are the fixtures the workbench is built against, so changing these shapes is a
breaking change.

## Status

v0: capture, plus a first workbench that checks a recording and lines up what happened. See
[server/README.md](server/README.md) to deploy and record a first session, and
[workbench/README.md](workbench/README.md) to analyze it.

## Developing

- Plugin: `cd plugin && dotnet build -c Release` (.NET 8 SDK) → `plugin/bin/Release/net8.0/GameNight.Relay.dll`.
- Receiver: `cd receiver && deno task start` (writes `./data/`, gitignored).
- Workbench: `cd workbench && deno task test` (Deno 2.6+; the MCP test runs `fai run`). Claude Code
  starts it from `.mcp.json`.
- Voice relay: `cd voice && npm install && npm test` (Node 22.12+). `npm start` needs `DISCORD_TOKEN`
  and `GAMENIGHT_PLAYERS`, and `GAMENIGHT_VOICE_URL=http://localhost:8420/voice` to post to a local
  receiver. Use a separate test bot, or stop the server's voice container first: two processes on one
  token both answer `/gamenight`.
- Push a local DLL to the server without a git round-trip:
  `scp plugin/bin/Release/net8.0/GameNight.Relay.dll YOUR_USERNAME@192.168.x.y:docker/game-night/server/plugins/ && ssh YOUR_USERNAME@192.168.x.y 'cd docker/game-night/server && docker compose restart impostor'`
