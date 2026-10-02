/**
 * Minimal Ogg Opus writer (RFC 3533 container, RFC 7845 mapping) — enough to turn one speaker's
 * Opus packets into a file that Whisper, ffmpeg and VLC read. Not a general-purpose muxer.
 *
 * Written here because prism-media 1.3.5 has no Ogg writer; the only release with one is a 2021 alpha.
 */

const SAMPLE_RATE = 48000;

// Ogg's CRC-32: polynomial 0x04c11db7, MSB-first, no reflection, initial value 0, no final xor.
const CRC_TABLE = new Uint32Array(256).map((_, i) => {
  let r = i << 24;
  for (let k = 0; k < 8; k++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
  return r >>> 0;
});

export function crc32(bytes, init = 0) {
  let crc = init;
  for (const b of bytes) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ b) & 0xff]) >>> 0;
  return crc;
}

// RFC 6716 §3.1: the TOC byte's config (top 5 bits) gives samples per frame at 48 kHz.
const FRAME_SAMPLES = [
  480, 960, 1920, 2880, 480, 960, 1920, 2880, 480, 960, 1920, 2880, // SILK NB, MB, WB
  480, 960, 480, 960, // Hybrid SWB, FB
  120, 240, 480, 960, 120, 240, 480, 960, 120, 240, 480, 960, 120, 240, 480, 960, // CELT NB..FB
];

/** Samples (at 48 kHz) one Opus packet decodes to, from its TOC byte and frame count. */
export function packetSamples(packet) {
  const perFrame = FRAME_SAMPLES[packet[0] >> 3];
  switch (packet[0] & 3) {
    case 0:
      return perFrame;
    case 1:
    case 2:
      return perFrame * 2;
    default:
      return perFrame * (packet[1] & 0x3f);
  }
}

function page(packets, { serial, sequence, granule, bos = false, eos = false }) {
  // Each packet is laced into 255-byte segments; a final segment shorter than 255 ends it.
  const lacing = [];
  for (const p of packets) {
    for (let left = p.length; ; left -= 255) {
      lacing.push(Math.min(left, 255));
      if (left < 255) break;
    }
  }

  const header = Buffer.alloc(27 + lacing.length);
  header.write("OggS", 0, "latin1");
  header[5] = (bos ? 0x02 : 0) | (eos ? 0x04 : 0);
  header.writeBigInt64LE(BigInt(granule), 6);
  header.writeUInt32LE(serial, 14);
  header.writeUInt32LE(sequence, 18);
  header[26] = lacing.length;
  header.set(lacing, 27);

  const out = Buffer.concat([header, ...packets]);
  out.writeUInt32LE(crc32(out), 22); // computed with the checksum field still zero
  return out;
}

/** Wraps Opus packets (48 kHz) in an Ogg Opus file whose timeline starts at the first packet. */
export function encodeOggOpus(packets, { channels = 2, serial = 1, maxPacketsPerPage = 50 } = {}) {
  const head = Buffer.alloc(19);
  head.write("OpusHead", 0, "latin1");
  head[8] = 1; // version
  head[9] = channels;
  head.writeUInt16LE(0, 10); // pre-skip 0: decoded audio starts exactly at the first packet
  head.writeUInt32LE(SAMPLE_RATE, 12);
  // output gain 0 and channel mapping family 0 are the zero bytes at 16..18

  const vendor = Buffer.from("game-night-voice");
  const tags = Buffer.alloc(16 + vendor.length);
  tags.write("OpusTags", 0, "latin1");
  tags.writeUInt32LE(vendor.length, 8);
  tags.set(vendor, 12);
  // user comment count 0 is the trailing four zero bytes

  const pages = [
    page([head], { serial, sequence: 0, granule: 0, bos: true }),
    page([tags], { serial, sequence: 1, granule: 0 }),
  ];

  let batch = [];
  let segments = 0;
  let granule = 0;
  const flush = (eos) => {
    pages.push(page(batch, { serial, sequence: pages.length, granule, eos }));
    batch = [];
    segments = 0;
  };

  for (const p of packets) {
    const needed = Math.floor(p.length / 255) + 1;
    if (batch.length > 0 && (batch.length === maxPacketsPerPage || segments + needed > 255)) flush(false);
    batch.push(p);
    segments += needed;
    granule += packetSamples(p); // a page's granule is the sample count at the end of its last packet
  }
  flush(true);

  return Buffer.concat(pages);
}
