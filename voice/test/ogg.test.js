import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { crc32, encodeOggOpus, packetSamples } from "../src/ogg.js";

// fixtures/tone.ogg is an independent reference, made by ffmpeg's libopus encoder and Ogg muxer:
//   ffmpeg -f lavfi -i "sine=frequency=440:duration=0.5" -ac 2 -ar 48000 -c:a libopus -b:a 64k \
//     -frame_duration 20 -page_duration 100000 tone.ogg
const tone = readFileSync(new URL("./fixtures/tone.ogg", import.meta.url));

function parsePages(buf) {
  const pages = [];
  for (let off = 0; off < buf.length; ) {
    assert.equal(buf.toString("latin1", off, off + 4), "OggS", `page at byte ${off}`);
    const count = buf[off + 26];
    const lacing = [...buf.subarray(off + 27, off + 27 + count)];
    const end = off + 27 + count + lacing.reduce((a, b) => a + b, 0);
    const raw = Buffer.from(buf.subarray(off, end));
    const stored = raw.readUInt32LE(22);
    raw.writeUInt32LE(0, 22);
    pages.push({
      flags: buf[off + 5],
      granule: Number(buf.readBigInt64LE(off + 6)),
      sequence: buf.readUInt32LE(off + 18),
      crcOk: crc32(raw) === stored,
      lacing,
      body: buf.subarray(off + 27 + count, end),
    });
    off = end;
  }
  return pages;
}

function packetsOf(pages) {
  const packets = [];
  let parts = [];
  for (const page of pages) {
    let o = 0;
    for (const len of page.lacing) {
      parts.push(page.body.subarray(o, (o += len)));
      if (len < 255) {
        packets.push(Buffer.concat(parts));
        parts = [];
      }
    }
  }
  return packets;
}

test("crc32 is the MSB-first 0x04c11db7 CRC (MPEG-2 check value with init 0xffffffff)", () => {
  assert.equal(crc32(Buffer.from("123456789"), 0xffffffff), 0x0376e6e7);
});

test("crc32 matches every page checksum ffmpeg wrote", () => {
  const pages = parsePages(tone);
  assert.ok(pages.length > 3);
  for (const p of pages) assert.ok(p.crcOk, `page ${p.sequence}`);
});

test("packetSamples reads the TOC byte", () => {
  assert.equal(packetSamples(Buffer.from([0xf8, 0xff, 0xfe])), 960); // CELT FB 20 ms, 1 frame
  assert.equal(packetSamples(Buffer.from([0xf9, 0, 0])), 1920); // code 1: two 20 ms frames
  assert.equal(packetSamples(Buffer.from([0x0b, 0x03])), 2880); // SILK NB 20 ms, code 3, 3 frames
  assert.equal(packetSamples(Buffer.from([0x80])), 120); // CELT NB 2.5 ms
});

test("encodeOggOpus round-trips ffmpeg's packets with valid pages and the right granule", () => {
  const audio = packetsOf(parsePages(tone)).slice(2); // drop OpusHead and OpusTags
  const total = audio.reduce((sum, p) => sum + packetSamples(p), 0);

  const pages = parsePages(encodeOggOpus(audio));
  for (const p of pages) assert.ok(p.crcOk, `page ${p.sequence}`);
  assert.deepEqual(pages.map((p) => p.sequence), pages.map((_, i) => i));
  assert.equal(pages[0].flags, 0x02, "only the first page is beginning-of-stream");
  assert.equal(pages.at(-1).flags, 0x04, "only the last page is end-of-stream");
  assert.ok(pages.slice(1, -1).every((p) => p.flags === 0));
  assert.equal(pages.at(-1).granule, total);

  const [head, tags, ...out] = packetsOf(pages);
  assert.equal(head.toString("latin1", 0, 8), "OpusHead");
  assert.equal(head[9], 2, "channels");
  assert.equal(head.readUInt16LE(10), 0, "pre-skip");
  assert.equal(head.readUInt32LE(12), 48000, "input sample rate");
  assert.equal(tags.toString("latin1", 0, 8), "OpusTags");
  assert.deepEqual(out, audio);
});

test("packets of 255 bytes or more are laced across segments", () => {
  const big = Buffer.alloc(300, 0x11);
  big[0] = 0xf8;
  const exact = Buffer.alloc(255, 0x22);
  exact[0] = 0xf8;
  const pages = parsePages(encodeOggOpus([big, exact]));
  assert.deepEqual(pages.at(-1).lacing, [255, 45, 255, 0]);
  assert.deepEqual(packetsOf(pages).slice(2), [big, exact]);
});

test("a page never holds more than 255 lacing segments", () => {
  const packets = Array.from({ length: 40 }, () => {
    const p = Buffer.alloc(1200, 0x33);
    p[0] = 0xf8;
    return p;
  });
  const pages = parsePages(encodeOggOpus(packets));
  assert.ok(pages.every((p) => p.lacing.length <= 255));
  assert.deepEqual(packetsOf(pages).slice(2), packets);
});
