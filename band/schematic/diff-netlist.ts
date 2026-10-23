/**
 * Compares a netlist exported from EasyEDA Pro (File → Export → Netlist, "FreePCB for PCB", which is
 * PADS-PCB format) against band.ts. Before every order this proves that what EasyEDA will build has
 * the same parts, nets and pin connections as the design.
 *
 *   deno task diff-netlist <path to the exported .net>
 *
 * Nets and pins must match exactly. Footprint names are reported separately: they are package
 * labels in band.ts, and EasyEDA may change their case or bind a library footprint with another name.
 */

import { blocks } from "./band.ts";

export interface Netlist {
  parts: Map<string, string>;
  nets: Map<string, Set<string>>;
}

export function parsePads(text: string): Netlist {
  const parts = new Map<string, string>();
  const nets = new Map<string, Set<string>>();
  let mode = "", net = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("*PART*")) mode = "part";
    else if (line.startsWith("*NET*")) mode = "net";
    else if (line.startsWith("*END*")) break;
    else if (line.startsWith("*SIGNAL*")) nets.set(net = line.slice(8).trim(), new Set());
    else if (line.startsWith("*")) continue;
    else if (mode === "part") {
      const [ref, ...footprint] = line.split(/\s+/);
      parts.set(ref, footprint.join(" "));
    } else if (mode === "net" && net) { for (const pin of line.split(/\s+/)) nets.get(net)!.add(pin); }
  }
  return { parts, nets };
}

export function diff(got: Netlist): { problems: string[]; footprints: string[] } {
  const wantParts = new Map<string, string>();
  const wantNets = new Map<string, Set<string>>();
  for (const part of blocks.flatMap((b) => b.parts)) {
    wantParts.set(part.ref, part.footprint);
    for (const q of part.pins) {
      if (!q.net) continue;
      if (!wantNets.has(q.net)) wantNets.set(q.net, new Set());
      wantNets.get(q.net)!.add(`${part.ref}.${q.num}`);
    }
  }

  const problems: string[] = [];
  const footprints: string[] = [];
  for (const [ref, footprint] of wantParts) {
    const theirs = got.parts.get(ref);
    if (theirs === undefined) problems.push(`part ${ref} is missing`);
    else if (theirs.toLowerCase() !== footprint.toLowerCase()) {
      footprints.push(`${ref}: ${theirs} (band.ts: ${footprint})`);
    }
  }
  for (const ref of got.parts.keys()) if (!wantParts.has(ref)) problems.push(`extra part ${ref}`);

  const netOfPin = new Map<string, string>();
  for (const [net, pins] of got.nets) {
    for (const pin of pins) {
      if (netOfPin.has(pin)) problems.push(`pin ${pin} is on two nets: ${netOfPin.get(pin)} and ${net}`);
      netOfPin.set(pin, net);
    }
  }
  for (const [net, pins] of wantNets) {
    const theirs = got.nets.get(net);
    if (!theirs) {
      const where = [...new Set([...pins].map((p) => netOfPin.get(p) ?? "no net"))];
      problems.push(`net ${net} is missing; its pins are on: ${where.join(", ")}`);
      continue;
    }
    const missing = [...pins].filter((p) => !theirs.has(p));
    const extra = [...theirs].filter((p) => !pins.has(p));
    if (missing.length) problems.push(`net ${net} lacks ${missing.join(" ")}`);
    if (extra.length) problems.push(`net ${net} also has ${extra.join(" ")}`);
  }
  for (const [net, pins] of got.nets) {
    if (!wantNets.has(net)) problems.push(`extra net ${net}: ${[...pins].join(" ")}`);
  }
  return { problems, footprints };
}

if (import.meta.main) {
  const path = Deno.args[0];
  if (!path) {
    console.error("usage: deno task diff-netlist <exported .net>");
    Deno.exit(2);
  }
  const got = parsePads(await Deno.readTextFile(path));
  const { problems, footprints } = diff(got);
  const pins = [...got.nets.values()].reduce((n, s) => n + s.size, 0);
  console.log(`${path}: ${got.parts.size} parts, ${got.nets.size} nets, ${pins} pin connections`);
  if (footprints.length) {
    console.log(
      `footprint names that differ from band.ts (check, not errors):\n  ${footprints.join("\n  ")}`,
    );
  }
  if (problems.length) {
    console.error(`DIFFERS from band.ts:\n  ${problems.join("\n  ")}`);
    Deno.exit(1);
  }
  console.log("Parts, nets and pin connections match band.ts exactly.");
}
