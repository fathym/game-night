/**
 * The receiver's data folder, read-only: one `<start>.jsonl` per receiver start, utterance audio in voice/.
 *
 * Parsed sessions are cached by name, size and modification time, because a game night runs to hundreds of
 * thousands of lines and an MCP client asks follow-up questions about the same session. Only names this
 * store listed itself are accepted, so a caller can't steer reads outside the folder.
 */
import { join } from "@std/path";
import { parseSession, type Session } from "../session/parse.ts";

export interface SessionListing {
  name: string;
  /** First and last arrival stamps in the file, read from its ends without parsing it all. */
  start?: string;
  end?: string;
  minutes?: number;
  megabytes: number;
  modified?: string;
}

const CACHE_SIZE = 3;

export class SessionStore {
  #cache = new Map<string, { key: string; session: Session }>();

  /** `demo`: the folder holds the bundled synthetic demo session, not real recordings. */
  constructor(readonly dataDir: string, readonly demo = false) {}

  /** Newest first. A file with no readable line, like the empty one a receiver restart leaves, goes last. */
  async list(): Promise<SessionListing[]> {
    const out: (SessionListing & { mtime: number })[] = [];
    try {
      for await (const entry of Deno.readDir(this.dataDir)) {
        if (!entry.isFile || !entry.name.endsWith(".jsonl")) continue;
        const path = join(this.dataDir, entry.name);
        const info = await Deno.stat(path);
        const { first, last } = await edges(path, info.size);
        const start = rxOf(first), end = rxOf(last);
        out.push({
          name: entry.name.slice(0, -".jsonl".length),
          start,
          end,
          minutes: start && end ? Math.round((Date.parse(end) - Date.parse(start)) / 6000) / 10 : undefined,
          megabytes: Math.round(info.size / 104857.6) / 10,
          modified: info.mtime?.toISOString(),
          mtime: info.mtime?.getTime() ?? 0,
        });
      }
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) {
        throw new Error(`The data folder ${this.dataDir} doesn't exist. Set GAMENIGHT_DATA to the folder holding the receiver's .jsonl files.`);
      }
      throw err;
    }
    return out
      .sort((a, b) => Number(!a.start) - Number(!b.start) || b.mtime - a.mtime || b.name.localeCompare(a.name))
      .map(({ mtime: _, ...rest }) => rest);
  }

  /** A session by name, or the newest one when no name is given. */
  async load(name?: string): Promise<Session> {
    const listing = await this.list();
    if (listing.length === 0) throw new Error(`No session files (*.jsonl) in ${this.dataDir}.`);
    const pick = name ? listing.find((l) => l.name === name || `${l.name}.jsonl` === name) : listing[0];
    if (!pick) throw new Error(`No session named "${name}". Known sessions: ${listing.slice(0, 10).map((l) => l.name).join(", ")}.`);

    const path = join(this.dataDir, `${pick.name}.jsonl`);
    const info = await Deno.stat(path);
    const key = `${info.size}:${info.mtime?.getTime() ?? 0}`;
    const hit = this.#cache.get(pick.name);
    if (hit && hit.key === key) {
      this.#cache.delete(pick.name); // refresh LRU order
      this.#cache.set(pick.name, hit);
      return hit.session;
    }
    const session = parseSession(await Deno.readTextFile(path), pick.name);
    this.#cache.set(pick.name, { key, session });
    while (this.#cache.size > CACHE_SIZE) this.#cache.delete(this.#cache.keys().next().value!);
    return session;
  }

  /** Whether an utterance's audio file (a path relative to the data folder) is present. */
  fileExists(relative: string): boolean {
    try {
      return Deno.statSync(join(this.dataDir, relative)).isFile;
    } catch {
      return false;
    }
  }
}

/** The first and last complete lines of a file, read from its two ends. */
async function edges(path: string, size: number): Promise<{ first?: string; last?: string }> {
  if (size === 0) return {};
  const file = await Deno.open(path);
  try {
    const head = new Uint8Array(Math.min(size, 8192));
    await file.read(head);
    const tailSize = Math.min(size, 65536);
    const tail = new Uint8Array(tailSize);
    await file.seek(size - tailSize, Deno.SeekMode.Start);
    let read = 0;
    while (read < tailSize) {
      const n = await file.read(tail.subarray(read));
      if (n === null) break;
      read += n;
    }
    const text = new TextDecoder();
    const first = text.decode(head).split("\n")[0];
    const lastLines = text.decode(tail.subarray(0, read)).trimEnd().split("\n");
    return { first, last: lastLines.at(-1) };
  } finally {
    file.close();
  }
}

function rxOf(line?: string): string | undefined {
  if (!line) return undefined;
  try {
    const rx = JSON.parse(line).rx;
    return typeof rx === "string" ? rx : undefined;
  } catch {
    return undefined;
  }
}
