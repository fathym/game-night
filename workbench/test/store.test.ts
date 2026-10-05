import { assert, assertEquals, assertRejects, assertStrictEquals } from "@std/assert";
import { join } from "@std/path";
import { SessionStore } from "../src/store/SessionStore.ts";
import { syntheticSession } from "./synthetic.ts";

async function dataDir() {
  const dir = await Deno.makeTempDir({ prefix: "game-night-store-" });
  await Deno.writeTextFile(join(dir, "2026-10-04T19-00-00-000Z.jsonl"), syntheticSession({ endS: 60 }));
  await Deno.utime(join(dir, "2026-10-04T19-00-00-000Z.jsonl"), new Date("2026-10-04T19:01:00Z"), new Date("2026-10-04T19:01:00Z"));
  await Deno.writeTextFile(join(dir, "2026-10-05T20-00-00-000Z.jsonl"), syntheticSession());
  await Deno.mkdir(join(dir, "voice"));
  await Deno.writeTextFile(join(dir, "voice", "a.ogg"), "audio");
  await Deno.writeTextFile(join(dir, "notes.txt"), "not a session");
  return dir;
}

Deno.test("store: lists sessions newest first, with their span read from the file's ends", async () => {
  const store = new SessionStore(await dataDir());
  const list = await store.list();
  assertEquals(list.map((l) => l.name), ["2026-10-05T20-00-00-000Z", "2026-10-04T19-00-00-000Z"]);
  assert(list[0].start && list[0].end && list[0].minutes! > 3.5);
});

Deno.test("store: loads the newest by default, a named one on request, and caches the parse", async () => {
  const store = new SessionStore(await dataDir());
  const latest = await store.load();
  assertEquals(latest.name, "2026-10-05T20-00-00-000Z");
  assertStrictEquals(await store.load("2026-10-05T20-00-00-000Z"), latest);
  assertEquals((await store.load("2026-10-04T19-00-00-000Z.jsonl")).name, "2026-10-04T19-00-00-000Z");
});

Deno.test("store: the empty file a receiver restart leaves is listed last, not loaded by default", async () => {
  const dir = await dataDir();
  await Deno.writeTextFile(join(dir, "2026-10-06T08-00-00-000Z.jsonl"), "");
  const store = new SessionStore(dir);
  assertEquals((await store.list()).at(-1)!.name, "2026-10-06T08-00-00-000Z");
  assertEquals((await store.load()).name, "2026-10-05T20-00-00-000Z");
});

Deno.test("store: only names it listed are accepted", async () => {
  const store = new SessionStore(await dataDir());
  await assertRejects(() => store.load("../../etc/passwd"), Error, "No session named");
  await assertRejects(() => store.load("notes"), Error, "No session named");
});

Deno.test("store: utterance files are checked relative to the data folder", async () => {
  const store = new SessionStore(await dataDir());
  assert(store.fileExists("voice/a.ogg"));
  assert(!store.fileExists("voice/missing.ogg"));
});

Deno.test("store: a missing data folder says what to set", async () => {
  const store = new SessionStore(join(Deno.cwd(), "no-such-folder-here"));
  await assertRejects(() => store.list(), Error, "GAMENIGHT_DATA");
});
