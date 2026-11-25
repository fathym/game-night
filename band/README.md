# game-night band

A wrist band that replaces EmotiBit at game night: one per player, worn at home, streaming skin
conductance, pulse, skin temperature and wrist movement into OpenX through IoT Hub. This is the
hardware design. The schematic is generated from [schematic/band.ts](schematic/band.ts) (see
[Schematic](#schematic)), and the firmware contract is in [FIRMWARE.md](FIRMWARE.md). The first six
boards came back assembled on 2026-11-20. One was first powered on 2026-11-24, and by
2026-11-25 had passed every [bring-up check](BRINGUP.md#log) on the bring-up sketch: its voltages are right, its five
chips answer, it runs and charges on its cell, its wrist contacts and its finger lead read a nominal 100 kΩ resistor as
10.02 and 9.97 µS, and its pulse sensor shows a heartbeat on a fingertip. Nobody has worn it yet, and there is no
firmware. On these boards the finger-lead jack's switch works the opposite way from this design, so plugging in selects
the wrong electrodes ([known fault](BRINGUP.md#1-with-no-power-cell-out-usb-out)). The fix is to cut one trace and let a
setting pick the electrodes. That one board has been cut; the other five haven't.

Prices and stock below are from JLCPCB and LCSC on 2026-10-14. The assembly order draws on JLC's
stock.

## Requirements

| | Decided |
|---|---|
| Quantity | 6 to 8 bands, ordered assembled from JLCPCB (first order: six boards assembled and four bare, in five panels of two) |
| Signals | EDA (the main signal); PPG for heart rate and beat intervals; skin temperature, for trends; a 3-axis accelerometer as the movement reference for scoring |
| Electrodes | A finger lead through a 3.5 mm jack is the primary scoring site. Two contacts on the case back are the fallback. On the first boards a setting picks which, and plugging in doesn't switch over ([Electrode selection](#eda-front-end)). |
| Wear | The back of the non-mouse wrist (see [Wearing and charging](#wearing-and-charging)) |
| Data | Wi-Fi only (the C6's Bluetooth is unused). Each band is one OpenX Data Connection, which is one IoT Hub device. |
| Recording | Started and stopped through each band's device twin by `/gamenight start` and `stop` |
| Time | The band stamps every sample on its own crystal clock and keeps UTC with NTP. The workbench checks every band against IoT Hub's arrival times, so no sync taps. |
| Setup | You load each band's device key over USB before shipping. Players set their Wi-Fi through the band's setup hotspot. |
| Power | Rechargeable LiPo, at least 4 hours of recording |

## How it fits game night

```
band ──MQTT/TLS 8883 (HTTPS fallback)──► IoT Hub ──► ADX table Devices ──► workbench (KQL)
  ▲                                         │
  └── device twin: recording on/off ◄───────┘ set by the voice bot's /gamenight start|stop
```

- **A dedicated OpenX workspace.** Game night has its own workspace with private IoT: a landing
  zone, IoT Hub and ADX in your Azure subscription. OpenX refuses telemetry queries on its shared
  store. Everyone on a workspace's team can read all of its telemetry, so the separate workspace is
  the privacy boundary for players' biometrics.
- **One Data Connection per band.** Each band gets its own device identity, and OpenX stores its
  messages in `Devices(DeviceID, EnqueuedTime, MessageID, RawData)`. `EnqueuedTime` is IoT Hub's
  arrival time on Azure's clock, the same for every sender, including the Impostor plugin and the
  voice bot. That is the common clock the workbench checks band timestamps against.
- **Recording.** A band streams only while its twin says `recording` and USB power is absent. Left
  switched on between game nights, it sleeps and checks in every 5 minutes.
- **Running cost.** IoT Hub needs the S1 tier (about 115,000 messages a night for 8 bands, against
  400,000 a day). ADX runs in your subscription and can be stopped between game nights.
- **What the band records:** skin conductance, pulse, skin temperature and how much the wrist moves.
  Raw accelerometer data is off by default, because raw wrist motion can reveal typing.

Message formats, sync, buffering and power policy are in [FIRMWARE.md](FIRMWARE.md).

## Architecture

```
LiPo ─ JST-SH ─ switch ─ AO3401A ─► XIAO ESP32C6 ◄── USB-C
                            │        (charger, 3V3, Wi-Fi 6, ceramic antenna)
                     MAX17048 (gauge)    │3V3                        I2C + interrupts
                                         ├─ 1.8 V LDO ─ MAX30101 (PPG) ◄── 4.7 V boost (from the cell)
                                         ├─ LSM6DSOX (movement reference)
                                         ├─ TMP117 (skin temp, top of a slotted tab)
                                         ├─ status LED (D6)
                                         └─ OPA2333 front end ─ RC filter ─► ADS1115 (EDA)
                                                 ▲
                               DG4053E electrode switch (open while USB power is present)
                                 ▲                               ▲
                    wrist contacts (fallback)          3.5 mm jack (finger lead)
```

A [Seeed XIAO ESP32C6](https://wiki.seeedstudio.com/xiao_esp32c6_getting_started/) is soldered flat onto
a carrier board that holds the sensors. The XIAO brings the USB-C port, the battery charger, the 3.3 V
regulator and a certified radio, so the carrier has no RF or charging design to get right.

**The antenna.**
- The XIAO's RF switch picks between its ceramic antenna and a U.FL connector. It is unpowered until
  firmware drives GPIO3 low, and GPIO14 low selects the ceramic antenna.
- Keep carrier copper out from under and around the antenna end, on every layer (X < 3.6 mm,
  Y < 11.8 mm from the antenna corner).
- Nothing metal, and no cell, lead or electrode, within about 10 mm of that end.

**The footprint.**
- Number the pads as Seeed's `XIAO-ESP32-C6-SMD` footprint does, from
  [OSHW-XIAO-Series](https://github.com/Seeed-Studio/OSHW-XIAO-Series): pads 1–14 on the edges, and
  the underside as 15 MTDI, 16 MTDO, 17 EN, 18 GND, 19 MTMS, 20 MTCK, 21 BOOT, 22 3V3, 23 BAT+ and
  24 BAT−.
- The schematic wires 17 (EN) and 21 (BOOT) to test pads; 15, 16, 18, 19, 20 and 22 stay unused.
- In EasyEDA, JLC's library footprint (C9900124963) has to be renumbered first, as
  [Schematic](#schematic) describes. As JLC ships it, the underside pads are numbered down each
  column, so the test pads would land on MTMS and MTCK instead of EN and BOOT.

## Layout

**Board:** 4-layer FR-4, 0.8 mm, ENIG, **67 × 38 mm** with 1.5 mm corner radii. It runs along the
forearm, with the XIAO end toward the elbow and the cell beside the XIAO, not on top of it. That keeps
the antenna clear, leaves the XIAO's LEDs and buttons uncovered, and makes the band about 10 mm thick
instead of 15. The board is wider than its parts need so that the strap can thread through slots in
it, because the first prototypes have no case.

**Outline.** `deno task outline` writes [out/band-outline.dxf](schematic/out/band-outline.dxf) and a
preview, [band-outline.svg](schematic/out/band-outline.svg).
- In EasyEDA Standard, use File → Import → DXF, with mm and the BoardOutLine layer. `OUTLINE` is the
  board. `STRAP_SLOTS` and `TAB_SLOTS` hold slots, which EasyEDA cuts out.
- Measure it with M: it should read 67 × 38 mm.
- **Keep only this outline on that layer.** JLC cuts along every closed shape there. Converting a
  schematic to a PCB can draw another one, and the XIAO's library footprint hides one: delete both.
- The 3D view doesn't show the slots as holes. The outline Gerber cuts them.
- **Strap slots:** 22 × 3 mm, one along each long edge at 35–57 mm, centred on the PPG for a 20 mm
  strap. Each sits 1 mm outside the widest cell (25 mm) and leaves a 2.5 mm bar at the edge to take
  the strap's pull.

| Zone, along the forearm | Top side | Skin side |
|---|---|---|
| 0–19 mm, XIAO end | XIAO, with USB-C flush with a long edge. Its antenna end then faces into the board: keep copper off every layer for 10 mm beyond it. | LED boost (U3, L1, C4–C6, R10–R13), LSM6DSOX, MAX17048, USB divider, kept at least 12 mm from the EDA block |
| 13–30 mm, under the XIAO edge and the jack strip | J2, SW1, J1, and the status LED (D5, R23) under a lid light pipe, in the strip beside the XIAO | EDA front end: U8, U9, U10, R14–R22, C15–C21, D1–D4, TP1–TP3 |
| 29–63 mm, sensor section | The cell on 0.1 mm foam. No parts. | E1, the PPG window (U5, C8–C11, U4, C7) and E2 in a line, about 20 mm apart, under the strap |
| 63–67 mm, tab, behind slots at 62–63 mm | TMP117 (U7, C14) on a slotted tab, under closed-cell foam | TC1, the skin temperature pad |

**Thickness.** About 14 mm over the cell section with the prototypes' 9.5 mm cell, or 10.3 mm with a
6 mm one, and 8.9 mm over the XIAO end. The first prototypes have no case (see
[Wearing and charging](#wearing-and-charging)), and their cell is too thick for the planned one.

**Layout rules:**
- **Skin side.** Every part on the skin side except U5 must be 1.40 mm or less. Only E1, E2, the PPG
  window and TC1 open to the skin, and each opening is sealed (see the case notes under
  [Wearing and charging](#wearing-and-charging)).
- **The wet zone.** Nothing else from the EDA input goes in the sensor section. D1, D2, R18 and R19
  sit in the EDA block with the rest, and WRIST_A/WRIST_B run to E1/E2 on an inner layer.
- **Leakage guard.** Keep GND and other nets at least 1–2 mm from E1/E2, under solder mask. Run a
  guard ring on net V15 around the E2 pad and via, WRIST_B_P, SENSE_IN and JACK_RING_P, on both
  layers. A 60 MΩ film to GND carries as much current as the smallest skin-conductance response.
- **EDA grounding.** C15, C16 and R16 share one ground via, with U8 pin 4 and U9 pin 3 returning
  beside it. The ground under the EDA block is unbroken: no slot, and no battery, boost or LED return
  runs under it.
- **The sense node.** Keep SENSE_IN (U10.15, U8.6, R17, C18) within a few millimetres. Route the
  electrode lines over solid ground, away from SW_BOOST, VLED, SDA/SCL, ADC_RDY and PPG_INT. Place
  R22 and C21 at U9 pins 4–5.
- **Loud loops.** Keep the boost loop (C4, L1, C5/C6 at U3) tight, and C10/C11 at U5 pins 9/10 with
  their via to PGND.
- **The TMP117 tab.** Two 1.0 mm slots across the board at 62–63 mm leave it joined by a 4 mm neck in
  the middle and a 1.5 mm bridge at each edge. Only V+, GND, SDA and SCL cross the neck. Keep copper
  off the bridges, and stop the inner planes at the slots. A case boss supports the tab so contact
  pressure can't bend it.
- **Jack and switch.** J2's nose and SW1's lever pass through case walls clear of the strap. A case
  rib behind J2 takes the plug's force (up to 20 N), so the solder joints don't.

## Parts

| Function | Part | LCSC | Price | Notes |
|---|---|---|---|---|
| MCU + radio | XIAO ESP32C6 (Seeed 113991254) | [C27675191](https://jlcpcb.com/partdetail/Seeed-113991254/C27675191) | ~$7.43 | **98 in stock.** Pre-order one per band if payment has to wait. It has no EasyEDA footprint; bind C9900124963's, renumbered (see [Schematic](#schematic)). |
| PPG | MAX30101EFD+T | [C2859066](https://jlcpcb.com/partdetail/C2859066) | ~$8 | **132 at JLC.** Pre-order likewise. Unsealed optical package (see [Ordering](#ordering)). |
| EDA ADC | ADS1115IDGSR | [C37593](https://jlcpcb.com/partdetail/C37593) | $1.23 | 16-bit, 4 channels |
| EDA op-amp | OPA2333AIDGKR | [C19608](https://jlcpcb.com/partdetail/C19608) | $2.70 | Zero-drift, 70 pA bias. Leaded VSSOP kept on purpose: the leadless versions put a grounded pad 0.22 mm from the sense node on a board that can't be washed. |
| Electrode switch | DG4053EEQ-T1-GE3 (Vishay) | [C6183483](https://jlcpcb.com/partdetail/C6183483) | $1.81 (JLC, 2026-11-02) | 3× SPDT, 0.02 nA typical leakage. ENABLE high opens everything. It replaced the TMUX1133PWR (C1849385), which sold out before the first order and has the same pinout. |
| Electrode ESD | ESD321DPYR ×4 | [C2868952](https://jlcpcb.com/partdetail/C2868952) | $0.14 | 0.1 nA typical. One-directional; the electrode lines stay above GND. |
| Skin temperature | TMP117AIDRVR | [C699536](https://jlcpcb.com/partdetail/C699536) | $1.03 | ±0.1 °C max from −20 to 50 °C |
| Movement reference | LSM6DSOXTR | [C481766](https://jlcpcb.com/partdetail/C481766) | $3.92 | Accelerometer at 26 Hz; gyro off; FIFO with 25 µs timestamps |
| Fuel gauge | MAX17048G+T10 | [C2682616](https://jlcpcb.com/partdetail/C2682616) | $2.17 | The XIAO can't measure its own battery. ADI's PIN 2571D (2026-04-20) only changes reel packaging. |
| LED boost | TPS61099DRVR + 2.2 µH (C79317) | [C2842395](https://jlcpcb.com/partdetail/C2842395) | $1.08 | ~1 µA quiescent, disconnects the LEDs when off. Set to 4.7 V. |
| PPG core supply | XC6206P182MR (Torex) | [C21659](https://jlcpcb.com/partdetail/C21659) | $0.17 | 1.8 V. Clones swap pins, so order this number. |
| Finger-lead jack | PJ-3701-SMT (XKB) | [C2684645](https://jlcpcb.com/partdetail/C2684645) | $0.63 | 3.5 mm, with a detect contact isolated from tip, ring and sleeve |
| Reverse protection | AO3401A | [C15127](https://jlcpcb.com/partdetail/C15127) | $0.10 | P-FET in the battery line |
| Power switch | MK-12C02-G020 (G-Switch) | [C963206](https://jlcpcb.com/partdetail/C963206) | $0.12 | Side-actuated SPDT, 1 A |
| Battery connector | JST SM02B-SRSS-TB (SH, 1.0 mm) | [C160402](https://jlcpcb.com/partdetail/C160402) | $0.13 | 2.9 mm tall. Pin 1 is BAT+. |
| Status LED | KT-0603R red, with 1 kΩ | [C2286](https://jlcpcb.com/partdetail/C2286) | $0.02 | On D6, active low |
| Battery | TinyCircuits ASR00035: protected LiPo, 500 mAh, 30 × 20 × 9.5 mm, JST-SH plug fitted | — | $6.95 (TinyCircuits, 2026-11-04) | Not on the BOM. Its plug is wired the opposite way to J1, so swap its two contacts first (see [Power](#power)). Meter each cell's polarity before plugging it in. |
| Wrist contacts | Ag/AgCl discs, 8–10 mm | — | — | Reusable, fitted in the case back. Never nickel-plated. |
| Finger lead | SparkFun CAB-12970, 3.5 mm plug to snaps + single-use isotonic Ag/AgCl electrodes | — | $8.75 a lead (SparkFun, 2026-11-23) | Consumable each night (e.g. BIOPAC EL507), not ECG pads |

Passives are JLC Basic parts in 0402 or 0603. The exceptions:
- the two 22 µF boost capacitors are 0805 and Extended (C602037, because the earlier part is no
  longer recommended for new designs)
- the 180 kΩ, the 68 kΩ 0.1%, the 270 kΩ, the 6.8 kΩ and the 2.2 µH inductor are Extended

The full list is in [schematic/out/bom-jlcpcb.csv](schematic/out/bom-jlcpcb.csv).

## I2C bus

One bus at 400 kHz on the XIAO's default pins. The carrier has 2.2 kΩ pull-ups; the XIAO has none,
and 4.7 kΩ wouldn't meet the 400 kHz rise time with the MAX17048's input capacitance. The build
fails if two parts share an address.

| Address | Part | Strap |
|---|---|---|
| 0x36 | MAX17048 | fixed |
| 0x48 | ADS1115 | ADDR → GND |
| 0x49 | TMP117 | ADD0 → V+ |
| 0x57 | MAX30101 | fixed |
| 0x6A | LSM6DSOX | SA0 → GND |

The MAX30101 runs its core at 1.8 V, but its I2C and interrupt pins tolerate 6 V, so 3.3 V pull-ups
are fine.

## Pins

| XIAO pad | Pin | GPIO | Use |
|---|---|---|---|
| 1 | D0 | 0 | `PPG_INT`: MAX30101 interrupt (open drain, 4.7 kΩ pull-up) |
| 2 | D1 | 1 | `IMU_INT`: LSM6DSOX INT2, FIFO threshold |
| 3 | D2 | 2 | `VLED_EN`: LED boost enable. No pull at or after reset, plus a 100 kΩ pull-down, so the boost stays off through boot. |
| 4 | D3 | 21 | `VBUS_DIV`: USB power through 6.8k/10k, about 3.0 V when present |
| 5 | D4 | 22 | SDA |
| 6 | D5 | 23 | SCL |
| 7 | D6 | 16 | `STATUS_LED`, active low. The ROM boot log on this pin flickers it at reset. |
| 8 | D7 | 17 | Unused |
| 9 | D8 | 19 | `PLUG_DET`: selects the electrodes (100 kΩ pull-up). Low is the wrist contacts, released is the finger lead. Never driven high. |
| 10 | D9 | 20 | `ADC_RDY`: ADS1115 conversion-ready (10 kΩ pull-up) |
| 11 | D10 | 18 | `GAUGE_ALRT`: MAX17048 low-battery alert (10 kΩ pull-up) |
| 17 | EN | — | TP5, for reset during bring-up |
| 21 | BOOT | 9 | TP4: hold to GND through a reset for download mode |
| — | — | 3 | XIAO RF switch power: drive low before starting Wi-Fi |
| — | — | 14 | XIAO antenna select: low = ceramic |
| — | — | 15 | XIAO's own LED (active low), visible through a lid window |

- **No strapping pins.** None of D0–D10 is an ESP32-C6 strapping pin.
- **Wake.** D0 and D1 are low-power GPIOs that can wake the chip from deep sleep.
- **IMU interrupt.** It goes on INT2, because INT1 must sit low at power-on or the LSM6DSOX starts in
  I3C-only mode.
- **No 32 kHz crystal.** The XIAO has none (its pins would be D0/D1), so the band never sleeps while
  recording.

## EDA front end

Constant-voltage excitation at 0.5 V, the standard set by the Society for Psychophysiological
Research:

- **Reference voltages.** A ladder from 3.3 V makes 1.5 V and 1.0 V: 180 kΩ, then 49.9 kΩ, then
  100 kΩ to GND. Each tap has 1 µF to GND.
- **Excitation.** Op-amp A buffers 1.0 V onto electrode A.
- **Measurement.** Op-amp B is a transimpedance amplifier. It holds electrode B at 1.5 V and turns the
  current through the skin into a voltage: `EDA_OUT = 1.5 V + I × 68 kΩ`. 470 nF across the 68 kΩ
  sets a 5 Hz low-pass, which is a 32 ms delay that firmware subtracts.
- **Anti-alias filter.** EDA_OUT reaches the ADC through 1 kΩ with 100 nF to V15: a 1.6 kHz corner,
  −44 dB at the ADC's 250 kHz modulator frequency, and nothing at mains frequencies.
- **ADC.** The ADS1115 reads two differential pairs:
  - AIN0–AIN1 is the current.
  - AIN2–AIN3 is the actual excitation voltage.

  Conductance is their ratio, so drift and Wi-Fi-burst ripple on the 3.3 V rail cancel out.
- **Sampling.** Firmware runs the ADC continuously at 475 SPS and averages over exact 100 ms windows
  of band time. That rejects 50 and 60 Hz mains hum by about 50 dB (see
  [FIRMWARE.md](FIRMWARE.md#timing)).

**Sizing, with Rf = 68 kΩ 0.1%:**
- Full scale is about 51 µS before the amplifier saturates, which covers wet fingers.
- One ADC step (62.5 µV at ±2.048 V) is 0.92 nA, or 1.8 nS (0.0018 µS). That is finer than the
  smallest skin-conductance response counted (0.01 µS, which is 5 nA).

**Electrode selection.** The DG4053E connects the front end to the wrist contacts or to the jack:
- Channel X carries electrode A and channel Y carries electrode B. Channel Z is unused and tied to
  GND.
- `PLUG_DET` picks: low is the wrist, and high is the jack's tip and ring. A 100 kΩ pull-up takes it high.
- The jack's detect switch was meant to hold it low until a plug goes in. On the jack fitted, the switch is
  open until a plug goes in, so it picks the wrong one
  ([known fault](BRINGUP.md#1-with-no-power-cell-out-usb-out)).
- The fix for these boards is to cut the trace from the switch
  ([BRINGUP.md](BRINGUP.md#4-fix-the-finger-lead-jack)). Then D8 alone drives `PLUG_DET`, a setting decides
  ([FIRMWARE.md](FIRMWARE.md#signals)), and nothing senses the plug.
- Firmware names the stream `EDA` (wrist) or `EDA:LEAD` (finger lead). Finger readings run several times
  larger than wrist readings, so the two never share a baseline.
- The lead's sleeve is not connected. Of a three-snap lead, use only the tip and ring snaps.

**Electrodes.**
- **Wrist contacts:** reusable Ag/AgCl discs, 8–10 mm, flush or up to 1 mm proud of the case back.
  DC excitation polarizes bare metal: stainless studs drift, and a nickel-plated stud on the anode
  releases nickel into the skin. 316L stainless is a lesser fallback for the wrist only, never
  nickel or flash gold over nickel.
- **Finger lead:** single-use Ag/AgCl snap electrodes with isotonic gel (for example BIOPAC EL507).
  Don't use ECG pads: their high-chloride gel makes skin conductance creep up over the first
  15–30 minutes.

**Safety.**
- **On battery.** Skin current is at most about 26 µA (32 µA if the amplifier saturates; the 68 kΩ
  limits it), far below anything a person can feel.
- **The 1 kΩ resistors.** They cap current from a failed switch or op-amp into the skin (at most about
  1.7 mA, far less through real skin) and limit ESD current into the switch. They don't limit
  current coming in from outside, because D1–D4 sit on the electrode side of them.
- **On USB.** The DG4053E's ENABLE comes from USB power through the divider, not from firmware, so
  the switch disconnects the front end whatever the code does. At a 3 V supply it reads 1.4 V and up as
  high and 0.6 V and down as low. The divider gives about 3.0 V on USB, and on battery about 0.25 V at
  40 °C and 0.5 V at 50 °C, from the VBUS diode's leakage (calculated; see [Power](#power)). But D1–D4
  still tie each electrode to the band's ground, and so to the charger's, beyond −0.8 V and +4.5 V.
  **Take the band off to charge it.** EDA reads open whenever USB power is present, power banks included.

**Leakage budget.** The smallest skin-conductance response counted is about 5 nA (0.01 µS). Against
it:
- the sense-side ESD diode: 0.1 nA typical, 10 nA max at 25 °C and 3.6 V, far less at 1.5 V
- op-amp bias: 70 pA typical, 200 pA max
- the switch: 20 pA typical, 1 nA max at 25 °C and 3.3 V, 5 nA max up to 85 °C
- ADC offset: ±2.8 nA
- jack insulation: at least 100 MΩ, so up to 15 nA in lead mode
- surface films: keep the sense node's leakage below 2.5 nA (above 600 MΩ), which is what the
  sealing and guard rules are for

Leakage biases the baseline level; it doesn't hide responses. Firmware removes a per-site offset
captured off the wrist (see [FIRMWARE.md](FIRMWARE.md#signals)).

## PPG, temperature and motion

**PPG.** The MAX30101 samples green, red and IR at 100 Hz. Beats come from green, which is the wrist
wavelength least affected by motion.
- **LED supply.**
  - The green LED needs 4.5–5.5 V, and red and IR are specified to 5.0 V. The TPS61099 boost is set
    to 4.70 V (1 MΩ over 270 kΩ), about 4.85 V at light load, which sits inside both windows.
  - `VLED_EN` switches it; off, it disconnects the LEDs completely.
  - The 1.8 V core supply comes up with 3.3 V, before firmware enables the boost, as the datasheet
    asks.
- **R12/R13.** R12 (0 Ω) feeds the LEDs from the boost. R13 is an unfitted option to feed them from
  3.3 V, which gives red and IR only. **Never fit R13 with R12 in place**, or 3.3 V is tied to the
  boost output.
- **The window.**
  - Clear glass or PMMA, at least 90% transmission at 537, 660 and 880 nm, at most 0.5 mm thick.
  - It touches U5's cover glass, or is held with a dry optically clear adhesive film. No liquid
    adhesive, potting or coating near U5.
  - Black ink on the window's inner face leaves two apertures: one over the LED end (pins 7–8) and one
    over the sensor end (pins 1, 14).
  - A black gasket seals the window and U5's perimeter to the case.
  - The window sits flush to 0.5 mm proud, with radiused edges, in an opaque black case back.

**Temperature.**
- **Heat path.** U7 sits on top of the slotted tab, under closed-cell foam, so skin heat arrives
  through the board: the skin pad (TC1), vias, then U7's exposed pad, soldered to a floating land.
  Facing the skin directly, it would read the board about as much as the skin.
- **TEMP_PAD.** The pad and its vias form net TEMP_PAD, which carries no circuit. The TMP117's exposed
  pad isn't tied to its ground.
- **The skin contact must connect to no circuit net.** A grounded contact becomes a third EDA
  electrode at 0 V, which reads EDA several times too high and ties the skin to USB ground while
  charging.
  - Keep GND and every other copper at least 0.5 mm from TC1 on the skin layer, with no vias to GND.
  - Bond the case's 316L contact (a 4–6 mm disc) to TC1 through an electrically insulating thermal
    pad, 0.1–0.25 mm thick.
  - Only E1, E2 and the lead touch skin. Keep the USB-C shell and any screws off the skin side.
- **Device heating.** The band warms itself, and its heat changes with radio activity. Firmware
  reports the C6's own temperature and radio state, so the workbench can separate device heating
  from skin temperature. Allow a 20–30 minute warm-up.

**Motion.**
- **Role.** The LSM6DSOX is the movement reference for scoring: the workbench flags EDA and pulse
  readings taken while the wrist moves, and the wearer's own actions (votes, chat, kills) are hand
  movements at exactly the scored moments.
- **Configuration.** Accelerometer only, at 26 Hz in high-performance mode; the gyro is powered down.
  The band always sends `ACC:ACT`, the wrist's mean movement over each 0.5 s, and raw axes only when
  the twin opts in.
- **No taps.** There is no tap detection: band clocks are synced, so they need no taps.

## Power

**Rails.**
- **Battery path.** LiPo → JST-SH → slide switch → AO3401A → XIAO BAT pad. The XIAO charges the
  cell from USB-C at 120 mA, and runs from USB whenever it is plugged in.
- **Reverse protection.** The AO3401A's drain goes to the battery and its source to the load, with
  the gate at GND. A correctly wired cell turns it on in both directions, so charging works. A
  reversed cell leaves it off on battery. With USB plugged in and the switch on, though, the charger
  turns it on and pushes its pre-charge current (about 9 mA, at most 17 mA) through the reversed
  cell. The XIAO is unharmed and the charge LED flashes as if charging, but the cell drains and never
  charges. Meter every cell before its first charge.
- **Carrier supplies.** The carrier takes its 3.3 V from the XIAO, and makes its own 1.8 V and LED
  supply. It adds no bulk capacitance to 3.3 V: the XIAO's regulator is specified for the 10 µF it
  already carries.
- **USB sense.** The XIAO's 5V pin is USB power directly. The 6.8k/10k divider gives about 3.0 V on
  USB. It is stiff on purpose: on battery, the XIAO's VBUS diode leaks tens of µA into VBUS when warm
  (about 25 µA at 40 °C, about 50 µA at 50 °C, typical). VBUS also gates the XIAO's own battery FET,
  so it has to stay near 0 V.

**Battery and runtime.** The prototypes use the TinyCircuits ASR00035: protected, 500 mAh,
30 × 20 × 9.5 mm, 8 g, with a 37 mm lead and a JST-SH plug already fitted.
- **Swap its plug's contacts first.** It comes wired black on pin 1, the opposite of J1. Swap its two
  contacts so that BAT+ is in the triangle cavity, then meter it again.
- **Mounting.** Stick the cell flat on the top side with double-sided foam tape, over the sensor
  section, beside the XIAO and never on it, with its lead end toward J1. Tape its flat body, not the
  taped end that holds its protection board. To remove it, cut through the tape with floss; never pry
  it up or bend it.
- **The plug.** SH has no latch. Tape the mated plug down, or hold it with a dab of RTV.
- **The planned case** was drawn for a cell of at most 6.0 × 25 × 34 mm (about 450 mAh) with an SH lead
  wired pin 1 = BAT+. This cell doesn't fit it.

| Load | Average |
|---|---|
| ESP32-C6, Wi-Fi with modem sleep | ~40–60 mA (estimate). With power save off it's about 100–115 mA, so firmware keeps modem sleep on. |
| MAX30101 with LEDs and boost | ~2–5 mA (estimate) |
| Sensors, op-amps, switch, gauge | ~0.5 mA |

That is about 43–66 mA. With 85% of the 500 mAh usable, it gives an estimated 6.5–10 hours,
comfortably more than a 4-hour night. The first build's measured current replaces the estimate. A flat
cell charges in about 4–5 hours at 120 mA.

**The switch.** The slide switch is in the battery line, so the band charges only when switched on.
That's the price of a switch that guarantees zero drain in a drawer or in the post.

Low-battery behaviour is in [FIRMWARE.md](FIRMWARE.md#power).

## Wearing and charging

This section is for players; copy it into [PLAYERS.md](../PLAYERS.md) when bands ship.

- **Where.** Wear the band on the back of your non-mouse wrist, just above the wrist bone, with the
  USB end toward your elbow. Leave Among Us on its default mouse-only controls, so that hand stays
  still.
- **Strap.** A 20 mm elastic hook-and-loop strap, snug enough that the band can't slide (about
  50–60 mmHg). Each player keeps their own band and strap.
- **Finger lead.** Same hand as the band. Put the two electrodes on the palm side of the middle
  segments of your index and middle fingers, not the fingertips, which hit keys, and not the heel of
  your palm, which rests on the desk. Use fresh electrodes each night, and the snaps labelled tip and
  ring. Clip the lead to the strap, or use a right-angle 3.5 mm adapter, so it doesn't pull on the
  jack.
- **Before playing.** Rinse your wrist and fingers with plain water: no sanitizer or lotion. Put the
  band on at least 15 minutes before the first round; the workbench treats the first 15 minutes as
  settling.
- **In meetings.** Rest the banded forearm on an armrest or your lap, not with the band pressed on
  the desk edge.
- **Charging.** Take the band off, switch it **on**, and plug it in the day before. It charges only
  when switched on, and nothing on it can show that it's switched off.
- **Wi-Fi.** It needs a 2.4 GHz network. If your router has separate 2.4 and 5 GHz names, pick the
  2.4 GHz one.
- **Foot site.** Possible, with a lead of at least 1.2 m.
- **Between players.** Wipe the case back and contacts with 70% isopropyl alcohol. Never bleach or
  ammonia on Ag/AgCl.

**Prototypes without a case:**
- Thread the strap through the board's two slots, with the skin side against the wrist.
- Cover the skin side with polyimide (Kapton) tape everywhere except U5's window. Skin touching any
  other copper adds leakage paths that corrupt EDA.
- Keep E1, E2 and TC1 off bare skin. The board's ENIG finish is flash gold over nickel, which the
  electrode notes above rule out. Use the finger lead for EDA, or stick Ag/AgCl electrodes onto E1
  and E2, and put a thin insulating thermal pad over TC1.

**Case notes for whoever designs it:**
- Seal every case-back opening: an O-ring or potting around each contact and the temperature
  contact, and a gasket around the PPG window.
- Radius the case-back edges.
- Make the USB-C opening about 9.2 × 3.5 mm in a wall 1.5 mm thick or less.
- Recess SW1's lever so sleeves can't move it.
- Give J2 a backing rib.
- Keep metal strap hardware away from the antenna end.
- Put a window or light pipe over the XIAO's LEDs, and a pinhole over BOOT.

## Schematic

[schematic/band.ts](schematic/band.ts) lists every part, its LCSC number and the net on each pin.
`deno task build` (in `schematic/`) writes three files to [schematic/out/](schematic/out/):
- `band-easyeda.json`: the schematic in EasyEDA Standard format
- `bom-jlcpcb.csv`: the JLCPCB BOM
- `netlist.txt`: every net and its pins, for review

Before writing, the build reads its own drawing back and fails unless:
- every pin is on exactly the net the design gives it
- every unused pin is marked NC and drawn with a no-connect flag
- no two parts share an I2C address

The check covers the drawing against `band.ts`, not `band.ts` against the real parts: pin numbers
come from each part's datasheet by hand.

**Importing into EasyEDA Pro.** The schematic was first imported and checked this way, on 2026-10-23.
The board was then laid out in EasyEDA Standard, so a change to it doesn't need these steps.
1. Open or create a project.
2. Use File → Import → EasyEDA (Standard) and pick `band-easyeda.json`.
3. **Check the import.** Export the netlist (File → Export → Netlist, "FreePCB for PCB") and run
   `deno task diff-netlist <the .net file>`. It must report that parts, nets and pin connections match
   `band.ts` exactly. The first import, on 2026-10-23, matched: 71 parts, 40 nets, 214 pin
   connections.
4. Bind a footprint to each part (Tools → Footprint Manager). A schematic imported on its own
   arrives without footprints. The `Supplier Part` C-numbers survive the import (checked
   2026-10-23), and symbol pin numbers are the datasheet's.
   - **Library parts.** Every part with an LCSC number except U1 binds the footprint that its number
     uses in EasyEDA's library, which `band.ts` names. The Footprint Manager can bind a group at once,
     such as every `R0402`. Each of these footprints was checked against `band.ts` on 2026-10-23:
     - Every pin has a pad of the same number. The pads `band.ts` leaves off are mounting tabs and
       stay unconnected: J1 3–4 and SW1 4–7.
     - The exposed pads are numbered as `band.ts` expects. MAX17048 9 and TPS61099 7 go to GND.
       TMP117 7 is TEMP_PAD: pasted and soldered, joined only to TC1's vias.
     - **D5:** LCSC's footprint puts the anode on pad 1, as `band.ts` does.
     - **SW1:** pad 2 is the centre tail, which G-Switch's drawing makes the common.
     - **J2:** the pad numbers and positions match XKB's drawing (see [Open questions](#open-questions)).
     - **U4:** keep the imported symbol and change only its footprint, as for every other part. Don't
       replace U4 with LCSC's C21659 device: its symbol labels pin 2 VIN and pin 3 VOUT, the reverse
       of Torex's datasheet (1 VSS, 2 VOUT, 3 VIN), which `band.ts` follows. In the PCB, the
       SOT-23's lone pin (pad 3) shows net 3V3.
   - **XIAO:** bind the EasyEDA footprint of JLC part C9900124963, then renumber its eight round
     underside pads to Seeed's numbering. C27675191 itself has no EasyEDA footprint.
     - **Bind.** Select U1, click the footprint box in the right-hand panel (it opens the Footprint
       Manager) and pick `LCC-14P_L17.7-W20.8-XIAO-ESP32-C6`, C9900124963's footprint. The project
       library then holds a copy. System-library footprints can't be edited, but the copy can.
     - **Renumber.** Open the copy: right-click it in the bottom panel's Project Library, or right-click
       U1 in the PCB. Make sure it's the footprint. JLC's symbol for the part has its pins in two
       columns, 1–12 and 13–24, and isn't used. Pads 1 and 14 mark the USB end. JLC numbers the eight
       round pads down each column; Seeed numbers them across, row by row from that end, so six
       change:

       | Round pads | Column nearer pads 1–7 | Other column |
       |---|---|---|
       | Row 1, at the USB end | 15 stays | 19 → 16 |
       | Row 2 | 16 → 17 (EN) | 20 → 18 |
       | Row 3 | 17 → 19 | 21 → 20 |
       | Row 4 | 18 → 21 (BOOT) | 22 stays |

       Edge pads 1–14 and the battery pads already match. Pad 23 (BAT+) is the one nearer pads 1–7.
     - **Check,** once the PCB exists: in that column, the round pad second from the USB end shows net
       XIAO_EN and the fourth shows XIAO_BOOT. If Design → Update Project Library offers to update
       this footprint, decline, or it may bring back JLC's numbering.
     - **Why not Seeed's file.** EasyEDA Pro's KiCad import refused both Seeed's KiCad 9 footprint and
       a KiCad 5 conversion
       ([footprints/XIAO-ESP32-C6-SMD.kicad_mod](schematic/footprints/XIAO-ESP32-C6-SMD.kicad_mod),
       `deno task footprints`). The conversion stays as the reference geometry: Seeed's 24 pads,
       unchanged.
   - **ESD diodes D1–D4:** after binding `X1SON-2_L1.0-W0.6-P0.65-RD-1`, edit its project copy to TI's
     DPY0002A land: both pads 0.30 × 0.50 mm, centred at ±0.35 mm. LCSC's pads are 0.40 × 0.60 mm at
     ±0.32 mm, and their 0.24 mm gap invites bridges.
   - **Footprints to draw.** The parts with nothing to buy need three footprints, each a single pad
     numbered 1. Give them these names, so that step 5 matches them:
     - `TP_1.0mm` for TP1–TP5: a 1.0 mm round pad.
     - `TEMP_SKIN_PAD` for TC1: a 3.2 × 4.4 mm pad with no solder paste, because the case contact is
       bonded to it through a thermal pad, not soldered. The 3.2 mm side runs along the board, which
       leaves 0.4 mm to the slots and to the end of the 4 mm tab.
     - `ELECTRODE_CONTACT` for E1 and E2: a 4 mm round pad for now, until the case design settles how
       the wrist contacts reach the board.
   - **R13** is DNP but keeps its land: bind `R0402`. None of the no-buy parts or R13 is in the BOM.
5. **Check the bindings.** The Footprint Manager marks any part whose footprint is missing or whose
   pins don't all have pads. Then export the netlist again and run `deno task diff-netlist`. It lists
   any part bound to a footprint whose name differs from `band.ts`, and any extra part, such as a
   library part placed by accident. It can't spot an unbound part: until a footprint is bound,
   EasyEDA exports the name from the import.
6. Run the design check, then update the PCB from the schematic.

**Which file is the master:**
- **Until layout starts,** `band.ts` is the source of truth: change it and rebuild, then re-import.
- **Once a board layout exists,** re-importing means re-binding every footprint. From then on the board
  document is the master, and `band.ts` mirrors it. This board's is an EasyEDA Standard PCB, since
  2026-10-27. It isn't in this repo.
- **Before each order,** the two must match exactly. `deno task diff-netlist` reads a netlist exported from
  Pro. For a Standard board, run `diff()` from [diff-netlist.ts](schematic/diff-netlist.ts) on the pads and
  nets in its file source (File → EasyEDA File Source).

## Ordering

The steps, the settings, the off-board parts and what went wrong are in [ORDERING.md](ORDERING.md).

- **Board.** 4-layer FR-4, 0.8 mm, ENIG, with the vias epoxy filled and capped.
- **Panel.** A single 67 × 38 mm board is below the 70 × 70 mm minimum for Standard PCBA, so it is
  ordered as our own 1 × 2 panel, 81 × 81 mm ("Panel by Customer"). JLC's own panels are V-cut only,
  which leaves no room for the overhanging parts.
  - Put the rails, fiducials and tooling holes only on edges with no overhanging part.
  - Leave a routed gap of at least 3 mm in front of the USB-C, J2 and SW1 overhangs.
  - Use mouse bites only on plain edges.
- **Assembly.** Standard PCBA, double-sided:
  - Reflow the skin side (most parts, including U5) first, then the top (U1, J1, J2, SW1, U7, C14, D5,
    R23).
  - L1 is rated for two reflows; double-sided uses both.
  - Upload only the whole-panel
    [BOM](schematic/out/BOM_gameNightBand_panel_1x2_2026-11-02.csv) and
    [placement file](schematic/out/PickAndPlace_gameNightBand_panel_1x2_2026-11-02.csv), never
    `bom-jlcpcb.csv` or a file straight from the board tool. JLC doesn't repeat a single-board
    placement file on a customer's panel, and it reads EasyEDA Standard's bottom-side rotations 180°
    round at 0° and 180°, so every skin-side row is written as 180 − r.
  - U5 (MAX30101) is an unsealed optical part: no washing, ultrasonic cleaning, conformal coating or
    oven baking. The order remark in [ORDERING.md](ORDERING.md#3-assembly-options) says so. This departs
    from the datasheet's "install last" advice, which assumes a washed board.
- **X-ray.** JLC requires X-ray for the LSM6DSOX ($9.90 for six, JLC, 2026-10-30). The remark also asks
  for U1, whose BAT+ joint under the module is the cell's only path to the XIAO.
- **Pre-order** the XIAO and the MAX30101 into JLC's parts library, one of each per band, if the order
  can't be paid while JLC has them in stock.
- **Bring-up.** Each band gets the checks in [FIRMWARE.md](FIRMWARE.md#bring-up-checks-each-band-before-casing)
  before casing.

**Cost,** for the first order of six assembled boards and four bare ones. [ORDERING.md](ORDERING.md) has
every line.
- **The quote.** $425.42 before shipping and duty (JLC, 2026-10-30): $205.77 of parts, $151.35 of
  assembly fees and $68.30 for the bare panels. That is about $34 of parts and $25 of assembly fees a
  band.
- **The price.** $606.53 before sales tax (the order): $422.78 for the goods, $31.33 shipping, $147.98
  duties and taxes, and a $4.44 disbursement fee. About $101 a band.
- **Per band.** About **$121** with the cell ($6.95, TinyCircuits, 2026-11-04), the finger lead ($8.75,
  SparkFun, 2026-11-23), and a sixth of the strap roll ($9), the foam tape ($14) and the Kapton (about $5), which
  are what we paid, recorded 2026-11-25. Shipping on all of these isn't included.
- **Consumables.** Single-use finger electrodes each night: about $50 for ours (what we paid, recorded
  2026-11-25).

## Open questions

1. **Jack contacts.** Settled with a meter on an assembled board, 2026-11-24: 1 sleeve, 3 ring and 4 tip,
   as in `band.ts`, but the 5–6 detect switch closes when a plug goes in, and `band.ts` was drawn for one
   that opens. The first boards get a cut trace (see [EDA front end](#eda-front-end)). Open: the next
   board's change, which could be foot 6 to 3V3 and R8 to GND. `band.ts` still shows the board as ordered.
2. **Cells.** Settled for the prototypes: the TinyCircuits ASR00035, with its plug's contacts swapped
   (see [Power](#power)). Polarity varies by vendor, so meter every plug.
3. **Measured draw.** The first build's real current sets the final cell size.
4. **Case and strap.** The mechanical design, to the case notes above. It also decides how the wrist
   contacts reach E1 and E2, whose board pads are 4 mm placeholders.
5. **Firmware** (see [FIRMWARE.md](FIRMWARE.md)), and the workbench's band intake, are not written
   yet.
