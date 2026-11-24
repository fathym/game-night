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
  - **J2**, counting down from its mouth at the top edge. Left row: 2, then 6 and 5 close together.
    Right row: 1, 3, 4.
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

| Meter | Between | Should | Otherwise |
|---|---|---|---|
| Continuity | 3V3 and GND | Not beep | **Stop: a short** |
| Continuity | 5V and GND | Not beep | **Stop: a short** |
| Continuity | SW1's two feet with the wide gap between them | Beep in one lever position. That one is on: mark it | The switch isn't soldered |
| Continuity | J1's two small feet, switch on, then off | Not beep | **Stop: a short** |
| Continuity | J2 feet 5 and 6, nothing plugged in | Beep | The jack differs from the design |
| Continuity | J2 feet 5 and 6, finger lead plugged in | Not beep | The jack differs from the design |
| Continuity | Each of the lead's snaps and J2 feet 4, 3 and 1 | One snap beeps on each | The jack differs from the design |

The snap that beeps on foot 4 is **tip**, on foot 3 **ring**, and on foot 1 **sleeve**. Label them. The band
uses tip and ring.

If the jack differs, carry on: the wrist contacts still work. Note it in the log.

## 2. First power: USB only, no cell, SW1 off

Plug in the USB cable. If anything gets hot, or a reading is far out, unplug it.

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
   Write down its voltage, then plug it into J1.
2. Switch on. The LED lights for 2 s, then blinks once a second. That is check 1.
3. Tape the resistor across E1 and E2, and keep your fingers off it. The LED goes solid. Leave it 5 s.
4. Plug in the finger lead, and tape the resistor across its tip and ring snaps. The LED goes solid again.
   Leave it 5 s.
5. Plug in USB, wait a few minutes for the charge rate to settle, and send `r`. Keep the whole output.
6. Send `p` and open the Serial Plotter. Rest a fingertip on the pulse sensor, clear of E1 and E2. That is
   check 6.
7. Hold TP4 to GND, touch TP5 to GND and let go. The LED stays off and the sketch stops answering. That is
   check 7. Touch TP5 to GND again, without TP4, to go back.

The resistor only reads on the cell: the band disconnects its electrodes whenever USB is plugged in. Never
wear a band while it's plugged in.

## Log

Band IDs only, never who wears which. "—" means not done yet.

| Band | Cell, resting | 3V3 | TP2 | TP3 | TP1 | Jack | 1 | 2 | 3 | 4 wrist | 4 lead | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| B01 | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| B02 | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| B03 | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| B04 | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| B05 | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| B06 | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
