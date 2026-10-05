# Deploying to the home server

Assumes a Linux home server (tested on Ubuntu 24.04) with Docker, a reverse proxy that can get Let's
Encrypt certificates by DNS challenge (these steps use Nginx Proxy Manager), and a LAN DNS server you
can add records to (these steps use Pi-hole). The examples write the server's LAN address as
`192.168.x.y`; substitute yours. The stack lives in `~/docker/game-night/`.

Players join from their own homes, over Tailscale (Step 0). Nothing is port-forwarded and nothing
here is reachable from the internet.

Among Us (16.0.5+) refuses custom regions unless matchmaking is HTTPS with a trusted certificate.
Let's Encrypt only issues for public names, so the hostname is a free DuckDNS subdomain that resolves
to the server's Tailscale address.

Ports this adds:

| Port | Proto | Who talks to it |
|---|---|---|
| 22023 | UDP | Every player's Among Us → Impostor (game traffic), over Tailscale |
| 22023 | TCP | NPM → Impostor (matchmaking), bound to the server's LAN address only (`SERVER_LAN_IP`) |
| 8420 | TCP | Impostor plugin → receiver over the compose network; published on loopback only (`curl localhost:8420/health` on the server) |
| 8421 | UDP | EmotiBit Oscilloscope on the gaming PC → receiver, over the LAN |

Over Tailscale, players reach only 443 (NPM, for matchmaking) and 22023/udp; Step 0's access policy
blocks the rest of the server. The Discord voice relay adds no ports: it only connects out, to Discord
and to the receiver.

---

## Step 0: Tailscale — how players reach the server

Rather than forwarding ports, the server joins a Tailscale network and is shared with each player, and
an access policy lets them reach only matchmaking and game traffic. Impostor hands every client the
same address for game traffic, so every player, you included, connects to the server's Tailscale
address.

Already set up for LAN-only play? Do this step, then point DuckDNS (Step 1) and the Pi-hole record
(Step 2) at the Tailscale address and set `IMPOSTOR_PUBLIC_IP` and `SERVER_LAN_IP` in `.env` (Step 3).
Nothing else changes.

1. On the server:

   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   sudo tailscale up --accept-dns=false   # sign in at the URL it prints
   tailscale ip -4                        # → 100.x.y.z, the server's Tailscale address
   ```

   `--accept-dns=false` stops Tailscale from touching the server's DNS. If `/etc/resolv.conf` is
   hand-written (for example, pointing at a local Pi-hole) and no DNS manager is installed, Tailscale
   would otherwise rewrite it.
2. Tailscale admin console → Machines → the server → … → Disable key expiry, or it drops off the
   tailnet after 180 days.
3. Access controls, **before sharing anything.** A new tailnet allows all traffic, people you share
   with are limited only by this policy, and a home server usually has other services listening on
   every interface (file shares, dashboards, media servers). In the `grants` list, replace the default allow-all rule
   `{"src": ["*"], "dst": ["*"], "ip": ["*"]}` with these two, using the address from step 1:

   ```json
   // Your own devices: everything, as before.
   { "src": ["autogroup:member"], "dst": ["*"], "ip": ["*"] },
   // People you share the server with: matchmaking and game traffic, nothing else.
   { "src": ["autogroup:shared"], "dst": ["100.x.y.z"], "ip": ["tcp:443", "udp:22023"] },
   ```

   Leave the rest of the file (such as `ssh`) alone. If it also has an `acls` section allowing
   everything, delete that too, or it keeps letting shared users in. The editor checks the file on save.
4. Your gaming PC: install Tailscale for Windows and sign in with the same account. Keep it running
   whenever you play; Tailscale finds the direct LAN route, so it adds no lag.

No firewall rule is needed for Tailscale. If you use UFW, don't add `ufw allow in on tailscale0`: the
access policy is the gate. Anything you already expose through your router's port forwarding keeps
working, because Tailscale doesn't change the server's routes.

## Step 1: DuckDNS subdomain → Tailscale address

1. duckdns.org → create a subdomain, e.g. `gamenight-xxxx` (pick something unguessable).
2. Set its IP to the server's Tailscale address from Step 0 and copy the token — it is pasted into NPM once in Step 4 and nothing else needs it.

## Step 2: Pi-hole local record (belt and braces)

Pi-hole → Local DNS → DNS Records → add `gamenight-xxxx.duckdns.org` → the server's Tailscale address.
LAN resolution then never depends on DuckDNS or trips DNS-rebind protection.

```powershell
# From Windows, asking your LAN DNS server directly (its address, not the answer):
nslookup gamenight-xxxx.duckdns.org <pi-hole address>   # → 100.x.y.z
```

## Step 3: Clone, build the plugin, start the stack

```bash
git clone https://github.com/ttrichar/game-night.git ~/docker/game-night
cd ~/docker/game-night/server
cp .env.example .env && chmod 600 .env             # this stack's settings; .env is gitignored
nano .env                                           # SERVER_LAN_IP=192.168.x.y, IMPOSTOR_PUBLIC_IP=<Step 0's address>; the rest is Step 7
chmod +x build-plugin.sh && ./build-plugin.sh      # → plugins/GameNight.Relay.dll
docker compose up -d --build impostor receiver      # voice comes up in Step 7, once it has a token
docker compose logs impostor | grep -i gamenight    # → "GameNight Relay enabled, posting to http://receiver:8420/events"
curl -s localhost:8420/health                        # → ok   (receiver built, session file open, HTTP bound)
```

An empty `gamenight` grep usually means Impostor is still starting — wait a few seconds and rerun it,
or watch `docker compose logs -f impostor`. If every compose command fails with "required variable
SERVER_LAN_IP (or IMPOSTOR_PUBLIC_IP) is missing a value", `.env` is missing or that line is still empty.

If you use UFW, these rules record the intent (Docker-published ports bypass UFW, so they don't gate
anything):

```bash
sudo ufw allow 22023/udp
sudo ufw allow 8421/udp
```

## Step 4: NPM — certificate via DNS challenge, then the proxy host

**Certificate:** SSL Certificates → Add SSL Certificate → Let's Encrypt
- Domain: `gamenight-xxxx.duckdns.org`
- Use a DNS Challenge → provider DuckDNS → Credentials File Content:
  ```
  dns_duckdns_token=your-duckdns-token
  ```
- Propagation Seconds: blank; set `60` only if the first try fails with "TXT record not found"
- Agree to the ToS → Save. First run takes a couple of minutes (NPM installs the plugin, publishes
  `_acme-challenge` TXT via DuckDNS, Let's Encrypt validates over public DNS). No inbound ports involved.

Do **not** add this subdomain to your router's dynamic DNS client — it would replace the Tailscale
address with your public IP. Set the IP once on duckdns.org and leave it.

**Proxy host:** Hosts → Proxy Hosts → Add
- Domain: `gamenight-xxxx.duckdns.org`
- Scheme `http`, Forward Hostname: the server's LAN address (`SERVER_LAN_IP`), Forward Port `22023`
- SSL tab: select the certificate, Force SSL on (browser convenience only; the game client goes straight to https:443)

**Gate:** `https://gamenight-xxxx.duckdns.org` in a browser on your PC (on the tailnet since Step 0) shows a valid padlock and the plain-text line
"Impostor is running, please configure your Among Us to connect to a game". A **504 Gateway Time-out**
from NPM means nothing is listening on 22023/tcp — the impostor container is down (a default-deny
firewall drops rather than refuses, so NPM waits and times out); check `docker compose ps` and `docker compose logs impostor`.
Any other body means the proxy host is forwarding to the wrong host or port.

## Step 5: Client region file

1. https://impostor.github.io/Impostor/ → server address `gamenight-xxxx.duckdns.org`, port `443`, HTTPS on, name `Game Night` (players pick the region by this name) → download `regionInfo.json`.
2. Close Among Us. Win+R → paste `%USERPROFILE%\AppData\LocalLow\Innersloth\Among Us` → Enter, and drop the downloaded `regionInfo.json` there, replacing the existing one.
3. Start Among Us → Online → region selector → pick the new region → Create Game.

Consoles can't use custom servers.

**Gate:** lobby created. Then:

```bash
cd ~/docker/game-night/server
docker compose logs -f receiver
# game  lobby.joined {"player":{"client":1,"name":"..."}}
```

`chat` lines appear only for Free Chat (Among Us → Settings → Data → Chat Type; needs a logged-in
adult account). Quick Chat, the default for guest and non-adult accounts, is never relayed by
Impostor. Scoring uses `meeting.vote`, not chat, so this is optional.

**Players (once each):** every player sets up their own PC by following [PLAYERS.md](../PLAYERS.md).
For each player:

1. Tailscale admin console → Machines → the server → … → Share → create an invite link (one per
   player).
2. Send them the invite link, the `regionInfo.json` from item 1 (the same file for everyone), the
   address `https://gamenight-xxxx.duckdns.org`, and a link to
   [PLAYERS.md](https://github.com/ttrichar/game-night/blob/main/PLAYERS.md). Send `regionInfo.json`
   rather than the setup page's share link: on a PC that link falls
   back to http/22023, which Among Us refuses.
3. Once one player is set up, have them run `Test-NetConnection 100.x.y.z -Port 445` in PowerShell
   (with the server's Tailscale address). `TcpTestSucceeded : False` proves Step 0's policy blocks the
   rest of the server. Your own devices can't show this, because the policy gives them full access.
4. If a player's browser can't find the address, give them this line for their hosts file (PLAYERS.md
   shows how to add it): `100.x.y.z gamenight-xxxx.duckdns.org`.

Everyone needs the same Among Us version, and one the Impostor image supports.

A game needs 4 players to start; lobby events above need only one.

## Step 6: EmotiBit → receiver

On the gaming PC, in EmotiBit Oscilloscope:

1. Output List → enable OSC.
2. Edit `oscOutputSettings.xml` — on Windows it is typically under `C:\Program Files\EmotiBit\EmotiBit Oscilloscope\data\`, so open the editor as administrator: `ipAddress` → the server's LAN address, `port` → `8421`.
   Patch at least `EA` (EDA), `HR`, `BI` (inter-beat interval), and the SCR metrics `SA`, `SR`, `SF`.
3. Restart the Oscilloscope with the EmotiBit connected.

**Gate:** the receiver log prints rates every 5 s:

```
emoti /EmotiBit/0/EDA=15.0/s  /EmotiBit/0/HR=1.0/s ...
```

Rate lines print only when packets land, so a log that stops after `osc listening on udp/8421` means
nothing is arriving from the Oscilloscope, not a receiver fault.

## Step 7: Discord voice relay

A bot that joins the game-night voice channel when asked and posts each player's utterances to the
receiver as audio. It records only the people listed in `GAMENIGHT_PLAYERS`, the ones who agreed:
anyone else in the channel is never subscribed to, so their audio is never decrypted or saved. Only a
listed player can start a recording, anyone can stop one, and the bot leaves on its own when no
players are left or if someone moves it.

**Discord permissions:**

- Creating the bot needs only a Discord account.
- Adding it to a Discord server needs the **Manage Server** permission on that server. You don't have
  to own the server, and Administrator includes Manage Server.
- The bot itself is granted View Channels, Send Messages and Connect, and needs no privileged gateway
  intents. If a channel restricts access, its role needs View Channel and Connect on the game-night
  voice channel, and View Channel and Send Messages on the text channel `/gamenight` is run from.

**Create the bot:**

1. https://discord.com/developers/applications → New Application → name it `GameNight Recorder`.
2. Bot → Reset Token → copy it (it's shown once). Leave every Privileged Gateway Intent off.
3. Make it private, so only its owner can add it to servers: Installation → Install Link → None →
   Save (the portal refuses to make a bot private while it has an install link), then Bot → Public
   Bot off → Save.

**Add it to the Discord server:** OAuth2 → URL Generator: scope `bot` (it includes
`applications.commands`); bot permissions View Channels, Send Messages, Connect. Open the generated
URL, pick the server and authorize. If the server isn't in the list, your account lacks Manage Server
there.

**Collect the players' ids:** Discord → User Settings → Advanced → Developer Mode on; then right-click
each player who agreed to be recorded (yourself too, if you're playing) → Copy User ID.

**Give the server the token and the players**, in the `.env` from Step 3:

```bash
cd ~/docker/game-night/server
nano .env                      # DISCORD_TOKEN=<the token>
                               # GAMENIGHT_PLAYERS=<id>,<id>,…   (comma-separated)
docker compose up -d --build voice
docker compose logs voice      # → "ready as GameNight Recorder#… in 1 server(s); N player(s) may be recorded"
```

**Gate:** as one of the listed players, join the game-night voice channel, run `/gamenight start` in
a text channel, and say a sentence. The bot joins and posts "🔴 Recording game-night players in …";
about a second after you stop talking:

```bash
docker compose logs -f receiver
# voice <your display name> 2.4s
ls data/voice/                 # one .ogg per utterance; copy one to your PC and play it
```

Then leave the voice channel: the bot leaves too and posts "Stopped recording: no game-night players
are left." No post means it can't see or write in that text channel (see the permissions above). If
`/gamenight` doesn't show up at all, reload Discord (Ctrl+R) and check `docker compose logs voice` for
"couldn't add /gamenight".

## Step 8: First recorded session

Right before Create Game, `docker compose restart receiver`. The receiver opens one file per start, so
this keeps the Step 5–7 test traffic out of the milestone file; do it before anyone joins, since posts
made while it is down are dropped (the plugin logs a warning and does not retry). Then, once everyone
is in the voice channel, `/gamenight start`; when the night is over, `/gamenight stop`.

Receiver running, EmotiBit streaming, voice recording, four players in the lobby. Before starting, the
EmotiBit wearer does three sync taps, a few seconds apart: tap the EmotiBit sharply while pressing Enter
on a chat message and saying "now". They let the workbench measure how far each stream lags the game
clock. Then play one game. The
file under `server/data/` is the v0 milestone — everything after (transcription, scoring, MCP tools) is
built in the fAI workbench against it as a replayable fixture. Nothing after v0 lives on this server;
night 2 is a `GAMENIGHT_URL` / `GAMENIGHT_VOICE_URL` change, not new services here.

```bash
# From the dev machine — pull sessions as workbench fixtures (server/data/ is gitignored there too):
scp YOUR_USERNAME@192.168.x.y:docker/game-night/server/data/*.jsonl server/data/
scp -r YOUR_USERNAME@192.168.x.y:docker/game-night/server/data/voice server/data/
```

Then check what was recorded with the workbench's `gamenight-check` ([workbench/README.md](../workbench/README.md)).

---

## Day-to-day

```bash
cd ~/docker/game-night/server
docker compose logs -f receiver          # watch events arrive
docker compose logs -f voice             # the voice relay's own log (start/stop, warnings)
docker compose restart impostor          # after replacing plugins/GameNight.Relay.dll
git pull && ./build-plugin.sh && docker compose up -d --build && docker compose restart impostor   # update everything
ls -la data/                             # recorded sessions
```

Tailscale has to be running on every player's PC, yours included, whenever you play.

The receiver writes whatever arrives, so close the EmotiBit Oscilloscope when a session is over — left
streaming, it adds roughly 60–70 MB an hour (about 1.5 GB a day) to `data/`. Restart the receiver before
each night, too: it starts a new file only when it starts, and the workbench reads a whole file at once.

Voice is recorded only between `/gamenight start` and `/gamenight stop` (or until no players are left),
and only for the listed players. Utterance audio lives in `data/voice/` here and wherever Step 8 copied
it; once a session has been transcribed, delete its audio in both places, as agreed with the group.

If Among Us updates and clients stop connecting, check https://github.com/Impostor/Impostor/releases.
For now `compose.yml` builds Impostor from its `feature/v19` branch, because no release supports Among
Us 19 yet; once one does, replace the `build:` line with that release's image. Nothing in this stack
updates itself.
