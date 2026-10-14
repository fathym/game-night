/**
 * Builds the band schematic: the EasyEDA Standard JSON to import into EasyEDA Pro, a JLCPCB BOM, and
 * a plain netlist to review. Fails without writing anything if the drawing doesn't match the design.
 *
 *   deno task build
 */

import { blocks, title } from "./band.ts";
import { build } from "./easyeda.ts";
import { check, netlist } from "./check.ts";

const out = new URL("./out/", import.meta.url);
const { json, shapes } = build(title, blocks);

const problems = check(shapes, blocks);
if (problems.length) {
  console.error(problems.join("\n"));
  Deno.exit(1);
}

const refs = new Set<string>();
for (const b of blocks) {
  for (const p of b.parts) {
    if (refs.has(p.ref)) throw new Error(`duplicate designator ${p.ref}`);
    refs.add(p.ref);
  }
}

// JLCPCB's BOM columns. Parts with no LCSC number (electrode pads, jumpers, test points) aren't placed.
const bom = new Map<string, { comment: string; footprint: string; lcsc: string; refs: string[] }>();
for (const b of blocks) {
  for (const p of b.parts) {
    if (!p.lcsc) continue;
    const key = `${p.lcsc}|${p.value}`;
    if (!bom.has(key)) bom.set(key, { comment: p.value, footprint: p.footprint, lcsc: p.lcsc, refs: [] });
    bom.get(key)!.refs.push(p.ref);
  }
}
const csv = (s: string) => `"${s.replaceAll('"', '""')}"`;
const byRef = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });
const bomCsv = ["Comment,Designator,Footprint,LCSC Part #"]
  .concat(
    [...bom.values()]
      .map((r) => ({ ...r, refs: r.refs.sort(byRef) }))
      .sort((a, b) => byRef(a.refs[0], b.refs[0]))
      .map((r) => [r.comment, r.refs.join(","), r.footprint, r.lcsc].map(csv).join(",")),
  )
  .join("\n") + "\n";

const nets = netlist(blocks);
const netTxt = [...nets.keys()].sort().map((n) => `${n}: ${nets.get(n)!.join(" ")}`).join("\n") + "\n";

await Deno.mkdir(out, { recursive: true });
await Deno.writeTextFile(new URL("band-easyeda.json", out), json);
await Deno.writeTextFile(new URL("bom-jlcpcb.csv", out), bomCsv);
await Deno.writeTextFile(new URL("netlist.txt", out), netTxt);
console.log(`${refs.size} parts, ${nets.size} nets, ${bom.size} BOM lines → band/schematic/out/`);
