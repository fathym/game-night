/**
 * game-night voice relay. Joins a Discord voice channel on /gamenight start and posts each
 * game-night player's utterances to GAMENIGHT_VOICE_URL as Ogg Opus, stamped on this machine's clock.
 *
 * Capture only, like the Impostor plugin: no transcription, no game state, nothing decided here.
 * The workbench transcribes and lines words up with meetings and biometrics. GAMENIGHT_VOICE_URL
 * is the only seam: the receiver now, the hosted workbench later.
 */
import { Client, Events, GatewayIntentBits, MessageFlags, SlashCommandBuilder } from "discord.js";
import {
  EndBehaviorType,
  entersState,
  getVoiceConnection,
  getVoiceConnections,
  joinVoiceChannel,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import { encodeOggOpus } from "./ogg.js";
import { Utterance } from "./utterance.js";

const VOICE_URL = process.env.GAMENIGHT_VOICE_URL ?? "http://receiver:8420/voice";
const UTTERANCE_ENDS_AFTER_MS = 1000; // this much silence closes an utterance

// Discord ids of the people who agreed to be recorded. Only they can start a recording, and only their
// audio is subscribed to, so nobody else's is ever decrypted or posted. Unset means nobody: fails closed.
const PLAYERS = new Set((process.env.GAMENIGHT_PLAYERS ?? "").split(",").map((id) => id.trim()).filter(Boolean));

const command = new SlashCommandBuilder()
  .setName("gamenight")
  .setDescription("Record this voice channel for game night")
  .addSubcommand((s) => s.setName("start").setDescription("Join your voice channel and start recording"))
  .addSubcommand((s) => s.setName("stop").setDescription("Stop recording and leave"));

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
const statusChannels = new Map(); // guild id → the text channel /gamenight start ran in
const uploads = new Set(); // in-flight posts, awaited on shutdown

async function register(guild) {
  try {
    await guild.commands.set([command]);
  } catch (err) {
    console.error(`couldn't add /gamenight to ${guild.name}: ${err.message}`);
  }
}

client.once(Events.ClientReady, async (c) => {
  await Promise.all(c.guilds.cache.map(register));
  console.log(`ready as ${c.user.tag} in ${c.guilds.cache.size} server(s); ${PLAYERS.size} player(s) may be recorded`);
  if (PLAYERS.size === 0) console.warn("GAMENIGHT_PLAYERS is empty: nobody can start a recording");
});
client.on(Events.GuildCreate, register);

client.on(Events.InteractionCreate, (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "gamenight" || !interaction.guild) return;
  handle(interaction).catch((err) => console.error(`/gamenight failed: ${err.message}`));
});

async function handle(interaction) {
  const { guild } = interaction;

  if (interaction.options.getSubcommand() === "stop") {
    await interaction.reply(stop(guild.id) ? "Stopped recording." : { content: "Not recording.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (!PLAYERS.has(interaction.user.id)) {
    await interaction.reply({ content: "Only game-night players can start a recording.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (getVoiceConnection(guild.id)) {
    await interaction.reply({ content: "Already recording.", flags: MessageFlags.Ephemeral });
    return;
  }
  const { channel } = (await guild.members.fetch(interaction.user.id)).voice;
  if (!channel) {
    await interaction.reply({ content: "Join a voice channel first, then run this again.", flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply(); // joining can take longer than Discord's 3 s reply window
  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: false, // a deafened bot receives no audio
    selfMute: true,
  });
  // Without a listener, a failed voice reconnect is an unhandled 'error' event and kills the process.
  // With one, the library's own resume/rejoin (and reconnectOrLeave) carry on.
  connection.on("error", (err) => console.warn(`voice connection error: ${err.message}`));
  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
  } catch {
    if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
    await interaction.editReply("Couldn't connect to the voice channel.");
    return;
  }

  statusChannels.set(guild.id, interaction.channel);
  connection.once(VoiceConnectionStatus.Destroyed, () => statusChannels.delete(guild.id));
  connection.on(VoiceConnectionStatus.Disconnected, () => reconnectOrLeave(connection));
  listen(connection, guild);
  console.log(`recording ${channel.name} in ${guild.name}`);
  await interaction.editReply(
    `🔴 Recording game-night players in ${channel}. Anyone can \`/gamenight stop\`, and I leave on my own when no players are left.`,
  );
}

function listen(connection, guild) {
  const { receiver } = connection;
  receiver.speaking.on("start", (userId) => {
    if (receiver.subscriptions.has(userId) || !PLAYERS.has(userId)) return;
    const utterance = new Utterance();
    receiver
      .subscribe(userId, { end: { behavior: EndBehaviorType.AfterSilence, duration: UTTERANCE_ENDS_AFTER_MS } })
      .on("data", (packet) => utterance.add(packet, Date.now()))
      .on("error", (err) => console.warn(`voice stream for ${userId} failed: ${err.message}`))
      // "close", not "end": a stream torn down with its connection closes without ending.
      .once("close", () => {
        if (!utterance.voiced) return;
        const upload = post(guild, userId, utterance).finally(() => uploads.delete(upload));
        uploads.add(upload);
      });
  });
}

async function post(guild, userId, utterance) {
  const member = guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null));
  const query = new URLSearchParams({
    user: userId,
    name: member?.displayName ?? "",
    start: new Date(utterance.startMs).toISOString(),
    duration: utterance.durationSeconds.toFixed(3),
  });
  try {
    const res = await fetch(`${VOICE_URL}?${query}`, {
      method: "POST",
      headers: { "content-type": "audio/ogg" },
      body: encodeOggOpus(utterance.packets),
    });
    if (!res.ok) console.warn(`receiver returned ${res.status} for an utterance from ${userId}: ${await res.text()}`);
  } catch (err) {
    console.warn(`couldn't post an utterance from ${userId} to ${VOICE_URL}: ${err.message}`);
  }
}

function stop(guildId) {
  const connection = getVoiceConnection(guildId);
  if (!connection) return false;
  connection.destroy(); // also closes every open utterance, which then posts
  console.log(`stopped recording in ${client.guilds.cache.get(guildId)?.name ?? guildId}`);
  return true;
}

// A recoverable disconnect moves back to Signalling or Connecting within seconds; anything else
// (kicked, channel deleted) is final.
async function reconnectOrLeave(connection) {
  try {
    await Promise.race([
      entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
      entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
    ]);
  } catch {
    if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
  }
}

// Consent covers game night in the channel it started in, not wherever the bot ends up afterwards.
client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  const connection = getVoiceConnection(oldState.guild.id);
  // Someone dragged the bot elsewhere or disconnected it; joinConfig.channelId has already followed a drag.
  const moved = newState.id === client.user.id && oldState.channelId && newState.channelId !== oldState.channelId;
  if (!connection || (!moved && oldState.channelId !== connection.joinConfig.channelId)) return;
  if (!moved && oldState.channel?.members.some((m) => PLAYERS.has(m.id))) return;
  const status = statusChannels.get(oldState.guild.id);
  stop(oldState.guild.id);
  status
    ?.send(moved ? "Stopped recording: I was moved out of the voice channel." : "Stopped recording: no game-night players are left.")
    .catch(() => {});
});

async function shutdown() {
  for (const connection of getVoiceConnections().values()) connection.destroy();
  await new Promise((resolve) => setImmediate(resolve)); // let the closed streams queue their posts
  await Promise.allSettled(uploads);
  await client.destroy();
  process.exit(0);
}
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);

if (!process.env.DISCORD_TOKEN) {
  console.error("DISCORD_TOKEN is not set (see server/README.md, Discord voice relay)");
  process.exit(1);
}
await client.login(process.env.DISCORD_TOKEN);
