# Ordering the band

How the first six boards were ordered from JLCPCB, written as steps you can repeat. The design facts
behind the steps are in [README.md](README.md#ordering).

Option names are JLC's from 2026-10-30. If a label has changed, pick the option that does the same thing,
and leave anything not listed here at its default.

## What you get, and what it cost

Five panels of two boards: three panels assembled (six boards) and two bare (four spares). Ordered by
2026-11-04, arrived 2026-11-20. As of 2026-11-23 none has been powered.

| | Amount | Source |
|---|---|---|
| Quoted for the goods | $425.42 | JLC, 2026-10-30 |
| Charged for the goods | $422.78 | the order |
| Shipping | $31.33 | the order |
| Customs duties and taxes | $147.98, which is 35% of the goods | the order |
| Duty and tax disbursement fee | $4.44, which is 3% of the duties | the order |
| **Total before sales tax** | **$606.53**, about $101 for each assembled board | |

Duty depends on your country and the date, and it was the biggest surprise here. Budget for it before you
choose a quantity.

**Where the quote went:**

| Part of the quote | Amount | What it is |
|---|---|---|
| Components | $205.77 | parts for six boards, about $34 each |
| Feeders | $52.70 | loading each different part onto the machine |
| Setup | $51.50 | double-sided Standard assembly |
| Engineering | $25.00 | preparing the bare board |
| Surface finish | $17.40 | ENIG |
| Via covering | $17.36 | epoxy filled and capped |
| Stencil | $16.54 | solder paste, both sides |
| Assembly fixture | $16.54 | holds the panel |
| X-ray | $9.90 | the LSM6DSOX, six of them, which JLC requires |
| Board | $4.10 | five panels |
| Via plating | $3.39 | |
| Soldering | $3.22 | |
| Production-file check | $1.05 | so you approve it first |
| Packaging | $0.50 | |
| Placement check | $0.45 | so you approve it first |

About $185 of an order is the same at any count, and each board adds about $37 (worked out from JLC's
prices, 2026-10-30).

## Before you order

1. **Check the board.** The design rule check is clean, and the netlist check passes against
   [schematic/band.ts](schematic/band.ts) (README, [Schematic](README.md#schematic)). Then open the Gerbers
   and look: ours passed the rule check with a missing copper keep-out, and with solder paste on the pads
   that face the skin.
2. **Choose the cell and the strap before the board.** If you are changing the design, buy both first. J1's
   pin order, the cell's space and the strap slots were all fixed before ours were chosen.
3. **Check the jack.** With a loose PJ-3701-SMT (C2684645), a 3.5 mm stereo plug and a meter: tip goes to
   pin 4 and ring to pin 3. Pins 5 and 6 are connected with no plug, open with one in, and never connected
   to 1–4. If a reading differs, stop: the board has to change first. *Not metered yet for this build.*
4. **Check the two scarce parts.** You need one XIAO ESP32C6 (C27675191) and one MAX30101 (C2859066) per
   board. If you pay while JLC has them, it buys them from stock. If payment has to wait, pre-order them
   under Parts Manager → Order Parts. A pre-order can't be cancelled.
5. **Look up duty and import rules** for your country.

## 1. Upload the panel

Instant Quote → Add Gerber File →
[Gerber_gameNightBand_panel_1x2_2026-10-29.zip](schematic/out/Gerber_gameNightBand_panel_1x2_2026-10-29.zip).

The preview shows 4 layers, 81 × 81 mm, two boards with a cut-out gap between them, and rails on the left
and right.

## 2. PCB options

| Option | Choose |
|---|---|
| Delivery Format | Panel by Customer. If it asks for a layout: 1 column × 2 rows |
| PCB Qty | 5, the minimum. It counts panels, so this is 10 boards |
| PCB Thickness | 0.8 mm |
| Surface Finish | ENIG |
| Via Covering | Epoxy Filled & Capped |
| Confirm Production File | Yes |

**Via covering.** Filled and capped, the vias in U7's and U2's pads can't drain solder from those joints,
and the two under TC1 leave the skin-temperature pad flat. Tented is cheaper and takes exactly that risk.

**PCB remark.** The box holds 200 characters, and this is 191:

```
Customer panel: 2 boards (1x2), board origins at (7,0) and (7,43) mm. Keep our left/right rails, tabs and mouse bites. Parts overhang the top/bottom edges and the gap: add no rails or V-cuts.
```

## 3. Assembly options

| Option | Choose |
|---|---|
| PCBA Type | Standard |
| Assembly Side | Both Sides |
| PCBA Qty | 3. It counts panels, so this is six boards. The minimum is 2 |
| Tooling holes, edge rails, fiducials | Added by Customer |
| Confirm Parts Placement | Yes |
| Board cleaning, conformal coating, baking | Off |
| Assembly build time | 3–4 days, the free one |

**Assembly remark:**

```
Do not add board cleaning or conformal coating. U5 and U5_2 (MAX30101) are unsealed optical parts: no washing or ultrasonic cleaning, no oven baking of them or the assembled boards (if their MSL3 floor life is exceeded, re-dry them in a dry cabinet), and keep flux off their windows.
The BOM and CPL cover the whole panel: both boards, already in panel coordinates. The second board's designators end in _2.
Please also X-ray U1 and U1_2 (the XIAO modules).
```

- **Never ask JLC to repeat the placement file.** These files already cover both boards.
- **The U1 X-ray** checks the joint under the XIAO that is the cell's only path to it. JLC prices it after
  its review. This order was charged $9.93 more for what the remark asks.
- ⚠️ **Baking.** JLC's
  [after-sales FAQ](https://jlcpcb.com/help/article/common-pcba-after-sales-issues-and-faq) excludes claims
  on some moisture-sensitive LEDs when baking was skipped (read 2026-11-23). Whether that covers the
  MAX30101 isn't known. Ask before you order.

## 4. Upload the parts list and the placement file

- **BOM:** [BOM_gameNightBand_panel_1x2_2026-11-02.csv](schematic/out/BOM_gameNightBand_panel_1x2_2026-11-02.csv)
- **CPL:** [PickAndPlace_gameNightBand_panel_1x2_2026-11-02.csv](schematic/out/PickAndPlace_gameNightBand_panel_1x2_2026-11-02.csv)
- If JLC asks for a file type: **Complete File, just proceed with my own files**.

Never upload the single-board `bom-jlcpcb.csv`, or a placement file straight from the board tool. See
[If the board changes](#if-the-board-changes).

## 5. Check the parts page

- All 34 lines are matched to a part.
- There are **6 each** of the XIAO, the MAX30101 and the LSM6DSOX: two per assembled panel. One per panel
  means JLC is counting one board per panel.
- If JLC warns that nine designators don't exist, they are TP1–TP5, TC1, E1, E2 and R13, which aren't
  placed. These files already leave them out, so the warning should only come from a raw placement file.
- **Every line is in stock, checked just before you pay.** U10 sold out between our quote and our payment.
  The BOM now names its replacement, the DG4053EEQ-T1-GE3 (C6183483).

## 6. Check the placement preview

- **Both boards** have parts, on their pads. Each J2 jack hangs over its board's top edge.
- **Pin 1** sits at the board's own pin-1 mark on every chip, on both sides. Look hardest at D1, Q1, U2, U3,
  U5, U6 and U8 on the skin side.
- **If bottom-side parts look turned 180°, stop.** The placement file is wrong. Don't rotate them by hand.

## 7. Pay

1. Compare the quote with the table above, and write it down with the date.
2. Choose a product description for customs, then the shipping, then any coupons.
3. See whether duty is collected now or on delivery.
4. Recheck the stock of every line.

## 8. After you pay

JLC may charge for what the remark asks. Then it sends two things to approve. It gave us 48 hours, and
makes nothing until you approve both:

- **The production file.** Compare it with the panel by plotting every layer. The copper, outline and drills
  should match. These edits are normal: copper grown 0.025 mm, floating inner pads removed, unplated holes
  0.05 mm larger, corner holes in the cut-out channels, mask openings trimmed to the pads, silk clipped, and
  a tracking code on a rail. Added rails or V-cuts are not.
- **The parts placement.** All 124 parts are on their pads, the nine unplaced pads are empty, and JLC's
  pin-1 dot sits at pad 1 on every chip, diode and connector.

**Header pins.** Each XIAO comes with two loose 7-pin strips, and JLC asks whether to fit or discard them.
Discard: the XIAO is soldered flat, and the board has no holes for pins.

## 9. When the boards arrive

1. **Count the panels, and photograph both sides before you break anything off.** Keep the packaging. JLC
   takes a quality complaint within
   [three months of receipt](https://jlcpcb.com/help/article/terms-and-conditions-of-jlcpcb-assembly-service),
   and wants [photos before any rework](https://jlcpcb.com/help/article/smt-after-sales-customer-self-inspection-guide)
   (both read 2026-11-23).
2. **Cut the tabs with flush cutters.** Never snap the rail at the temperature-sensor end. Its two tabs join
   the slotted strip that carries U7, which hangs from a 4 mm neck and two 1.5 mm bridges. Practise on a
   bare panel.
3. **Sand the nubs** dry: [the steps](BRINGUP.md#sand-the-edges).
4. **Look** for cracks across the neck and bridges, and at U7 and C14.
5. **Bring it up:** [BRINGUP.md](BRINGUP.md).

## The parts JLC doesn't supply

For six bands. "—" means it wasn't recorded.

| Part | What we bought | Price | Before you use it |
|---|---|---|---|
| Cell | TinyCircuits ASR00035, 500 mAh, six | $6.95 (TinyCircuits, 2026-11-04) | Meter it: the plug comes with black on pin 1, the opposite of J1. Swap its two contacts so plus is in the triangle cavity, and meter again. Buy spares; we have none. |
| Finger lead | SparkFun [CAB-12970](https://www.sparkfun.com/sensor-cable-electrode-pads-3-connector.html), 24", five, and one we already had | $8.75 (SparkFun, 2026-11-23) | Meter which snap is tip, ring and sleeve: the page doesn't say. Ours: red is tip, blue is ring, black is sleeve. The band uses tip and ring. |
| Electrodes | Lafayette Instrument 76642R, gel made for skin response | about $50 (what we paid, recorded 2026-11-25). How many that bought: — | The gel is about 0.65" wide and the foam 1.5", too big for a finger as sold. They snap onto the lead. Cut foam off two opposite sides, never the gel. *Cutting not tried yet.* |
| Strap | Harbor Freight 57372, 3/4" × 35 ft hook-and-loop roll, one | $9 (what we paid, recorded 2026-11-25) | Cut to about 30 cm: about 35 straps. 3/4" is the widest common size that fits the slots. |
| Cell mounting | 3M double-sided foam tape, 0.39" × 10 ft | $14 (what we paid, recorded 2026-11-25) | One strip per cell, on its flat body. |
| Skin side | Polyimide (Kapton) tape | about $5 (what we paid, recorded 2026-11-25) | Cover everything but U5's window. |

Two electrodes per player per night.

## If the board changes

The three files above are for this exact board. A changed board needs all three rebuilt, because JLC's own
panels are V-cut only and ours can't be. The scripts that made them aren't in this repo yet.

- **The panel,** from new single-board Gerbers:
  - 81 × 81 mm, boards at (7, 0) and (7, 43) mm, with a 5 mm cut-out gap between them
  - 5 mm rails on the 38 mm ends only, 2 mm channels, 2 mm tooling holes, and 1 mm fiducials on both sides
  - mouse bites of 0.6 mm holes at 0.9 mm pitch, just outside the board edge, on plain edges only. In board
    coordinates, with y up from the SW1 edge: left at y 2.5–6.5 and 10.5–14.5; right at y 5–8 and 30–33;
    between the boards at x 30–34 and 57.5–61
  - every overhang (the USB-C, J2 and SW1) over air
- **The parts list and placement file,** for the whole panel:
  - every placement moved to its board's origin
  - the second board's designators ending in `_2`
  - the nine unplaced pads left out
  - **every skin-side rotation written as 180 − r.** EasyEDA Standard mirrors and then rotates; JLC rotates
    and then mirrors. The two agree at 90° and 270° and are 180° apart at 0° and 180°
- **Check** that every part's pad 1 lands on a solder-mask opening in the panel's Gerbers, and that each
  board's copper is an exact copy of the single board's.

## What went wrong this time

| What happened | What it would have cost | What to do |
|---|---|---|
| JLC's own panel refused the board: V-cut, 70 × 70 mm minimum | No order | Draw your own panel, and ask JLC first |
| The placement file for one board was placed once, off its pads | One board empty, one wrong | Upload whole-panel files |
| JLC read bottom-side rotations 180° round | Seven parts backwards on every board | Write 180 − r, and look at every pin 1 |
| U10 sold out between the quote and the payment | A stalled order | Recheck stock just before paying, with a checked drop-in ready |
| The PCB remark holds 200 characters | The panel note cut short | Keep the note short, and put the rest in the assembly remark |
| Duty was 35% of the goods | $147.98 nobody had budgeted | Budget the landed price |
| The cell's plug was wired the other way | A drained cell | Choose the cell first, and meter every plug |
| The strap slots fit few straps, and the electrodes fit no finger | Late searches | Buy the parts that touch people before drawing around them |
| Two boards were snapped off a panel at their weakest end | No damage seen so far | Cut the tabs |
| The steps for opening the panel were only in a chat, weeks earlier | They weren't at hand when the boards came | Keep this file beside the boards |
