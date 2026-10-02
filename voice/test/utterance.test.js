import { test } from "node:test";
import assert from "node:assert/strict";
import { packetSamples } from "../src/ogg.js";
import { SILENCE_FRAME, Utterance } from "../src/utterance.js";

const voice = (byte) => Buffer.from([0xf8, byte, byte]); // a 20 ms packet we can tell apart

function feed(arrivals) {
  const u = new Utterance();
  arrivals.forEach((ms, i) => u.add(voice(i + 1), ms));
  return u;
}

// Where a packet sits in the file, in ms from its start.
const offsetOf = (u, packet) => u.packets.slice(0, u.packets.indexOf(packet)).reduce((ms, p) => ms + packetSamples(p) / 48, 0);

test("the first packet's arrival is the utterance start", () => {
  const u = feed([1000, 1020, 1040]);
  assert.equal(u.startMs, 1000);
  assert.equal(u.packets.length, 3);
  assert.equal(u.durationSeconds, 0.06);
});

test("a pause is padded with silence so later audio keeps its real time", () => {
  // Packet at 1000 covers 1000-1020; the next arrives at 1200, so 180 ms (9 frames) was a pause.
  const u = feed([1000, 1200]);
  assert.equal(u.packets.length, 11);
  assert.ok(u.packets.slice(1, 10).every((p) => p === SILENCE_FRAME));
  assert.deepEqual(u.packets.at(-1), voice(2));
  assert.equal(u.durationSeconds, 0.22);
});

test("arrival jitter below the threshold is not mistaken for a pause", () => {
  const u = feed([1000, 1075, 1076, 1077]); // a 75 ms stall, then a burst
  assert.equal(u.packets.length, 4);
  assert.ok(!u.packets.includes(SILENCE_FRAME));
});

test("lost packets don't push later words early: the next pause pads back to the clock", () => {
  // 10 s of speech with 1% loss, a 500 ms pause, then a word spoken at 10,500 ms.
  const u = new Utterance();
  for (let i = 0; i < 500; i++) if (i % 100 !== 50) u.add(voice(1), 20 * i);
  const word = voice(2);
  u.add(word, 10_500);
  assert.equal(offsetOf(u, word), 10_500);
});

test("a delivery stall doesn't push later words late", () => {
  // Speech spoken 120-400 ms is held up and arrives in one burst at 420 ms, then a 400 ms pause.
  const u = new Utterance();
  for (let i = 0; i < 6; i++) u.add(voice(1), 20 * i);
  for (let i = 6; i <= 20; i++) u.add(voice(1), 420);
  const word = voice(2);
  u.add(word, 800);
  assert.ok(Math.abs(offsetOf(u, word) - 800) <= 100, `word at ${offsetOf(u, word)} ms`);
});

test("still-encrypted DAVE frames (ending 0xFAFA) and empty packets are dropped", () => {
  const u = new Utterance();
  u.add(Buffer.from([0xf8, 0x12, 0x34, 0xfa, 0xfa]), 400);
  u.add(Buffer.alloc(0), 500);
  u.add(voice(1), 900);
  assert.equal(u.startMs, 900);
  assert.equal(u.packets.length, 1);
});

test("an utterance of nothing but silence frames is not voiced", () => {
  const u = new Utterance();
  for (let i = 0; i < 5; i++) u.add(SILENCE_FRAME, 20 * i);
  assert.equal(u.voiced, false);
  u.add(voice(1), 100);
  assert.equal(u.voiced, true);
});
