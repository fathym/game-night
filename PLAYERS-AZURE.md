# Joining game night (Azure server)

One-time setup for players, on a Windows PC. It takes about five minutes.

This guide is for game nights whose server runs in Azure. If your host runs it from home, use
[PLAYERS.md](PLAYERS.md) instead: that one needs Tailscale.

You'll need:

- Among Us on PC from **Steam** or **Epic Games**, updated to the latest version. Have the Microsoft
  Store or Xbox app version? Tell your host before game night: the file in step 1 goes somewhere else
  for that version.
- Discord, for voice.
- From your host:
  - a file called **`regionInfo.json`**
  - the game-night **web address** (it starts with `https://`)
- **The in-game name you'll play under.** Give it to your host before game night: the server only
  lets in names on its list. Keep it to 10 characters or fewer, using plain letters and numbers.

## 1. Add the game-night server to Among Us

1. Close Among Us.
2. Press **Win + R**, paste `%USERPROFILE%\AppData\LocalLow\Innersloth\Among Us` and press **Enter**.
   A folder opens.
3. Copy the `regionInfo.json` from your host into that folder. If Windows asks, choose **Replace the
   file in the destination**.

## 2. Check that it works

1. Open the web address from your host in your browser. You should see a single line: *Impostor is
   running, please configure your Among Us to connect to a game*. That means your PC can reach the
   server.
2. Start Among Us → **Online**. Click the region button (the globe, bottom right) and pick the
   game-night region; your host will tell you its name (for example **Game Night**).

## 3. On game night

1. Join the game-night voice channel in Discord. Wear headphones, so other people's voices don't end
   up in your mic.
2. Start Among Us → **Online** → the game-night region → type the lobby code your host shares → join.
3. Use exactly the in-game name you gave your host.

**About recording:** everyone agreed to have game night recorded.
- **Voice.** A bot called **GameNight Recorder** joins the voice channel and posts "🔴 Recording
  game-night players…" when it starts. It records only the players who agreed, and anyone can type
  `/gamenight stop` in Discord to stop it. Your host deletes the audio once it has been transcribed.
- **Game.** The game server also logs each round: meetings, votes, kills and in-game chat.
- **Bands.** If you wear one, it records skin conductance, pulse, skin temperature and how much your
  wrist moves. It does this only while game night is recording, and never while it's charging.
- **Where it goes.** Everything is kept in your host's own private storage.

## 4. If your host gave you a band

The band is a wrist sensor for the lie-detector part of game night. It sends its readings over your
home Wi-Fi.

**Set it up on your Wi-Fi (once):**
1. Switch the band on with the small switch on its side. The light on the band blinks fast: it can't
   find a network yet.
2. On your phone or PC, join the Wi-Fi network **GameNight-B…** (the band's ID; the password is
   printed on the band). A setup page opens. If it doesn't, open a browser and go to
   `http://192.168.4.1`.
3. Pick your home Wi-Fi and enter its password. It must be a **2.4 GHz** network: if your router shows
   two names, pick the one without "5G".
4. The light changes to a single blink every few seconds: the band is connected and waiting for game
   night.

**The day before:** charge it. Take it off, switch it **on**, and plug it into a USB charger. It only
charges while switched on. The red light inside shows it's charging.

**Putting it on**, at least 15 minutes before the first round:
1. Rinse your wrist and fingers with plain water: no hand sanitizer or lotion.
2. Strap the band on the back of the wrist you **don't** use for the mouse, just above the wrist bone,
   with the USB end toward your elbow. Snug, so it can't slide.
3. Stick two fresh finger electrodes on the palm side of the middle segments of your index and middle
   fingers, on the same hand. Clip on the lead's snaps marked **tip** and **ring** (leave any third
   snap unused). Plug the lead into the band, and clip the cable to the strap.
4. Play with Among Us's default mouse-only controls, so the band hand stays still.

**During meetings**, rest that forearm on an armrest or your lap rather than pressing the band on the
desk edge.

| The band's light | Meaning |
|---|---|
| Fast blink | Not connected to Wi-Fi; the setup network is open |
| One blink every few seconds | Connected, not recording |
| Two blinks every few seconds | Recording |
| Three blinks every few seconds | Battery low: charge it after the game |
| Off | Switched off, or asleep between game nights |

Keep the band and strap for yourself. If a band passes to someone else, wipe its back with 70% rubbing
alcohol first.

## If something goes wrong

| What you see | What it means | What to do |
|---|---|---|
| *This server is for game night: ask your host to add your name.* | Your in-game name isn't on the host's list | Use the exact name you gave your host, or send them the one you're using |
| *Your client is too new, please update your Impostor server to play.* | The host's server hasn't caught up with your Among Us version | Tell your host |
| *Please update your game to play on this server.* | Your Among Us is out of date | Update Among Us and try again |
| *Please update your game to play in this lobby.* or *Your game version is too new for this lobby.* | You and the host are on different versions | Everyone updates to the latest version |
| *Your client version is unsupported, please update your Game and/or Impostor server.* | The server doesn't know your Among Us version | Tell your host |
| *Your username is too long, please make it shorter.* | Your name is over 10 characters | Shorten it, and tell your host the new one |
| The game-night region isn't in the list | The file isn't in the right folder, or Among Us was open when you copied it | Redo step 1 with Among Us closed |
| The web address won't load | The server isn't running yet, or the address is mistyped | Check the address, then ask your host whether the server is up |
