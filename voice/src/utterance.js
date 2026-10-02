/**
 * One speaker's Opus packets for one utterance, stamped on this machine's clock.
 *
 * @discordjs/voice 0.19.2 hands subscribers bare Opus packets with no RTP timestamps, and Discord
 * sends nothing while someone pauses. Concatenating packets would squeeze every pause out of the
 * audio and shift every later word earlier. So whenever the file falls more than JITTER_MS behind the
 * utterance's own arrival clock, it is padded with Opus silence back to that clock: audio at offset t
 * in the file reached the relay within about 100 ms of startMs + t (more right after a network stall,
 * until the next pause). Padding against the clock, not the last gap, keeps lost packets and stalls
 * from adding up over a long utterance.
 */
import { packetSamples } from "./ogg.js";

/** A 20 ms CELT silence frame, the same one Discord clients send. */
export const SILENCE_FRAME = Buffer.from([0xf8, 0xff, 0xfe]);

const FRAME_MS = 20;
const JITTER_MS = 100; // how far the file may fall behind the arrival clock before it is padded

export class Utterance {
  packets = [];
  samples = 0;
  startMs = 0;
  voiced = false; // false while every packet is silence, e.g. the burst a client sends on mute

  add(packet, arrivalMs) {
    // Every DAVE frame ends in the marker 0xFAFA. Before the encryption handshake completes, 0.19.2
    // passes those frames through still encrypted; they are not audio.
    if (packet.length === 0 || (packet.at(-1) === 0xfa && packet.at(-2) === 0xfa)) return;
    if (this.packets.length === 0) this.startMs = arrivalMs;
    const behindMs = arrivalMs - this.startMs - this.samples / 48;
    if (behindMs > JITTER_MS) for (let n = Math.round(behindMs / FRAME_MS); n > 0; n--) this.#push(SILENCE_FRAME);
    if (!packet.equals(SILENCE_FRAME)) this.voiced = true;
    this.#push(packet);
  }

  get durationSeconds() {
    return this.samples / 48000;
  }

  #push(packet) {
    this.packets.push(packet);
    this.samples += packetSamples(packet);
  }
}
