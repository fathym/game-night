/**
 * Writes the band's board outline as a DXF for EasyEDA Pro (File → Import → DXF), and an SVG preview.
 * Units are millimetres. The origin is the board corner at the XIAO end, with X running along the
 * forearm toward the TMP117 tab.
 *
 *   deno task outline
 *
 * DXF layer OUTLINE is the board, a rectangle with rounded corners. Layer TAB_SLOTS holds two slots
 * across the board that leave the TMP117 tab joined by a neck in the middle and a bridge at each edge.
 * Import both onto the board outline layer: EasyEDA cuts out every closed shape inside the board.
 */

const LENGTH = 67;
const WIDTH = 21;
/** Large enough to look rounded, small enough that the XIAO's corner stays on the board. */
const CORNER = 1.5;
/** The tab runs from the slots' far edge (x 63) to the end of the board. */
const SLOTS = { x: 62, width: 1.0, neck: 4, bridge: 1.5 };

type Point = [number, number];
type Segment =
  | { kind: "line"; from: Point; to: Point }
  | { kind: "arc"; centre: Point; radius: number; start: number; end: number };

/** A closed rectangle with rounded corners, counterclockwise. Angles are degrees, as DXF wants. */
function roundedRect(x0: number, y0: number, x1: number, y1: number, r: number): Segment[] {
  return [
    { kind: "line", from: [x0 + r, y0], to: [x1 - r, y0] },
    { kind: "arc", centre: [x1 - r, y0 + r], radius: r, start: 270, end: 360 },
    { kind: "line", from: [x1, y0 + r], to: [x1, y1 - r] },
    { kind: "arc", centre: [x1 - r, y1 - r], radius: r, start: 0, end: 90 },
    { kind: "line", from: [x1 - r, y1], to: [x0 + r, y1] },
    { kind: "arc", centre: [x0 + r, y1 - r], radius: r, start: 90, end: 180 },
    { kind: "line", from: [x0, y1 - r], to: [x0, y0 + r] },
    { kind: "arc", centre: [x0 + r, y0 + r], radius: r, start: 180, end: 270 },
  ];
}

/** A slot running along Y with fully rounded ends, as a router cuts it. */
function slot(x0: number, y0: number, x1: number, y1: number): Segment[] {
  const r = (x1 - x0) / 2, xc = x0 + r;
  return [
    { kind: "line", from: [x1, y0 + r], to: [x1, y1 - r] },
    { kind: "arc", centre: [xc, y1 - r], radius: r, start: 0, end: 180 },
    { kind: "line", from: [x0, y1 - r], to: [x0, y0 + r] },
    { kind: "arc", centre: [xc, y0 + r], radius: r, start: 180, end: 360 },
  ];
}

const neckLow = (WIDTH - SLOTS.neck) / 2, neckHigh = (WIDTH + SLOTS.neck) / 2;
const slots = [
  slot(SLOTS.x, SLOTS.bridge, SLOTS.x + SLOTS.width, neckLow),
  slot(SLOTS.x, neckHigh, SLOTS.x + SLOTS.width, WIDTH - SLOTS.bridge),
];
const layers: Record<string, Segment[]> = {
  OUTLINE: roundedRect(0, 0, LENGTH, WIDTH, CORNER),
  TAB_SLOTS: slots.flat(),
};

const num = (n: number) => String(Math.round(n * 1e4) / 1e4);

/** AutoCAD R12 ASCII DXF with LINE and ARC entities only, which every importer reads. */
function dxf(): string {
  const pairs: [number, string | number][] = [];
  const add = (...items: [number, string | number][]) => pairs.push(...items);
  add([0, "SECTION"], [2, "HEADER"], [9, "$ACADVER"], [1, "AC1009"]);
  add([9, "$INSUNITS"], [70, 4], [0, "ENDSEC"]); // 4 is millimetres
  add([0, "SECTION"], [2, "TABLES"], [0, "TABLE"], [2, "LTYPE"], [70, 1]);
  add([0, "LTYPE"], [2, "CONTINUOUS"], [70, 0], [3, "Solid line"], [72, 65], [73, 0], [40, 0], [0, "ENDTAB"]);
  add([0, "TABLE"], [2, "LAYER"], [70, Object.keys(layers).length]);
  for (const [i, name] of Object.keys(layers).entries()) {
    add([0, "LAYER"], [2, name], [70, 0], [62, i + 1], [6, "CONTINUOUS"]);
  }
  add([0, "ENDTAB"], [0, "ENDSEC"], [0, "SECTION"], [2, "ENTITIES"]);
  for (const [layer, segments] of Object.entries(layers)) {
    for (const s of segments) {
      if (s.kind === "line") {
        add([0, "LINE"], [8, layer], [10, s.from[0]], [20, s.from[1]], [30, 0]);
        add([11, s.to[0]], [21, s.to[1]], [31, 0]);
      } else {
        add([0, "ARC"], [8, layer], [10, s.centre[0]], [20, s.centre[1]], [30, 0], [40, s.radius]);
        add([50, s.start], [51, s.end]);
      }
    }
  }
  add([0, "ENDSEC"], [0, "EOF"]);
  return pairs.map(([code, v]) => `${String(code).padStart(3)}\r\n${typeof v === "number" ? num(v) : v}`)
    .join("\r\n") + "\r\n";
}

/** The same shapes as an SVG, flipped so +Y points up as it does in EasyEDA, with the main sizes. */
function svg(): string {
  const left = 10, margin = 5, w = LENGTH + left + margin, h = WIDTH + 2 * margin;
  const p = ([x, y]: Point) => `${num(x + left)} ${num(h - margin - y)}`;
  const at = (s: Extract<Segment, { kind: "arc" }>, deg: number): Point => [
    s.centre[0] + s.radius * Math.cos((deg * Math.PI) / 180),
    s.centre[1] + s.radius * Math.sin((deg * Math.PI) / 180),
  ];
  // Counterclockwise with +Y up is clockwise once flipped, so each arc's sweep flag is 0.
  const path = (segments: Segment[]) =>
    segments.map((s, i) =>
      s.kind === "line"
        ? `${i ? "L" : "M"} ${p(s.from)} L ${p(s.to)}`
        : `${i ? "L" : "M"} ${p(at(s, s.start))} A ${num(s.radius)} ${num(s.radius)} 0 0 0 ${p(at(s, s.end))}`
    ).join(" ") + " Z";
  const text = (x: number, y: number, s: string, anchor = "middle") =>
    `<text x="${num(x + left)}" y="${num(h - margin - y)}" text-anchor="${anchor}">${s}</text>`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * 12}" height="${h * 12}">`,
    `<rect width="${w}" height="${h}" fill="#fff"/>`,
    `<g fill="none" stroke-width="0.2" stroke-linejoin="round">`,
    `<path d="${path(layers.OUTLINE)}" stroke="#1a1a1a"/>`,
    ...slots.map((s) => `<path d="${path(s)}" stroke="#c0392b"/>`),
    `</g>`,
    `<g font-family="sans-serif" font-size="1.6" fill="#333">`,
    text(LENGTH / 2, -3, `${LENGTH} mm`),
    text(-1, WIDTH / 2 - 0.6, `${WIDTH} mm`, "end"),
    text(1, WIDTH + 1.2, `R${CORNER} corners`, "start"),
    text(9.5, WIDTH / 2 - 0.6, "XIAO end"),
    text(65, WIDTH / 2 - 0.6, "tab"),
    text(LENGTH, WIDTH + 1.2, `${SLOTS.width} mm slots at x ${SLOTS.x}–${SLOTS.x + SLOTS.width}`, "end"),
    text(LENGTH, -3, `neck ${SLOTS.neck} mm, bridges ${SLOTS.bridge} mm`, "end"),
    `</g>`,
    `</svg>`,
  ].join("\n") + "\n";
}

const out = new URL("./out/", import.meta.url);
await Deno.mkdir(out, { recursive: true });
await Deno.writeTextFile(new URL("band-outline.dxf", out), dxf());
await Deno.writeTextFile(new URL("band-outline.svg", out), svg());
console.log(`${LENGTH} × ${WIDTH} mm outline, R${CORNER} corners, TMP117 tab slots → band/schematic/out/`);
