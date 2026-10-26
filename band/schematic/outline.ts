/**
 * Writes the band's board outline as a DXF for EasyEDA Pro (File → Import → DXF), and an SVG preview.
 * Units are millimetres. The origin is the board corner at the XIAO end, with X running along the
 * forearm toward the TMP117 tab and Y across the wrist.
 *
 *   deno task outline
 *
 * DXF layers, all for the board outline layer (EasyEDA cuts out every closed shape inside the board):
 * - OUTLINE: the board, a rectangle with rounded corners
 * - STRAP_SLOTS: a slot along each long edge for the wrist strap, over the sensor section
 * - TAB_SLOTS: two slots across the board that leave the TMP117 tab joined by a neck in the middle and
 *   a bridge at each edge
 */

const LENGTH = 67;
/** The widest cell the README allows. It sits over the strap, so the strap slots go outside it. */
const CELL = { x: 29, length: 34, width: 25 };
/** Slots for a 20 mm strap, centred on the PPG, with a 2.5 mm bar outside each to take the strap's pull. */
const STRAP = { centreX: 46, length: 22, width: 3, gap: 1, bar: 2.5 };
const WIDTH = CELL.width + 2 * (STRAP.gap + STRAP.width + STRAP.bar);
/** Large enough to look rounded, small enough that the XIAO's corner stays on the board. */
const CORNER = 1.5;
/** The TMP117 tab runs from these slots' far edge (x 63) to the end of the board. */
const TAB = { x: 62, width: 1.0, neck: 4, bridge: 1.5 };

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

/** A slot with fully rounded ends, as a router cuts it, running along its longer side. */
function slot(x0: number, y0: number, x1: number, y1: number): Segment[] {
  if (y1 - y0 >= x1 - x0) {
    const r = (x1 - x0) / 2, xc = x0 + r;
    return [
      { kind: "line", from: [x1, y0 + r], to: [x1, y1 - r] },
      { kind: "arc", centre: [xc, y1 - r], radius: r, start: 0, end: 180 },
      { kind: "line", from: [x0, y1 - r], to: [x0, y0 + r] },
      { kind: "arc", centre: [xc, y0 + r], radius: r, start: 180, end: 360 },
    ];
  }
  const r = (y1 - y0) / 2, yc = y0 + r;
  return [
    { kind: "line", from: [x0 + r, y0], to: [x1 - r, y0] },
    { kind: "arc", centre: [x1 - r, yc], radius: r, start: 270, end: 90 },
    { kind: "line", from: [x1 - r, y1], to: [x0 + r, y1] },
    { kind: "arc", centre: [x0 + r, yc], radius: r, start: 90, end: 270 },
  ];
}

const strapX0 = STRAP.centreX - STRAP.length / 2, strapX1 = STRAP.centreX + STRAP.length / 2;
const strapSlots = [
  slot(strapX0, STRAP.bar, strapX1, STRAP.bar + STRAP.width),
  slot(strapX0, WIDTH - STRAP.bar - STRAP.width, strapX1, WIDTH - STRAP.bar),
];
const neckLow = (WIDTH - TAB.neck) / 2, neckHigh = (WIDTH + TAB.neck) / 2;
const tabSlots = [
  slot(TAB.x, TAB.bridge, TAB.x + TAB.width, neckLow),
  slot(TAB.x, neckHigh, TAB.x + TAB.width, WIDTH - TAB.bridge),
];
const layers: Record<string, Segment[]> = {
  OUTLINE: roundedRect(0, 0, LENGTH, WIDTH, CORNER),
  STRAP_SLOTS: strapSlots.flat(),
  TAB_SLOTS: tabSlots.flat(),
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

/**
 * The same shapes as an SVG, flipped so +Y points up as it does in EasyEDA, with the main sizes. Dashed
 * guides show the cell, and the XIAO with its USB-C at the top edge and the copper keep-out beyond its
 * antenna end. The guides aren't in the DXF.
 */
function svg(): string {
  const left = 10, margin = 6, w = LENGTH + left + margin, h = WIDTH + 2 * margin;
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
  const box = (x0: number, y0: number, x1: number, y1: number, style: string) =>
    `<rect x="${num(x0 + left)}" y="${num(h - margin - y1)}" width="${num(x1 - x0)}" height="${
      num(y1 - y0)
    }" ${style}/>`;
  const text = (x: number, y: number, s: string, anchor = "middle") =>
    `<text x="${num(x + left)}" y="${num(h - margin - y)}" text-anchor="${anchor}">${s}</text>`;
  const xiao = { x0: 1, x1: 18.7, y0: WIDTH - 20.9, y1: WIDTH - 0.1 };
  const cellY0 = (WIDTH - CELL.width) / 2;
  const guide = `fill="none" stroke="#888" stroke-width="0.15" stroke-dasharray="0.8 0.6"`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * 12}" height="${h * 12}">`,
    `<rect width="${w}" height="${h}" fill="#fff"/>`,
    box(xiao.x0, xiao.y0 - 10, xiao.x1, xiao.y0, `fill="#f3e3c3" stroke="none"`),
    box(xiao.x0, xiao.y0, xiao.x1, xiao.y1, guide),
    box(CELL.x, cellY0, CELL.x + CELL.length, cellY0 + CELL.width, guide),
    `<g fill="none" stroke-width="0.2" stroke-linejoin="round">`,
    `<path d="${path(layers.OUTLINE)}" stroke="#1a1a1a"/>`,
    ...strapSlots.map((s) => `<path d="${path(s)}" stroke="#2e6db4"/>`),
    ...tabSlots.map((s) => `<path d="${path(s)}" stroke="#c0392b"/>`),
    `</g>`,
    `<g font-family="sans-serif" font-size="1.6" fill="#333">`,
    text(LENGTH / 2, -3.5, `${LENGTH} mm`),
    text(-1, WIDTH / 2 - 0.6, `${WIDTH} mm`, "end"),
    text(1, WIDTH + 1.5, `R${CORNER} corners`, "start"),
    text(STRAP.centreX, WIDTH + 1.5, `strap slots ${STRAP.length} × ${STRAP.width} mm`),
    text(LENGTH, WIDTH + 1.5, `tab slots ${TAB.width} mm`, "end"),
    text((xiao.x0 + xiao.x1) / 2, xiao.y1 - 4, "XIAO"),
    text((xiao.x0 + xiao.x1) / 2, xiao.y1 - 6.5, "USB-C at top edge"),
    text((xiao.x0 + xiao.x1) / 2, xiao.y0 - 4.5, "no copper:"),
    text((xiao.x0 + xiao.x1) / 2, xiao.y0 - 6.5, "antenna"),
    text(CELL.x + CELL.length / 2, WIDTH / 2 - 0.6, `cell, up to ${CELL.length} × ${CELL.width} mm`),
    text(65, WIDTH / 2 - 0.6, "tab"),
    text(LENGTH, -3.5, `tab neck ${TAB.neck} mm, bridges ${TAB.bridge} mm`, "end"),
    `</g>`,
    `</svg>`,
  ].join("\n") + "\n";
}

const out = new URL("./out/", import.meta.url);
await Deno.mkdir(out, { recursive: true });
await Deno.writeTextFile(new URL("band-outline.dxf", out), dxf());
await Deno.writeTextFile(new URL("band-outline.svg", out), svg());
console.log(`${LENGTH} × ${WIDTH} mm outline, R${CORNER} corners, strap and tab slots → band/schematic/out/`);
