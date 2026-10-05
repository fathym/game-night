/** Writes the synthetic demo session the workbench serves when GAMENIGHT_DATA isn't set (`deno task fixture`). */
import { fromFileUrl } from "@std/path";
import { syntheticSession } from "./synthetic.ts";

export const FIXTURE = new URL("../fixtures/synthetic-demo.jsonl", import.meta.url);

if (import.meta.main) {
  await Deno.mkdir(new URL(".", FIXTURE), { recursive: true });
  await Deno.writeTextFile(FIXTURE, syntheticSession());
  console.log(`Wrote ${fromFileUrl(FIXTURE)}`);
}
