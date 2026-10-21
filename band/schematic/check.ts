/**
 * Reads the EasyEDA shapes back the way an importer would — pins, wires and net ports joined where
 * their points coincide — and checks that every pin landed on exactly the net the design gives it,
 * that every unconnected pin is marked NC and carries a no-connect flag, and that no two parts share
 * an I2C address. It checks the drawing against band.ts, not band.ts against the real parts: pin
 * numbers still come from the datasheets by hand.
 */

import type { Block } from "./easyeda.ts";

class Groups {
  #parent = new Map<string, string>();
  find(k: string): string {
    if (!this.#parent.has(k)) this.#parent.set(k, k);
    let r = k;
    while (this.#parent.get(r) !== r) r = this.#parent.get(r)!;
    this.#parent.set(k, r);
    return r;
  }
  join(a: string, b: string) {
    this.#parent.set(this.find(a), this.find(b));
  }
}

const pt = (x: string | number, y: string | number) => `@${Number(x)},${Number(y)}`;

export function check(shapes: string[], blocks: Block[]): string[] {
  const g = new Groups();
  const pinAt = new Map<string, string>(); // "U1.3" -> point
  const flags: { point: string; net: string }[] = [];
  const noConnects = new Set<string>();

  for (const s of shapes) {
    const parts = s.split("#@$");
    const head = parts[0].split("~");
    if (head[0] === "LIB") {
      const ref = parts.find((c) => c.startsWith("T~P~"))!.split("~")[12];
      for (const c of parts.filter((c) => c.startsWith("P~"))) {
        const seg = c.split("^^");
        const main = seg[0].split("~");
        const num = seg[4].split("~")[4];
        if (main[3] !== num) throw new Error(`${ref}: pin ${main[3]} shows number ${num}`);
        const key = `${ref}.${num}`;
        if (pinAt.has(key)) throw new Error(`${key} appears twice`);
        pinAt.set(key, pt(main[4], main[5]));
        g.find(pt(main[4], main[5]));
      }
    } else if (head[0] === "W") {
      const xy = head[1].split(" ");
      for (let i = 2; i < xy.length; i += 2) g.join(pt(xy[i - 2], xy[i - 1]), pt(xy[i], xy[i + 1]));
    } else if (head[0] === "F") {
      const seg = s.split("^^");
      const net = seg[2].split("~")[0];
      flags.push({ point: pt(head[2], head[3]), net });
      g.find(pt(head[2], head[3]));
    } else if (head[0] === "O") {
      noConnects.add(pt(head[1], head[2]));
    }
  }

  const problems: string[] = [];
  const netsOf = new Map<string, Set<string>>();
  for (const f of flags) {
    const r = g.find(f.point);
    if (!netsOf.has(r)) netsOf.set(r, new Set());
    netsOf.get(r)!.add(f.net);
  }
  const pinsOn = new Map<string, string[]>();
  const pinsInGroup = new Map<string, string[]>();
  for (const [key, p] of pinAt) {
    const r = g.find(p);
    if (!pinsInGroup.has(r)) pinsInGroup.set(r, []);
    pinsInGroup.get(r)!.push(key);
  }

  for (const b of blocks) {
    for (const part of b.parts) {
      for (const q of part.pins) {
        const key = `${part.ref}.${q.num}`;
        const p = pinAt.get(key);
        if (!p) {
          problems.push(`${key} is missing from the drawing`);
          continue;
        }
        const r = g.find(p);
        const names = [...(netsOf.get(r) ?? [])];
        if (q.net) {
          if (names.length !== 1 || names[0] !== q.net) {
            problems.push(
              `${key} (${q.name}) should be on ${q.net} but its group carries [${names.join(", ")}]`,
            );
          }
          if (!pinsOn.has(q.net)) pinsOn.set(q.net, []);
          pinsOn.get(q.net)!.push(key);
        } else if (!q.nc) {
          problems.push(`${key} (${q.name}) has no net and isn't marked NC`);
        } else if (names.length || pinsInGroup.get(r)!.length > 1) {
          problems.push(`${key} (${q.name}) should be unconnected but touches [${names.join(", ")}]`);
        } else if (!noConnects.has(p)) {
          problems.push(`${key} (${q.name}) is NC but has no no-connect flag`);
        }
      }
    }
  }
  for (const [net, pins] of pinsOn) {
    if (pins.length < 2) problems.push(`net ${net} has only one pin: ${pins[0]}`);
  }
  const addresses = new Map<string, string>();
  for (const part of blocks.flatMap((b) => b.parts)) {
    if (!part.i2c) continue;
    const other = addresses.get(part.i2c);
    if (other) problems.push(`${part.ref} and ${other} share I2C address ${part.i2c}`);
    addresses.set(part.i2c, part.ref);
  }
  return problems;
}

/** Net → pins, from the design itself. */
export function netlist(blocks: Block[]): Map<string, string[]> {
  const nets = new Map<string, string[]>();
  for (const b of blocks) {
    for (const p of b.parts) {
      for (const q of p.pins) {
        if (!q.net) continue;
        if (!nets.has(q.net)) nets.set(q.net, []);
        nets.get(q.net)!.push(`${p.ref}.${q.num}`);
      }
    }
  }
  return nets;
}
