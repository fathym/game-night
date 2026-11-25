# Bringing up a band

How to check an assembled board for the first time, before the firmware exists, and a log of every band
checked. The check numbers are the ones in
[FIRMWARE.md](FIRMWARE.md#bring-up-checks-each-band-before-casing). Cut the board out first
([ORDERING.md](ORDERING.md#9-when-the-boards-arrive)).

Do one board all the way through before starting the next.

**You need:** a multimeter with a continuity beep, a USB-C cable that carries data, a 100 kΩ resistor (1% if
you can), tape, a cell with its plug contacts already swapped ([README.md](README.md#power)), a finger lead,
and the Arduino IDE. A different resistor works if you change `TEST_OHMS` in the sketch; 47 kΩ to 220 kΩ is
fine.

**Finding things.** Turn the board so the USB and jack edge is at the top. Every name below is printed on
the board, except the XIAO's holes and the small feet.

- **Top side, XIAO on the left.** The XIAO's right-hand row of holes starts at the top with 5V, GND, 3V3.
  - **J1:** its two small feet face the XIAO. The one nearer the bottom edge is plus.
  - **SW1:** on the bottom edge, with its lever over the edge. Its three feet face the middle of the board: 1, 2
    and 3 from the left, with the wide gap (3 mm) between 1 and 2. Foot 1 joins J1's plus. Foot 3 and the four
    corner tabs join nothing. On is left, toward the XIAO end (metered on B01).
  - **J2**, counting down from its mouth at the top edge. Left row, beside the XIAO: 2, then 6 and 5 close
    together, at 0.9, 7.9 and 9.9 mm from the edge. Right row: 1, 3, 4, at 1.1, 4.0 and 9.9 mm. Feet 1 and 2 are
    joined. Foot 5 joins the XIAO's D8 hole, and foot 6 is GND.
- **Skin side, XIAO on the right.** TP2 and TP3 are against the top edge, 17 and 18 mm from the XIAO end, and
  TP1 is at 23.5 mm. TP5 and TP4 are behind the XIAO. The USB socket's shell is ground.

## Sand the edges

Each board has six rough patches, 3 to 4 mm long, where its panel tabs were. All the rough material is outside
the board's edge, so you only remove what sticks out. **Never go past the edge:** the copper starts 0.26 mm
inside it.

With the USB and jack edge at the top, and the XIAO on the left:

| Where | Patches, measured along the edge | Care |
|---|---|---|
| Left end | Two, 23.5–27.5 and 31.5–35.5 mm down from the top corner | None: nothing within 2.5 mm |
| One long edge: the top on one board of each panel, the bottom on the other | Two, 30–34 and 57.5–61 mm from the XIAO end | On the top edge, the jack sticks out beside the first. Don't press on the thin bar between the strap slot and the edge |
| Right end | Two, 5–8 mm from each corner | The strip behind them is held by a 4 mm neck and two 1.5 mm bridges |

**You need:** a dust mask (N95 or FFP2), eye protection, a flat stick about 4 mm wide, 220 and 400 grit paper to
glue to it (or a nail file), a strip cut from an old plastic card, the board's anti-static bag, a soft dry brush,
a sheet of paper, and a ruler.

1. Cell out, USB out. Photograph both sides and each patch.
2. Practise one patch on a bare board.
3. Lay the paper down. Put on the mask and eye protection: the dust is glass fibre. Touch something metal and
   earthed.
4. Slide the board into its bag with only the edge you're working on showing. No tape on U5, and no water or
   alcohol anywhere near it.
5. If a patch sticks out more than about 0.5 mm, nip it with flush cutters first, flat side to the board. Leave a
   little.
6. Hold the stick square to the board and flat on the edge. Stroke **along** the edge, not up and down across it.
   Light pressure, 220 grit.
7. Every few strokes, lay the ruler along the edge. Stop when it no longer rocks and a fingernail doesn't catch.
   If you see a bright metal line, you have gone too far: stop.
8. Do the left end first, then the long edge.
9. Do the right end last. Slide the plastic card into the slot behind the patch, without forcing it. Pinch the
   strip between finger and thumb right beside the patch, and keep to the lightest strokes. Never press in the
   middle of that end: C14 is 0.6 mm from the edge.
10. With 400 grit, take the sharpness off both corners of each patch: two or three light strokes.
11. Tip the board edge-down and brush the dust away from U5, the jack, the switch and J1. No canned air.
12. Pick up the dust with a damp paper towel, on the bench only. Wash your hands.
13. Look closely, with a phone's macro lens: the neck and bridges, U7 and C14, and the jack's mouth for grit.

## 1. With no power: cell out, USB out

Red on the first point, black on GND (on J1, black on the foot that isn't plus). A chirp that stops is a capacitor
charging. Only a steady beep counts, and a short beeps with the probes either way round. Elsewhere the probes' order
doesn't matter.

| Meter | Between | Should | Otherwise |
|---|---|---|---|
| Continuity | 3V3 and GND | Not beep | **Stop: a short** |
| Continuity | 5V and GND | Not beep | **Stop: a short** |
| Continuity | SW1's feet 1 and 2 | Beep in one lever position. That one is on: mark it | Never: the switch isn't soldered. Both: a solder bridge, so no cell until it's fixed |
| Continuity | J1's two small feet, switch on, then off | Not beep | **Stop: a short** |
| Continuity | J2 feet 5 and 6, nothing plugged in | Not beep | Foot 5 is shorted to ground |
| Continuity | J2 feet 5 and 6, finger lead plugged in | Beep | A foot isn't soldered, or the plug isn't all the way in |
| Continuity | Each of the lead's snaps and J2 feet 4, 3 and 1 | One snap beeps on each | The jack differs from the design |

The snap that beeps on foot 4 is **tip**, on foot 3 **ring**, and on foot 1 **sleeve**. Label them. The band
uses tip and ring. On our SparkFun lead, red is tip, blue is ring and black is sleeve.

**A known fault in these boards.** J2's switch closes when a lead goes in (metered on B01, 2026-11-24, and the
maker's drawing agrees). The circuit was designed for one that opens. So the wrist contacts are connected only while a
lead is plugged in, and the lead never is. [Section 4](#4-fix-the-finger-lead-jack) is the fix. Until it's done:

- Everything but the lead can still be checked, with the lead unplugged.
- Skip the resistor across the lead's snaps.
- Never load code that drives D8 high: a plugged-in lead ties D8 to ground.

## 2. First power: USB only, no cell, SW1 off

Plug in the USB cable. If anything gets hot, or a reading is far out, unplug it. With no cell, the XIAO's red
light comes on and goes off after 30 seconds
([Seeed](https://wiki.seeedstudio.com/xiao_esp32c6_getting_started/)).

| Black probe on GND, red on | Volts |
|---|---|
| 3V3 | 3.3 |
| TP2 | 1.50 |
| TP3 | 1.00 |
| TP1 | 1.50 |

TP2 and TP3 may read about 1% low, because the meter loads them. They are 1.2 mm apart: don't bridge them.

Then load [bringup/bringup.ino](bringup/bringup.ino). Its first lines say how. If no port appears, hold the
XIAO's BOOT button while you plug the cable in. Open the Serial Monitor and send `r`.

With no cell in, judge only line 2, line 3, the temperature and the motion sensor. On line 2, `36` is the
battery gauge and may be short. The other lines need the cell and will say FAIL, and the whole run can take a
minute.

## 3. On the cell

1. Unplug USB, and put SW1 off. Meter the cell's plug one more time: plus must be in the triangle cavity.
   Write down its voltage, then plug it into J1. Meter J1's two small feet before you switch on: the foot nearer the
   bottom edge must be plus.
2. Switch on. The LED lights for 2 s, then blinks about once a second, while the sketch looks at the wrist contacts and
   the lead in turn. That is check 1. Leave it 10 s.
3. Tape the resistor across E1 and E2 (skin side, halfway down, 36 and 56 mm from the XIAO end). Keep its body and the
   tape off U5 between them, and your fingers off it. The LED goes solid. Leave it 10 s.
4. Skip this until J2 is fixed. Plug in the lead, and move the resistor to its tip and ring snaps. The LED goes solid
   again. Leave it 10 s.
5. Plug in USB without switching off first: switching on again on the cell clears the saved readings. The LED goes back
   to blinking. Wait a few minutes for the charge rate to settle, and send `r`. Keep the whole output. Until J2 is
   fixed, line 4 says FAIL because of the lead: judge its wrist reading.
6. Take the resistor off. Send `p` and open the Serial Plotter. Rest a fingertip on the pulse sensor, clear of E1 and
   E2. That is check 6.
7. With an insulated jumper wire, hold TP4 to the USB shell. With another, touch TP5 to the shell and let go. The LED
   stays off and the sketch stops answering. That is check 7. Take both wires away, then touch TP5 to the shell again
   to go back. TP5 and TP4 are 8.6 mm from the XIAO end, 4.4 and 9.5 mm below the USB edge. With one wire, do it in two
   halves: hold the XIAO's BOOT button and touch TP5, then hold TP4 and press the XIAO's RESET button.

The resistor only reads on the cell: the band disconnects its electrodes whenever USB is plugged in. Never
wear a band while it's plugged in.

## 4. Fix the finger-lead jack

*Not done on any board yet.* Do it last, once everything else passes. One cut takes the jack's switch off D8. After that
D8 alone picks the electrodes: released is the lead, and held low is the wrist. Nothing senses the plug.

**You need:** a new pointed blade, a phone macro lens or magnifier, tape, a soft dry brush, eye protection and a dust
mask.

**Where.** Top side, USB and jack edge at the top, XIAO on the left:

```
   XIAO's edge pads      gap          J2
   ┌────────┐                     ┌────────
   │  3V3   │      ▪ foot 6       │
   ├────────┤                     │
   │  D10   │      ▪ foot 5       │
   │        │      │              │
   └────────┘      ╪  cut here    └────────
                   │
                  ╱
                 ●  small round via
```

The trace is 0.2 mm wide, 20.2 mm from the XIAO end. It leaves the bottom of foot 5's pad 10.5 mm below the edge, runs
straight down for 0.8 mm, then slants left to the via. Cut only the straight part, about 10.9 mm down. D10's pad is
0.84 mm to the left, and the jack's body 0.8 mm to the right. The bare boards have the same trace: cut two of those
first.

1. Cell, USB and lead out. Tape the board down, with nothing pressing on U5. Photograph the spot.
2. Meter D8 and foot 5: they beep. That confirms the trace.
3. Hold the knife nearly upright. Make three to five light strokes across the trace, toward the jack, each under 1 mm.
   Stop when the bright line is broken. There are more layers below, so don't dig.
4. Make a second cut 0.3 mm below the first. Flick out the sliver between them, and brush it away. No liquid and no
   canned air near U5.

| Lead | Continuity between | Should |
|---|---|---|
| Out, then in | D8 and foot 5 | Not beep. If it does, give the cut one or two more light strokes |
| Out, then in | D8 and the USB shell | Not beep. If it does, a burr touches ground: clear it |
| In | Foot 5 and the USB shell | Beep |
| Out | Foot 5 and the USB shell | Not beep |
| Out | D10 and foot 5, and D10 and D8 | Not beep |
| Out | 3V3 and the USB shell, and 5V and the USB shell | Not beep |

Cover the cut with a piece of polyimide (Kapton) tape. Then run section 3's steps 2 to 5 again, step 4 included: line 4
should pass. To undo it, bridge the cut with solder.

## Log

Band IDs only, never who wears which. "—" means not done yet.

| Band | Cell, resting | 3V3 | TP2 | TP3 | TP1 | Jack | 1 | 2 | 3 | 4 wrist | 4 lead | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| B01 | 3.97 (gauge) | 3.3 | 1.50 | 1.00 | 1.50 | Switch reversed; tip, ring, sleeve as designed | pass | pass | pass | 10.02 µS | waits on J2 | pass | pass | pass |
| B02 | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| B03 | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| B04 | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| B05 | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| B06 | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
