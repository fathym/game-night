/**
 * game-night receiver — v0 intake. Seed of the `game-night` fAI workbench; stays stamp-and-append only.
 * Scoring, joins and state belong to the workbench (fai locally, OpenX hosted), not here.
 *
 * Three inputs, one file:
 *   POST /events            JSON envelopes from the Impostor relay plugin
 *   POST /voice             one Ogg Opus utterance from the Discord voice relay
 *   UDP  :8421              OSC from EmotiBit Oscilloscope
 *
 * Every line gets `rx` (arrival time here) and `src`. Game lines also carry the plugin's `ts`, stamped
 * in Impostor's handler before its send queue — same host, same clock, tighter — so scoring joins game
 * events on `ts`. Voice lines carry the relay's `start` (first packet's arrival, same host clock) and
 * arrive only after the utterance ends, so they join on `start`. EmotiBit lines have no stamp of their
 * own (bundle timetags are skipped), so `rx` is their clock. One JSONL file per receiver start, under
 * GAMENIGHT_DATA; utterance audio goes beside it in voice/.
 */
import { parseOsc } from "./osc.ts";

const HTTP_PORT = 8420;
const OSC_PORT = 8421;
const DATA_DIR = Deno.env.get("GAMENIGHT_DATA") ?? "./data";

await Deno.mkdir(`${DATA_DIR}/voice`, { recursive: true });
const sessionPath = `${DATA_DIR}/${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`;
const session = await Deno.open(sessionPath, { write: true, create: true, append: true });
const encoder = new TextEncoder();

// Writes are chained so lines land in arrival order even though both inputs are async.
let pending: Promise<void> = Promise.resolve();

function record(src: "game" | "voice" | "emotibit", body: Record<string, unknown>) {
  const bytes = encoder.encode(JSON.stringify({ ...body, rx: new Date().toISOString(), src }) + "\n");
  pending = pending.then(async () => {
    let written = 0;
    while (written < bytes.length) written += await session.write(bytes.subarray(written));
  });
}

// --- game events and voice -----------------------------------------------------------------

Deno.serve({ port: HTTP_PORT, hostname: "0.0.0.0" }, async (req) => {
  const { pathname, searchParams } = new URL(req.url);

  if (req.method === "POST" && pathname === "/events") {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response("expected a JSON body", { status: 400 });
    }
    record("game", body);
    console.log(`game  ${body.type} ${body.type === "game.started" ? "(roster hidden until game end)" : JSON.stringify(body.data ?? "").slice(0, 160)}`);
    return new Response(null, { status: 204 });
  }

  // The body is the audio; who spoke and when ride in the query string.
  if (req.method === "POST" && pathname === "/voice") {
    const user = searchParams.get("user") ?? "";
    const startMs = Date.parse(searchParams.get("start") ?? "");
    if (!/^\d+$/.test(user) || Number.isNaN(startMs)) {
      return new Response("expected ?user=<discord id>&start=<iso time>", { status: 400 });
    }
    const start = new Date(startMs).toISOString();
    const name = searchParams.get("name") ?? "";
    const duration = Number(searchParams.get("duration"));
    const file = `voice/${start.replace(/[:.]/g, "-")}-${user}.ogg`;
    await Deno.writeFile(`${DATA_DIR}/${file}`, new Uint8Array(await req.arrayBuffer()));
    record("voice", { type: "utterance", user, name, start, duration, file });
    console.log(`voice ${name || user} ${duration.toFixed(1)}s`);
    return new Response(null, { status: 204 });
  }

  if (pathname === "/health") return new Response("ok");
  return new Response("not found", { status: 404 });
});

// --- EmotiBit via OSC ----------------------------------------------------------------------

const osc = Deno.listenDatagram({ port: OSC_PORT, hostname: "0.0.0.0", transport: "udp" });
console.log(`osc   listening on udp/${OSC_PORT}`);
console.log(`file  ${sessionPath}`);

// EmotiBit streams tens of samples a second, so the console shows rates, not samples.
const rates = new Map<string, number>();
setInterval(() => {
  if (rates.size === 0) return;
  const parts = [...rates].map(([addr, n]) => `${addr}=${(n / 5).toFixed(1)}/s`);
  console.log(`emoti ${parts.join("  ")}`);
  rates.clear();
}, 5000);

for await (const [packet] of osc) {
  let messages;
  try {
    messages = parseOsc(packet);
  } catch (err) {
    console.warn(`osc   undecodable packet (${packet.length} bytes): ${err}`);
    continue;
  }
  for (const m of messages) {
    record("emotibit", { address: m.address, args: m.args });
    rates.set(m.address, (rates.get(m.address) ?? 0) + 1);
  }
}
