/**
 * Writes a schematic in EasyEDA Standard's JSON source format, the format EasyEDA Pro imports through
 * File → Import → EasyEDA (Standard). The shape strings follow what EasyEDA 6.5 itself writes.
 *
 * Every pin ends in a short wire and a net port named after its net, so connectivity is carried by
 * names, not drawn wires. Coordinates are absolute, in EasyEDA units (10 mil), y down.
 */

export type Side = "L" | "R";

export interface Pin {
  num: string;
  name: string;
  side: Side;
  /** Net name. A pin without one must be marked `nc`. */
  net?: string;
  /** Unconnected on purpose: drawn with a no-connect flag. */
  nc?: boolean;
}

export type SymbolKind = "box" | "resistor" | "capacitor" | "inductor";

export interface Part {
  ref: string;
  /** Shown under the designator: a value for passives, a part number for everything else. */
  value: string;
  /** EasyEDA package name. Pro keeps it as a plain attribute; the footprint is bound after import. */
  footprint: string;
  lcsc?: string;
  manufacturer?: string;
  mpn?: string;
  jlcClass?: "Basic Part" | "Extended Part";
  kind: SymbolKind;
  pins: Pin[];
  /** 7-bit I2C address as strapped, e.g. "0x48"; the build checks that no two parts share one. */
  i2c?: string;
  /** Extra attributes, e.g. `Resistance (Ohms)`. */
  attrs?: Record<string, string>;
}

export interface Block {
  title: string;
  parts: Part[];
}

const PIN_LEN = 10;
const PITCH = 10;
const STUB = 10;
const CHAR_W = 5.5;
const BLOCK_W = 480;
const BLOCK_GAP_Y = 40;

let gid = 0;
const id = () => `gge${(++gid).toString(16)}`;

const r2 = (n: number) => Math.round(n * 100) / 100;

function text(kind: "N" | "P" | "L", x: number, y: number, s: string, color = "#000080"): string {
  return kind === "L"
    ? `T~L~${r2(x)}~${r2(y)}~0~#0000FF~~9pt~~~~comment~${s}~1~start~${id()}~0~pinpart`
    : `T~${kind}~${r2(x)}~${r2(y)}~0~${color}~Arial~~~~~comment~${s}~1~start~${id()}~0~`;
}

/** A pin whose connectable end is (px, py). Left pins point left, right pins point right. */
function pin(p: Pin, px: number, py: number, len: number, showLabels: boolean): string {
  const v = showLabels ? "1" : "0";
  if (p.side === "L") {
    const edge = px + len;
    return [
      `P~show~0~${p.num}~${px}~${py}~180~${id()}~0`,
      `${px}~${py}`,
      `M ${px} ${py} h ${len}~#880000`,
      `${v}~${r2(edge + 3.7)}~${py + 4}~0~${p.name}~start~~~#0000FF`,
      `${v}~${r2(edge - 0.5)}~${py - 1}~0~${p.num}~end~~~#0000FF`,
      `0~${edge - 3}~${py}`,
      `0~M ${edge} ${py + 3} L ${edge + 3} ${py} L ${edge} ${py - 3}`,
    ].join("^^");
  }
  const edge = px - len;
  return [
    `P~show~0~${p.num}~${px}~${py}~0~${id()}~0`,
    `${px}~${py}`,
    `M ${px} ${py} h -${len}~#880000`,
    `${v}~${r2(edge - 3.7)}~${py + 4}~0~${p.name}~end~~~#0000FF`,
    `${v}~${r2(edge + 0.5)}~${py - 1}~0~${p.num}~start~~~#0000FF`,
    `0~${edge + 3}~${py}`,
    `0~M ${edge} ${py - 3} L ${edge - 3} ${py} L ${edge} ${py + 3}`,
  ].join("^^");
}

/** EasyEDA's no-connect flag: an X at a pin end that is unconnected on purpose. */
function noConnect(x: number, y: number): string {
  return `O~${x}~${y}~${id()}~M ${x - 4} ${y - 4} L ${x + 4} ${y + 4} M ${x + 4} ${y - 4} L ${x - 4} ${
    y + 4
  }~#33cc33~0`;
}

function wire(x1: number, y1: number, x2: number, y2: number): string {
  return `W~${x1} ${y1} ${x2} ${y2}~#008800~1~0~none~${id()}~0`;
}

/** A net port whose tip is (x, y); its body extends away from the part on the given side. */
function netPort(net: string, x: number, y: number, side: Side): string {
  if (side === "L") {
    return [
      `F~part_netLabel_netPort~${x}~${y}~0~${id()}~~0`,
      `${x}~${y}`,
      `${net}~#0000FF~${r2(x - 24.4)}~${r2(y + 3.6)}~0~end~1~Times New Roman~8pt~${id()}`,
      `PL~${x} ${y} ${x - 5} ${y + 5} ${x - 20} ${y + 5} ${x - 20} ${y - 5} ${x - 5} ${
        y - 5
      } ${x} ${y}~#0000FF~1~0~transparent~${id()}~0`,
    ].join("^^");
  }
  return [
    `F~part_netLabel_netPort~${x}~${y}~180~${id()}~~0`,
    `${x}~${y}`,
    `${net}~#0000FF~${r2(x + 24.4)}~${r2(y + 3.6)}~0~start~1~Times New Roman~8pt~${id()}`,
    `PL~${x} ${y} ${x + 5} ${y + 5} ${x + 20} ${y + 5} ${x + 20} ${y - 5} ${x + 5} ${
      y - 5
    } ${x} ${y}~#0000FF~1~0~transparent~${id()}~0`,
  ].join("^^");
}

function params(p: Part): string {
  const kv: [string, string][] = [["package", p.footprint]];
  if (p.lcsc) {
    kv.push(["BOM_Supplier", "LCSC"], ["BOM_Supplier Part", p.lcsc]);
  }
  if (p.manufacturer) kv.push(["BOM_Manufacturer", p.manufacturer]);
  if (p.mpn) kv.push(["BOM_Manufacturer Part", p.mpn]);
  if (p.jlcClass) kv.push(["BOM_JLCPCB Part Class", p.jlcClass]);
  for (const [k, v] of Object.entries(p.attrs ?? {})) kv.push([k, v]);
  kv.push(["spicePre", p.ref.replace(/\d+$/, "")], ["spiceSymbolName", p.mpn ?? p.value]);
  for (const [k, v] of kv) {
    if (/[`~^#@$]/.test(k + v)) throw new Error(`${p.ref}: reserved character in ${k}=${v}`);
  }
  return kv.flat().join("`") + "`";
}

interface Placed {
  shapes: string[];
  height: number;
}

/** Lays out one part with its top-left text line at (x, y), centred in a block column at cx. */
function placePart(p: Part, cx: number, y: number): Placed {
  const shapes: string[] = [];
  const children: string[] = [];
  const left = p.pins.filter((q) => q.side === "L");
  const right = p.pins.filter((q) => q.side === "R");
  let bodyX: number, bodyY: number, bodyW: number, bodyH: number;
  const textY = y;
  const ends: { p: Pin; x: number; y: number }[] = [];

  if (p.kind === "box") {
    const nameL = Math.max(0, ...left.map((q) => q.name.length));
    const nameR = Math.max(0, ...right.map((q) => q.name.length));
    bodyW = Math.max(60, Math.ceil(((nameL + nameR) * CHAR_W + 30) / 10) * 10);
    const rows = Math.max(left.length, right.length);
    bodyH = rows * PITCH + PITCH;
    bodyX = Math.round((cx - bodyW / 2) / 10) * 10;
    bodyY = y + 20;
    children.push(`R~${bodyX}~${bodyY}~2~2~${bodyW}~${bodyH}~#880000~1~0~none~${id()}~0~`);
    left.forEach((q, i) => ends.push({ p: q, x: bodyX - PIN_LEN, y: bodyY + PITCH * (i + 1) }));
    right.forEach((q, i) => ends.push({ p: q, x: bodyX + bodyW + PIN_LEN, y: bodyY + PITCH * (i + 1) }));
    for (const e of ends) children.push(pin(e.p, e.x, e.y, PIN_LEN, true));
  } else {
    // Two-pin passive, drawn horizontally: pin 1 on the left, pin 2 on the right.
    if (p.pins.length !== 2 || left.length !== 1 || right.length !== 1) {
      throw new Error(`${p.ref}: a passive needs exactly one left and one right pin`);
    }
    bodyW = 40;
    bodyH = 10;
    bodyX = Math.round((cx - 20) / 10) * 10;
    bodyY = y + 20;
    const py = bodyY + 5;
    const l = { p: left[0], x: bodyX, y: py };
    const r = { p: right[0], x: bodyX + 40, y: py };
    ends.push(l, r);
    if (p.kind === "resistor") {
      children.push(pin(l.p, l.x, l.y, 10, false), pin(r.p, r.x, r.y, 10, false));
      children.push(`R~${bodyX + 10}~${py - 4}~~~20~8~#880000~1~0~none~${id()}~0~`);
    } else if (p.kind === "inductor") {
      // Four coil humps between the pins, as one polyline (the shape type the examples use).
      children.push(pin(l.p, l.x, l.y, 10, false), pin(r.p, r.x, r.y, 10, false));
      const pts: string[] = [];
      for (let k = 0; k < 4; k++) {
        const x0 = bodyX + 10 + 5 * k;
        pts.push(`${x0} ${py}`, `${x0 + 1} ${py - 3}`, `${x0 + 2.5} ${py - 4}`, `${x0 + 4} ${py - 3}`);
      }
      pts.push(`${bodyX + 30} ${py}`);
      children.push(`PL~${pts.join(" ")}~#880000~1~0~none~${id()}~0`);
    } else {
      children.push(pin(l.p, l.x, l.y, 18, false), pin(r.p, r.x, r.y, 18, false));
      children.push(`PL~${bodyX + 18} ${py - 6} ${bodyX + 18} ${py + 6}~#880000~1~0~none~${id()}~0`);
      children.push(`PL~${bodyX + 22} ${py - 6} ${bodyX + 22} ${py + 6}~#880000~1~0~none~${id()}~0`);
    }
  }

  // A component's origin is the centre of its body, as EasyEDA writes it.
  const ox = bodyX + bodyW / 2;
  const oy = p.kind === "box" ? bodyY + bodyH / 2 : bodyY + 5;
  const head = [`LIB`, ox, oy, params(p), "", "0", id(), "", "", "0", "", "yes", "yes", "", "", ""].join("~");
  const texts = [
    text("P", bodyX, textY + 6, p.ref),
    text("N", bodyX + 30 + p.ref.length * CHAR_W, textY + 6, p.value),
  ];
  shapes.push([head, ...texts, ...children].join("#@$"));

  for (const e of ends) {
    if (!e.p.net) {
      if (e.p.nc) shapes.push(noConnect(e.x, e.y));
      continue;
    }
    const dir = e.p.side === "L" ? -1 : 1;
    const sx = e.x + dir * STUB;
    shapes.push(wire(e.x, e.y, sx, e.y), netPort(e.p.net, sx, e.y, e.p.side));
  }
  return { shapes, height: bodyY - y + bodyH };
}

export interface Built {
  json: string;
  shapes: string[];
}

/** EasyEDA splits shapes on these, so no name, value or net may contain them. */
const SEPARATORS = /~|\^\^|#@\$|`/;

function assertPlain(blocks: Block[]) {
  for (const b of blocks) {
    for (
      const s of [
        b.title,
        ...b.parts.flatMap((p) => [p.ref, p.value, ...p.pins.flatMap((q) => [q.name, q.num, q.net ?? ""])]),
      ]
    ) {
      if (SEPARATORS.test(s)) throw new Error(`"${s}" contains an EasyEDA separator`);
    }
  }
}

/** Places blocks in columns, each into the shortest so far, and returns an EasyEDA Standard project. */
export function build(title: string, blocks: Block[], columns = 4): Built {
  assertPlain(blocks);
  gid = 0;
  const shapes: string[] = [];
  const colY = new Array(columns).fill(0);
  for (const b of blocks) {
    const col = colY.indexOf(Math.min(...colY));
    const cx = col * BLOCK_W + BLOCK_W / 2;
    let y = colY[col];
    shapes.push(text("L", col * BLOCK_W + 20, y + 10, b.title));
    y += 25;
    for (const p of b.parts) {
      const placed = placePart(p, cx, y);
      shapes.push(...placed.shapes);
      y += placed.height + 25;
    }
    colY[col] = y + BLOCK_GAP_Y;
  }
  const width = columns * BLOCK_W;
  const height = Math.max(...colY);
  const sheet = {
    docType: "1",
    title: "band",
    description: "",
    dataStr: {
      head: {
        docType: "1",
        editorVersion: "6.5.15",
        newgId: true,
        c_para: { "Prefix Start": "1" },
        c_spiceCmd: null,
        hasIdFlag: true,
        x: "0",
        y: "0",
        importFlag: 0,
        transformList: "",
      },
      canvas: "CA~1000~1000~#FFFFFF~yes~#CCCCCC~5~1000~1000~line~5~pixel~5~0~0",
      shape: shapes,
      BBox: { x: -20, y: -20, width: width + 40, height: height + 40 },
      colors: {},
    },
  };
  const doc = {
    editorVersion: "6.5.15",
    docType: "5",
    title,
    description: "",
    colors: {},
    schematics: [sheet],
  };
  return { json: JSON.stringify(doc, null, 2) + "\n", shapes };
}
