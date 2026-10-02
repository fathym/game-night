/**
 * Minimal OSC 1.0 decoder — enough for what EmotiBit Oscilloscope emits (float messages,
 * optionally wrapped in a #bundle). Not a general-purpose OSC library.
 */

export type OscArg = number | string | Uint8Array | boolean | null;

export interface OscMessage {
  address: string;
  args: OscArg[];
}

const pad4 = (n: number) => (n + 3) & ~3;

function readString(buf: Uint8Array, off: number): { value: string; next: number } {
  let end = off;
  while (end < buf.length && buf[end] !== 0) end++;
  const value = new TextDecoder().decode(buf.subarray(off, end));
  // A string is null-terminated, then padded so the whole thing is a multiple of 4 bytes.
  return { value, next: off + pad4(end - off + 1) };
}

export function parseOsc(buf: Uint8Array): OscMessage[] {
  if (buf.length >= 16 && readString(buf, 0).value === "#bundle") {
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const out: OscMessage[] = [];
    let off = 16; // "#bundle\0" (8) + NTP timetag (8)
    while (off + 4 <= buf.length) {
      const size = view.getInt32(off);
      if (size <= 0) throw new RangeError(`bad bundle element size ${size}`);
      off += 4;
      out.push(...parseOsc(buf.subarray(off, off + size)));
      off += size;
    }
    return out;
  }
  return [parseMessage(buf)];
}

function parseMessage(buf: Uint8Array): OscMessage {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const addr = readString(buf, 0);
  const args: OscArg[] = [];
  let off = addr.next;

  // Type tag string starts with ','. A message without one has no arguments.
  if (off >= buf.length || buf[off] !== 0x2c) return { address: addr.value, args };
  const tags = readString(buf, off);
  off = tags.next;

  for (const tag of tags.value.slice(1)) {
    switch (tag) {
      case "i":
        args.push(view.getInt32(off));
        off += 4;
        break;
      case "f":
        args.push(view.getFloat32(off));
        off += 4;
        break;
      case "d":
        args.push(view.getFloat64(off));
        off += 8;
        break;
      case "h":
        args.push(Number(view.getBigInt64(off)));
        off += 8;
        break;
      case "s":
      case "S": {
        const s = readString(buf, off);
        args.push(s.value);
        off = s.next;
        break;
      }
      case "b": {
        const n = view.getInt32(off);
        off += 4;
        args.push(buf.slice(off, off + n));
        off += pad4(n);
        break;
      }
      case "T":
        args.push(true);
        break;
      case "F":
        args.push(false);
        break;
      case "N":
        args.push(null);
        break;
      default:
        // Unknown tag: we can't know its width, so stop here and keep what we have.
        return { address: addr.value, args };
    }
  }

  return { address: addr.value, args };
}
