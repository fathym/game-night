# Joining game night

One-time setup for players, on a Windows PC. It takes about ten minutes.

You'll need:

- Among Us on PC from **Steam** or **Epic Games**, updated to the latest version. Have the Microsoft
  Store or Xbox app version? Tell your host before game night: the file in step 2 goes somewhere else
  for that version.
- Discord, for voice.
- From your host: a **Tailscale invite link**, a file called **`regionInfo.json`**, and the game-night
  **web address** (it looks like `https://gamenight-xxxx.duckdns.org`).

## 1. Install Tailscale and accept the invite

Tailscale is a free app that connects your PC privately to the host's game server. It gives you
access to the game and nothing else on the host's network, and it doesn't change your normal internet.

1. Download Tailscale for Windows from https://tailscale.com/download/windows and install it.
2. When it opens your browser, sign in with a Google, Microsoft, Apple or GitHub account. That creates
   your free Tailscale account.
3. Open the invite link from your host and accept the invite.
4. Find the Tailscale icon by the clock (click the **^** arrow if it's hidden). It should say
   **Connected**.

## 2. Add the game-night server to Among Us

1. Close Among Us.
2. Press **Win + R**, paste `%USERPROFILE%\AppData\LocalLow\Innersloth\Among Us` and press **Enter**.
   A folder opens.
3. Copy the `regionInfo.json` from your host into that folder. If Windows asks, choose **Replace the
   file in the destination**.

## 3. Check that it works

1. With Tailscale connected, open the web address from your host in your browser. You should see a
   single line: *Impostor is running, please configure your Among Us to connect to a game*. That
   means your PC can reach the server.
2. Start Among Us → **Online**. Click the region button (the globe, bottom right) and pick the
   game-night region; your host will tell you its name (for example **Game Night**).

If the page doesn't load, check that Tailscale says **Connected** and that you accepted the invite.
Still nothing? See [If the web address won't load](#if-the-web-address-wont-load).

## 4. On game night

1. Make sure Tailscale says **Connected**. It usually starts with Windows.
2. Join the game-night voice channel in Discord. Wear headphones, so other people's voices don't end
   up in your mic.
3. Start Among Us → **Online** → the game-night region → type the lobby code your host shares → join.
4. Keep your in-game name to 10 characters or fewer.

**About recording:** everyone agreed to have game night recorded. A bot called **GameNight Recorder**
joins the voice channel and posts "🔴 Recording game-night players…" when it starts. It records only
the players who agreed, and anyone can type `/gamenight stop` in Discord to stop it. The host's server
also logs each round: meetings, votes, kills and in-game chat.

After game night you can leave Tailscale running or quit it (right-click its icon → **Exit**).

## If something goes wrong

| What you see | What it means | What to do |
|---|---|---|
| *Your client is too new, please update your Impostor server to play.* | The host's server hasn't caught up with your Among Us version | Tell your host |
| *Please update your game to play on this server.* | Your Among Us is out of date | Update Among Us and try again |
| *Please update your game to play in this lobby.* or *Your game version is too new for this lobby.* | You and the host are on different versions | Everyone updates to the latest version |
| *Your client version is unsupported, please update your Game and/or Impostor server.* | The server doesn't know your Among Us version | Tell your host |
| *Your username is too long, please make it shorter.* | Your name is over 10 characters | Shorten it |
| *Your username contains illegal characters, please remove them.* | Your name has characters the server rejects | Use plain letters and numbers |
| The game-night region isn't in the list | The file isn't in the right folder, or Among Us was open when you copied it | Redo step 2 with Among Us closed |
| Joining hangs, or drops you right away | Tailscale isn't connected | Check that Tailscale says **Connected** |

### If the web address won't load

If Tailscale is connected and the invite is accepted but the page still won't load, ask your host for
one line to add to your PC's hosts file, then:

1. Start → type **Notepad** → right-click it → **Run as administrator**.
2. File → Open → paste `C:\Windows\System32\drivers\etc\hosts`, set the file type to **All Files**,
   and open it.
3. Add your host's line at the end, save, and close Notepad.
