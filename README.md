# game-night

Among Us as a lie detector. A self-hosted [Impostor](https://github.com/Impostor/Impostor) server
emits game events (meetings, votes, kills, ejections). Wearables stream biometrics: an EmotiBit today,
DIY [bands](band/README.md) next. A Discord bot captures what each player says. The streams are joined
on one clock and scored: who lied calmest, who spiked when their name came up.

**Where this stands:** the capture path that works today is the home-lab receiver, which writes
JSONL files ([server/README.md](server/README.md)). Everything is moving to OpenX, as described below;
see [Status](#status) for what's done.

## Architecture

All telemetry flows into **OpenX** (Fathym's Open Industrial platform), in a workspace of its own,
through IoT Hub. The analysis is the `game-night` fAI [workbench](workbench/README.md), hosted in the
same workspace.

```
Impostor + plugin ───┐
Voice bot (events) ──┤
EmotiBit bridge ─────┼──► IoT Hub ──► ADX table Devices ──► workbench (KQL, MCP tools)
Bands (one each) ────┘       ▲
                             │ device twins: recording on/off, session ID
Voice bot: /gamenight start|stop
Voice bot (audio) ──────────────────► OpenX file storage
```

- **Senders.** Every sender is one OpenX Data Connection, which is one IoT Hub device identity: the
  Impostor plugin, the voice bot, each EmotiBit bridge and each band. Every one of them connects out,
  so nothing at home or in Azure needs to accept connections for telemetry.
- **Storage.** OpenX stores each message as a row in `Devices(DeviceID, EnqueuedTime, MessageID,
  RawData)`, with the message body in `RawData`. `EnqueuedTime` is IoT Hub's arrival time on Azure's
  clock, the same for every sender. It takes over the job the receiver's `rx` stamp did.
- **Recording.** `/gamenight start` and `stop` in Discord start and stop voice capture, as today. They
  also set `recording` and a session ID in each band's and bridge's device twin, so wearables stream
  only during a session.
- **Audio.** Utterance audio goes to the workspace's file storage. Its metadata travels as telemetry.
- **Privacy.** The workspace is the boundary for raw biometrics and voice. OpenX doesn't partition raw
  telemetry within a workspace, so game night gets its own, with only the hosts on its team. Setup is
  in [openx/README.md](openx/README.md).

## Where things run

The OpenX workspace is the same either way. What changes is where Impostor and the voice bot run:

| | Home lab | Azure |
|---|---|---|
| Impostor + plugin, voice bot | Docker on the home server ([server/README.md](server/README.md)) | Azure Container Instances, outside OpenX (OpenX's workbench containers take only HTTP, and Impostor needs UDP) |
| How players reach the game | Tailscale, which exposes nothing on the home network | A public address, with an Impostor plugin that admits only listed player names |
| Matchmaking HTTPS | Nginx Proxy Manager, with a DuckDNS certificate | A Caddy sidecar in the container group |
| Player guide | [PLAYERS.md](PLAYERS.md) | [PLAYERS-AZURE.md](PLAYERS-AZURE.md) |

Bands and EmotiBit bridges connect out to IoT Hub from wherever they are, so neither option changes
them.

## Clocks

Everything joins on time, so every sender stamps its own:
- **Game events and voice.** Game `ts`, utterance `start` and session events come from the clock of
  the host running Impostor and the voice bot. In Azure, that's Azure's host time. At home, the server
  must keep NTP time, and its runbook checks it.
- **Bands.** They stamp every sample on their own crystal clock and keep UTC with NTP
  ([band/FIRMWARE.md](band/FIRMWARE.md#timing)).
- **EmotiBit.** It has no stamps of its own. The bridge stamps arrivals on the wearer's PC, which needs
  Windows time sync on. The Oscilloscope's own lag is still measured with sync taps, for EmotiBit only.
- **The check.** The workbench checks every sender continuously against `EnqueuedTime`. A sender's
  stamps must stay just before IoT Hub's arrival times: the 5th percentile of `EnqueuedTime − stamp`,
  taken over each minute, between about −50 and +150 ms. A clock that drifts or jumps gets flagged,
  with no taps involved.

## Message formats

Every message body is one JSON object that names its sender in `src` (and bands their `band` ID), so
the workbench never depends on IoT Hub device IDs. These shapes are the contract between the senders
and the workbench; changing them is a breaking change.

**Game** (`src:"game"`, from the Impostor plugin): `{src, ts, seq, game, type, data}`.
- These are the receiver's game lines without `rx`. `ts` is stamped on the Impostor host before the
  send queue, so game events join on `ts`.
- `seq` restarts at 1 when Impostor restarts. A gap means an event was lost.
- `type` is one of game.created, lobby.joined, lobby.left, game.started, meeting.called, meeting.vote,
  meeting.ended, player.exiled, player.murdered, chat, game.ended. The `data` shapes are in
  `plugin/GameEventListener.cs`.
- `lobby.joined` identifies the player by connection (`client`, `name`), because it fires before the
  character spawns; in-game events use `id`.
- Roles (`impostor`, `role`) appear only in the game.started and game.ended rosters. Nothing live may
  show them before game.ended.
- `chat` is free text only: Impostor doesn't relay Quick Chat.

**Voice** (`src:"voice"`, from the voice bot):
`{src, type:"utterance", session, user, name, start, duration, file}`, one per utterance, only for the
players in `GAMENIGHT_PLAYERS`.
- `user` is the speaker's Discord ID and `name` their display name at the time. Mapping IDs to players
  is the workbench's job.
- `start` is the bot's stamp of the utterance's first packet, so voice joins on `start`. `duration` is
  in seconds.
- `file` names the Ogg Opus file in the workspace's file storage, `voice/<session>/<start>-<user>.ogg`.
  The audio is uploaded before the message is sent, so a message never points at a missing file.
- The audio is padded with silence wherever it falls behind real time. Audio at offset t reached the
  bot within about 100 ms of `start` + t, more right after a network stall.

**Session** (`src:"session"`, from the voice bot): `{src, type, session, ts, by}`.
- `type` is session.started or session.stopped. `session` is an ID set at start, the start time in
  ISO 8601.
- `by` is the Discord ID that ran the command, or `auto` when the bot stopped because no players were
  left.

**EmotiBit** (`src:"emotibit"`, from the bridge): `{src, device, seq, m:[{address, args, t}]}`.
- One message a second, batching every OSC message the Oscilloscope sent in that second.
- `t` is when the bridge received each one, in ms since the epoch on the wearer's PC.
- `address` and `args` are the raw OSC message, as the receiver writes them today.

**Band** (`src:"band"`): `data`, `clock`, `status` and `event` messages carrying per-sample times. See
[band/FIRMWARE.md](band/FIRMWARE.md#messages).

Sessions recorded before the move are JSONL files from the receiver: one line per message, stamped
with the receiver's `rx`. The workbench keeps reading them; its synthetic fixture is one.

## Layout

| Path | What |
|---|---|
| `plugin/` | C# Impostor plugin. Turns game events into JSON and sends them on. Thin by design. |
| `voice/` | Node Discord bot. Joins a voice channel on `/gamenight start` and captures each listed player's utterances as Ogg Opus. Capture only: no transcription. |
| `receiver/` | Deno process: today's home-lab intake. HTTP for game events and voice, UDP/OSC for EmotiBit, one JSONL per session, stamp-and-append only. Retired once the senders post to IoT Hub; its OSC half becomes the EmotiBit bridge. |
| `server/` | Compose file, plugin build script, and the deploy runbook for the home server |
| `workbench/` | The fAI workbench. Checks what a session captured and lines up what happened when, with each wearer's biometrics, as MCP tools. `.mcp.json` registers it with Claude Code. |
| `band/` | The DIY wrist band: design, firmware contract, and a generated EasyEDA schematic |
| `openx/` | Setting up the game-night workspace in OpenX |
| `PLAYERS.md`, `PLAYERS-AZURE.md` | Setup guides for players: home lab with Tailscale, and Azure. The host sends one with `regionInfo.json`. |

## Status

**Working today:**
- v0 capture through the home-lab receiver ([server/README.md](server/README.md)).
- A first workbench that checks a recording and lines up what happened
  ([workbench/README.md](workbench/README.md)).

**Moving to OpenX:**

| | |
|---|---|
| Done | The band's design, schematic and firmware contract ([band/](band/README.md)); this architecture; the OpenX workspace runbook ([openx/](openx/README.md)); the player guides |
| Next | The plugin, voice bot and an EmotiBit bridge sending to IoT Hub; device-twin start/stop; the Azure deployment (`server/azure`); retiring the receiver |
| Then | The workbench reading ADX instead of JSONL, with band parsing and the continuous clock check |

Until "Next" lands, record sessions with the home-lab receiver.

## Developing

- **Plugin.** `cd plugin && dotnet build -c Release` (.NET 8 SDK) → `plugin/bin/Release/net8.0/GameNight.Relay.dll`.
- **Receiver.** `cd receiver && deno task start` (writes `./data/`, gitignored).
- **Workbench.** `cd workbench && deno task test` (Deno 2.6+; the MCP test runs `fai run`). Claude Code
  starts it from `.mcp.json`.
- **Band schematic.** `cd band/schematic && deno task build` rewrites the EasyEDA file, BOM and
  netlist in `out/`, and fails if the drawing doesn't match `band.ts`.
- **Voice relay.** `cd voice && npm install && npm test` (Node 22.12+).
  - `npm start` needs `DISCORD_TOKEN` and `GAMENIGHT_PLAYERS`, plus
    `GAMENIGHT_VOICE_URL=http://localhost:8420/voice` to post to a local receiver.
  - Use a separate test bot, or stop the server's voice container first: two processes on one token
    both answer `/gamenight`.
- **Pushing a local plugin build to the server** without a git round trip:
  `scp plugin/bin/Release/net8.0/GameNight.Relay.dll YOUR_USERNAME@192.168.x.y:docker/game-night/server/plugins/ && ssh YOUR_USERNAME@192.168.x.y 'cd docker/game-night/server && docker compose restart impostor'`
