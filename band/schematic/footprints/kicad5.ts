/**
 * Rewrites a KiCad 6+ footprint (.kicad_mod) in the KiCad 5 format that EasyEDA Pro imports.
 *
 * Pads carry over exactly. Silkscreen and fab arcs become short line segments, because KiCad 5 draws
 * arcs from a centre and an angle and the 3-point arcs of KiCad 6+ don't map onto that safely.
 * Rectangles become four lines. Only what a footprint needs is kept: reference, value, lines, arcs,
 * circles, rectangles and pads.
 *
 *   deno run --allow-read --allow-write kicad5.ts <in.kicad_mod> <out.kicad_mod>
 */

export type Sexp = string | Sexp[];

export function parse(text: string): Sexp {
  const tokens = text.match(/\(|\)|"(?:[^"\\]|\\.)*"|[^\s()"]+/g) ?? [];
  let i = 0;
  const read = (): Sexp => {
    const t = tokens[i++];
    if (t === "(") {
      const list: Sexp[] = [];
      while (tokens[i] !== ")") {
        if (i >= tokens.length) throw new Error("unbalanced parentheses");
        list.push(read());
      }
      i++;
      return list;
    }
    return t.startsWith('"') ? JSON.parse(t) as string : t;
  };
  return read();
}

const isList = (s: Sexp): s is Sexp[] => Array.isArray(s);
const child = (node: Sexp[], name: string) =>
  node.find((c) => isList(c) && c[0] === name) as Sexp[] | undefined;
const num = (s: Sexp | undefined) => Number(s);
const xy = (node: Sexp[], name: string): [number, number] => {
  const c = child(node, name);
  if (!c) throw new Error(`missing (${name})`);
  return [num(c[1]), num(c[2])];
};
const fmt = (n: number) => String(Math.round(n * 1e6) / 1e6);
const layerOf = (node: Sexp[]) => String(child(node, "layer")?.[1] ?? "F.SilkS");
const widthOf = (node: Sexp[]) =>
  num(child(child(node, "stroke") ?? [], "width")?.[1] ?? child(node, "width")?.[1] ?? "0.12");
const line = (a: [number, number], b: [number, number], layer: string, width: number) =>
  `  (fp_line (start ${fmt(a[0])} ${fmt(a[1])}) (end ${fmt(b[0])} ${fmt(b[1])}) (layer ${layer}) (width ${
    fmt(width)
  }))`;

/** Points along the arc through start, mid and end, with segments of at most about 0.25 mm. */
export function arcPoints(s: [number, number], m: [number, number], e: [number, number]): [number, number][] {
  const [ax, ay] = s, [bx, by] = m, [cx, cy] = e;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-12) return [s, e];
  const ux =
    ((ax ** 2 + ay ** 2) * (by - cy) + (bx ** 2 + by ** 2) * (cy - ay) + (cx ** 2 + cy ** 2) * (ay - by)) / d;
  const uy =
    ((ax ** 2 + ay ** 2) * (cx - bx) + (bx ** 2 + by ** 2) * (ax - cx) + (cx ** 2 + cy ** 2) * (bx - ax)) / d;
  const r = Math.hypot(ax - ux, ay - uy);
  const ang = (p: [number, number]) => Math.atan2(p[1] - uy, p[0] - ux);
  const a0 = ang(s), am = ang(m), a1 = ang(e);
  // Sweep from start to end through mid, in whichever direction contains mid.
  const norm = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  let sweep = norm(a1 - a0);
  if (norm(am - a0) > sweep) sweep -= 2 * Math.PI;
  const n = Math.max(2, Math.ceil(Math.abs(sweep) * r / 0.25));
  const pts: [number, number][] = [];
  for (let k = 0; k <= n; k++) {
    const a = a0 + (sweep * k) / n;
    pts.push([ux + r * Math.cos(a), uy + r * Math.sin(a)]);
  }
  pts[0] = s;
  pts[n] = e;
  return pts;
}

function text(kind: "reference" | "value", node: Sexp[]): string {
  const at = child(node, "at")!;
  const fx = child(node, "effects");
  const font = fx && child(fx, "font");
  const size = font && child(font, "size");
  const thick = font && child(font, "thickness");
  const justify = fx && child(fx, "justify");
  const rot = at[3] ? ` ${at[3]}` : "";
  return `  (fp_text ${kind} ${String(node[2]).replace(/\s/g, "_") || "~"} (at ${at[1]} ${
    at[2]
  }${rot}) (layer ${layerOf(node)})\n` +
    `    (effects (font (size ${size?.[1] ?? 1} ${size?.[2] ?? 1}) (thickness ${thick?.[1] ?? 0.15}))` +
    `${justify ? ` (justify ${justify.slice(1).join(" ")})` : ""})\n  )`;
}

function pad(node: Sexp[]): string {
  const [, name, type, shape] = node as string[];
  const at = child(node, "at")!;
  const size = child(node, "size")!;
  const layers = child(node, "layers")!.slice(1).join(" ");
  const extra: string[] = [];
  const rr = child(node, "roundrect_rratio");
  if (rr) extra.push(`(roundrect_rratio ${rr[1]})`);
  const smm = child(node, "solder_mask_margin");
  if (smm) extra.push(`(solder_mask_margin ${smm[1]})`);
  const drill = child(node, "drill");
  if (drill) extra.push(`(drill ${drill.slice(1).join(" ")})`);
  const rot = at[3] ? ` ${at[3]}` : "";
  return `  (pad ${name} ${type} ${shape} (at ${at[1]} ${at[2]}${rot}) (size ${size[1]} ${size[2]})` +
    ` (layers ${layers})${extra.length ? " " + extra.join(" ") : ""})`;
}

export function toKicad5(src: string, descr: string): string {
  const root = parse(src);
  if (!isList(root) || (root[0] !== "footprint" && root[0] !== "module")) throw new Error("not a footprint");
  const name = String(root[1]);
  const out = [
    `(module ${name} (layer F.Cu) (tedit 0)`,
    `  (descr "${descr.replace(/"/g, "'")}")`,
    `  (attr smd)`,
  ];
  for (const c of root.slice(2)) {
    if (!isList(c)) continue;
    switch (c[0]) {
      case "property":
        if (c[1] === "Reference") out.push(text("reference", c));
        else if (c[1] === "Value") out.push(text("value", c));
        break;
      case "fp_line":
        out.push(line(xy(c, "start"), xy(c, "end"), layerOf(c), widthOf(c)));
        break;
      case "fp_arc": {
        const pts = arcPoints(xy(c, "start"), xy(c, "mid"), xy(c, "end"));
        for (let k = 1; k < pts.length; k++) out.push(line(pts[k - 1], pts[k], layerOf(c), widthOf(c)));
        break;
      }
      case "fp_circle": {
        const [cx, cy] = xy(c, "center"), [ex, ey] = xy(c, "end");
        out.push(
          `  (fp_circle (center ${fmt(cx)} ${fmt(cy)}) (end ${fmt(ex)} ${fmt(ey)}) (layer ${
            layerOf(c)
          }) (width ${fmt(widthOf(c))}))`,
        );
        break;
      }
      case "fp_rect": {
        const [x0, y0] = xy(c, "start"), [x1, y1] = xy(c, "end");
        const corners: [number, number][] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
        for (let k = 1; k < 5; k++) out.push(line(corners[k - 1], corners[k], layerOf(c), widthOf(c)));
        break;
      }
      case "pad":
        out.push(pad(c));
        break;
    }
  }
  out.push(")");
  return out.join("\n") + "\n";
}

if (import.meta.main) {
  const [input, output] = Deno.args;
  if (!input || !output) {
    console.error("usage: kicad5.ts <in.kicad_mod> <out.kicad_mod>");
    Deno.exit(2);
  }
  const src = await Deno.readTextFile(input);
  await Deno.writeTextFile(
    output,
    toKicad5(
      src,
      "Seeed Studio XIAO ESP32C6, surface mount. From Seeed-Studio/OSHW-XIAO-Series (MIT), converted to KiCad 5 format.",
    ),
  );
  console.log(`wrote ${output}`);
}
