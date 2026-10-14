# game-night band

A wrist band that replaces EmotiBit at game night: one per player, worn at home, streaming skin
conductance, pulse, skin temperature and motion straight to the workbench. This is the design; the
schematic is generated from [schematic/band.ts](schematic/band.ts) (see [Schematic](#schematic)).
Nothing has been built yet.

Prices and stock below are LCSC's on 2026-10-13/14.

## Requirements

| | Decided |
|---|---|
| Quantity | 6 to 8 bands, ordered assembled (JLCPCB PCBA) |
| Signals | EDA (the main signal), PPG for heart rate and beat intervals, skin temperature (for trends, not reactions), 6-axis motion. No magnetometer. |
| Electrodes | Two on the underside of the band at the wrist, plus a jack for an external lead (fingers, palm or foot). Plugging in the lead switches over to it. |
| Radios | Wi-Fi straight to the hosted workbench. Bluetooth for setup and as a fallback. |
| Time | The band stamps its own readings from a clock it keeps set. No hand-marked moments. |
| Power | Rechargeable LiPo, at least 4 hours of streaming over Wi-Fi |

## Architecture

```
USB-C ──► XIAO ESP32C6 (charger, 3V3, Wi-Fi 6 + BLE, ceramic antenna)
           │BAT          │3V3             │I2C + interrupts
LiPo ─ switch ─ reverse-   │                │
                protection │                │
  └─ MAX17048 (gauge) ─────┼────────────────┤
                           ├─ 1.8 V LDO ─ MAX30101 (PPG) ◄── 5 V boost (LED supply)
                           ├─ LSM6DSOX (motion)
                           ├─ TMP117 (skin temp, on an isolated tab)
                           └─ OPA2333 front end ──► ADS1115 (EDA)
                                   ▲
                 TMUX1133 electrode switch (open while USB power is present)
                    ▲                              ▲
         wrist snaps (default)          3.5 mm jack (external lead)
```

A [Seeed XIAO ESP32C6](https://wiki.seeedstudio.com/xiao_esp32c6_getting_started/) is soldered flat onto
a carrier board that holds the sensors. The XIAO brings the USB-C port, the battery charger, the 3.3 V
regulator and a certified radio with a ceramic antenna, so the carrier has no RF or charging design to get
right.

**The antenna.** The XIAO also has a U.FL connector; an onboard RF switch picks between it and the
ceramic antenna, and the ceramic one is the default. Keep the carrier free of copper under and around
the antenna end, and put that end at the edge of the case, away from the battery and the skin.

**The footprint.** Use Seeed's `XIAO-ESP32-C6-SMD` footprint (pads 1–14 on the edges, BAT+ 23 and
BAT− 24 underneath), from [OSHW-XIAO-Series](https://github.com/Seeed-Studio/OSHW-XIAO-Series).
- Pads 15–22 on the underside are debug pads: JTAG, EN, BOOT, 3V3 and GND. The schematic leaves them
  unconnected.
- JLC's own library footprint for the part (C9900124963) mislabels pads 16–22. Its "GND" pad 16 is
  really EN, so wiring it would hold the chip in reset. That doesn't matter while those pads stay
  unconnected.

**Layout.** The skin-facing parts go on the carrier's underside: the PPG sensor, the temperature sensor
and the electrode contacts. The XIAO goes on top, with the battery above it.

## Parts

| Function | Part | LCSC | Price | Notes |
|---|---|---|---|---|
| MCU + radios | XIAO ESP32C6 (Seeed 113991254) | [C9900124963](https://jlcpcb.com/partdetail/C9900124963) | ~$5.40 | Pre-order through JLC's parts service before the board order |
| PPG | MAX30101EFD+T | [C2859066](https://www.lcsc.com/product-detail/C2859066.html) | $7.98 | **Only 35 in stock**, so order early. The MAXM86161 is obsolete. |
| EDA ADC | ADS1115IDGSR | [C37593](https://www.lcsc.com/product-detail/C37593.html) | $1.23 | 16-bit, 4 channels, 8–860 SPS |
| EDA op-amp | OPA2333AIDGKR | [C19608](https://www.lcsc.com/product-detail/C19608.html) | $2.70 | Zero-drift, 70 pA bias, 17 µA per channel |
| Electrode switch | TMUX1133PWR | [C1849385](https://www.lcsc.com/product-detail/C1849385.html) | $3.12 | 3× SPDT with 0.005 nA typical leakage. EN high opens everything, so USB power drives it directly. |
| Electrode ESD | ESD321DPYR ×4 | [C2868952](https://www.lcsc.com/product-detail/C2868952.html) | $0.14 | 0.1 nA typical leakage, one-directional (electrode lines stay above GND) |
| Skin temperature | TMP117AIDRVR | [C699536](https://www.lcsc.com/product-detail/C699536.html) | $1.03 | ±0.1 °C max from −20 to 50 °C. Leave its thermal pad unsoldered. |
| Motion | LSM6DSOXTR | [C481766](https://www.lcsc.com/product-detail/C481766.html) | $3.92 | Detects taps in hardware. 0.55 mA. |
| Fuel gauge | MAX17048G+T10 | [C2682616](https://www.lcsc.com/product-detail/C2682616.html) | $2.17 | The plain XIAO can't measure its battery. ADI posted an errata notice in 2026-04; read it before layout. |
| LED boost | TPS61099DRVR + 2.2 µH (C79317) | [C2842395](https://www.lcsc.com/product-detail/C2842395.html) | $1.08 | ~1 µA quiescent, disconnects the load when off. Set to about 4.7 V. |
| PPG core supply | XC6206P182MR (Torex) | [C21659](https://www.lcsc.com/product-detail/C21659.html) | $0.17 | 1.8 V, 1 µA quiescent. Clones swap pins, so order this exact part. |
| External lead jack | PJ-3701-SMT (XKB) | [C2684645](https://www.lcsc.com/product-detail/C2684645.html) | $0.63 | 3.5 mm, with a detect contact isolated from tip, ring and sleeve. Sits at the board edge. |
| Reverse protection | AO3401A | [C15127](https://www.lcsc.com/product-detail/C15127.html) | ~$0.03 | P-FET in the battery line |
| Power switch | MK-12C02-G020 (G-Switch) | [C963206](https://www.lcsc.com/product-detail/C963206.html) | $0.12 | Side-actuated SPDT, 1 A |
| Battery connector | JST S2B-PH-SM4-TB | [C295747](https://www.lcsc.com/product-detail/C295747.html) | $0.24 | |
| Battery | 600 mAh LiPo with protection circuit, ~40×30×5 mm | — | ~$6 | JST-PH polarity varies by vendor. Meter each one before plugging it in. |

The jack is 3.5 mm because standard 3.5 mm-to-snap lead cables, sold for AD8232 heart-rate boards,
plug straight in. Use their tip and ring snaps and leave the third (sleeve) snap off the skin.

Passives are JLC Basic parts in 0402 or 0603. The exceptions are the 180 kΩ, the 68 kΩ 0.1% and the
270 kΩ, which are Extended. The full list with LCSC numbers is in
[schematic/out/bom-jlcpcb.csv](schematic/out/bom-jlcpcb.csv).

## I2C bus

One bus at 3.3 V on the XIAO's default pins, with 4.7 kΩ pull-ups on the carrier (the XIAO has
none). No two parts share an address.

| Address | Part | Strap |
|---|---|---|
| 0x36 | MAX17048 | fixed |
| 0x48 | ADS1115 | ADDR → GND |
| 0x49 | TMP117 | ADD0 → V+ (its default 0x48 collides with the ADS1115) |
| 0x57 | MAX30101 | fixed |
| 0x6A | LSM6DSOX | SA0 → GND |

The MAX30101 runs its core at 1.8 V, but its I2C and interrupt pins tolerate 6 V, so 3.3 V pull-ups
are fine.

## Pins

| XIAO pad | Pin | GPIO | Use |
|---|---|---|---|
| 1 | D0 | 0 | `PPG_INT`: MAX30101 interrupt (open drain, 4.7 kΩ pull-up) |
| 2 | D1 | 1 | `IMU_INT`: LSM6DSOX INT2 |
| 3 | D2 | 2 | `ADC_RDY`: ADS1115 ALERT/RDY (10 kΩ pull-up) |
| 4 | D3 | 21 | `VBUS_DIV`: USB power through a 100k/100k divider, 2.5 V when present |
| 5 | D4 | 22 | SDA |
| 6 | D5 | 23 | SCL |
| 7 | D6 | 16 | Spare. UART0 TX, which prints the boot log. |
| 8 | D7 | 17 | Spare (UART0 RX) |
| 9 | D8 | 19 | `PLUG_DET`: high when the external lead is plugged in (100 kΩ pull-up) |
| 10 | D9 | 20 | `VLED_EN`: 5 V boost enable (100 kΩ pull-down, so it stays off through boot) |
| 11 | D10 | 18 | `GAUGE_ALRT`: MAX17048 low-battery alert (10 kΩ pull-up) |
| — | — | 15 | Onboard LED (active low), used for status |

None of D0–D10 is an ESP32-C6 strapping pin. D0–D2 are low-power GPIOs, so the three interrupts can
also wake the chip from deep sleep.

The IMU's interrupt goes on INT2, not INT1. INT1 must sit low at power-on, or the LSM6DSOX starts in
I3C-only mode.

## EDA front end

Constant-voltage excitation at 0.5 V, the standard set by the Society for Psychophysiological
Research:

- **Reference voltages.** A resistor ladder from 3.3 V makes 1.5 V and 1.0 V: 180 kΩ, then 49.9 kΩ,
  then 100 kΩ to GND. Each tap has 1 µF to GND.
- **Excitation.** Op-amp A buffers 1.0 V onto electrode A.
- **Measurement.** Op-amp B is a transimpedance amplifier. It holds electrode B at 1.5 V and turns the
  current through the skin into a voltage: `EDA_OUT = 1.5 V + I × 68 kΩ`.
- **ADC.** The ADS1115 reads two differential pairs:
  - AIN0–AIN1 is `EDA_OUT − 1.5 V`, which gives the current.
  - AIN2–AIN3 is `1.5 V − 1.0 V`, the actual excitation voltage.

  Conductance is their ratio, so drift and Wi-Fi-burst ripple on the 3.3 V rail cancel out instead of
  showing up as fake skin responses.

**Sizing, with Rf = 68 kΩ 0.1%:**
- Full scale is about 51 µS before the amplifier saturates. That covers wet fingers.
- One ADC step (62.5 µV at ±2.048 V) is 0.92 nA, which is 1.8 nS (0.0018 µS). That is 5–25× finer than
  the smallest skin-conductance responses usually counted (0.01–0.05 µS).
- 470 nF across Rf sets a low-pass of about 5 Hz.
- The ADC alternates between the two pairs at about 60 Hz each. Readings are sent at 15–30 Hz.

**Electrode selection.** The TMUX1133 connects the front end either to the wrist snaps or to the jack:
- Channel 1 carries electrode A and channel 2 carries electrode B. Channel 3 is unused and tied to GND.
- The jack's detect contact is closed with no plug, which holds `PLUG_DET` low and selects the wrist
  snaps. A plug opens it, the pull-up takes `PLUG_DET` high, and the switch moves to the jack's tip
  and ring.
- The selection happens in hardware. Firmware reads the same line and tags every EDA reading with its
  site, because finger readings run several times larger than wrist readings.

**Safety.**
- The TMUX1133's enable comes from USB power through the divider, not from firmware. While USB is
  plugged in, the XIAO runs from USB, the switch is powered, and its enable is high. Both electrodes
  are open whatever the code does.
- On battery, the current through the skin is a few microamps, far below anything a person can feel.
- Each electrode has 1 kΩ in series, which limits fault current. Firmware subtracts the 2 kΩ path and
  the switch's on-resistance.

**Leakage budget.** The smallest signal is about 25 nA, at 0.05 µS. Against that:
- op-amp bias current: 70 pA
- switch: picoamps
- ESD diodes: 0.1 nA typical, 10 nA worst case

Firmware takes an open-electrode reading whenever the band is off the wrist and removes that offset.

## PPG, temperature and motion

- **PPG.** The MAX30101 samples red, IR and green at 100 Hz, up from EmotiBit's 25 Hz. At 25 Hz, beat
  timing comes in 40 ms steps.
  - The green LED needs 4.5–5.5 V, and red and IR are specified to 5.0 V. A TPS61099 boost set to
    about 4.7 V (1 MΩ over 270 kΩ; about 4.85 V at light load) sits inside both windows.
  - Firmware switches the boost with `VLED_EN`. Off, it disconnects the LEDs completely.
  - R12, a 0 Ω resistor, feeds the LEDs from the boost. R13 is an unfitted 0 Ω option to feed them from
    3.3 V instead, which gives red and IR only, in case the boost misbehaves.
  - The 1.8 V core supply comes up with 3.3 V, before firmware enables the boost. That is the order the
    datasheet asks for.
  - The sensor sits under a window in the case bottom, between the two electrode snaps.
- **Temperature.** The TMP117 sits on a tab of the carrier, cut off from the rest of the board by a
  slot, as far as possible from the XIAO, the charger and the boost. Board heat would otherwise skew
  the reading. A metal contact in the case bottom touches the skin. It reports at 1 Hz with 8× averaging,
  the condition its accuracy spec assumes.
- **Motion.** The LSM6DSOX streams accel and gyro at 26–104 Hz and flags taps on `IMU_INT`. Sync taps
  now check the band's clock instead of correcting it.

## Power

**Rails.**
- LiPo → slide switch → AO3401A → XIAO BAT pad. The XIAO charges the cell from USB-C and runs from USB
  whenever it is plugged in.
- The AO3401A is the reverse-battery protection. Its drain goes to the battery and its source to the
  load, with the gate at GND. A correctly wired cell turns it on in both directions, so charging still
  works. A reversed one leaves it off, which saves the XIAO's charger.
- The carrier takes its 3.3 V from the XIAO and makes its own 1.8 V and LED supply.
- The XIAO's 5V pin is USB power directly: 0 V on battery, with a 100 kΩ pull-down on the XIAO.

The slide switch sits in the battery line, so the band charges only when switched on. That's the price
of a switch that also guarantees zero drain in a drawer or in the post.

**Budget.**

| Load | Average |
|---|---|
| ESP32-C6 streaming over Wi-Fi | ~60–100 mA (estimate). Seeed lists 30 mA in modem sleep. |
| ESP32-C6 streaming over BLE | tens of mA |
| MAX30101 with LEDs and boost | ~2–5 mA (estimate) |
| LSM6DSOX, ADS1115, op-amps, switch, TMP117, MAX17048 | ~0.8 mA |

600 mAh gives roughly 6–9 hours on Wi-Fi, comfortably more than a 4-hour night. Measure the real
draw with the firmware before settling on the cell.

**Charging.** The XIAO's charger is set to 120 mA (per Seeed's schematic), so a flat 600 mAh cell takes
about 5–6 hours. Charge the bands the day before.

## Clock and data

- **Clock.** Over Wi-Fi the band sets its clock from network time and re-syncs every few minutes.
  Unchecked, the crystal would drift about 0.3 s over 4 hours. Over Bluetooth it takes the player's PC
  clock. Every packet carries the clock time it was taken, a sequence number and the band's ID.
- **Dropouts.** If Wi-Fi drops, the band keeps sampling into RAM and sends the backlog on reconnect.
  The C6 has 512 KB of RAM and no PSRAM, so a full-rate buffer holds only about two minutes. If an
  outage runs longer, the band keeps only EDA, beats and temperature and drops raw PPG and motion,
  which stretches the buffer to about 20 minutes. Past that, the Bluetooth fallback takes over.
- **Wi-Fi.** Packets go over HTTPS or WebSocket to the hosted workbench, with a per-band token. This is
  the same direct path the plugin and voice relay will use (see the repo
  [README](../README.md#where-things-run)).
- **Bluetooth.**
  - For setup, ESP-IDF's BLE provisioning gives the band Wi-Fi details from a phone.
  - As a fallback, the band streams to a Web Bluetooth page in Chrome or Edge on the player's PC, which
    forwards to the workbench. The tab has to stay open.
- **Record shape.** Bands get their own `src` instead of reusing EmotiBit's, so no existing line shape
  breaks. Stream names match EmotiBit's (`EDA`, `PPG:IR`, `PPG:RED`, `PPG:GRN`, `ACC:X`, …, `THERM`,
  `HR`), so the workbench's [streams.ts](../workbench/src/session/streams.ts) table carries over. The
  exact line shape is settled with the firmware and the receiver intake.
- **Players.** The band's ID comes from its MAC address and is printed on the case. Mapping bands to
  players is the workbench's job, as it is for Discord ids.

## Schematic

[schematic/band.ts](schematic/band.ts) lists every part, its LCSC number and the net on each pin.
`deno task build` (in `schematic/`) writes three files to [schematic/out/](schematic/out/):
- `band-easyeda.json`: the schematic in EasyEDA Standard format
- `bom-jlcpcb.csv`: the JLCPCB BOM
- `netlist.txt`: every net and its pins, for review

Before writing, the build reads its own drawing back and fails if any pin isn't on exactly the net the
design gives it.

The drawing connects pins by name: each pin has a short wire and a net port. Nothing is routed by
hand, so nothing can be miswired by hand.

**Importing into EasyEDA Pro:**
1. Open or create a project.
2. Use File → Import → EasyEDA (Standard) and pick `band-easyeda.json`. Pro adds it to the open
   project.
3. Bind a footprint to each part. A schematic imported on its own arrives without footprints. Every
   part keeps its LCSC number as `Supplier Part`, so look up each one by that number. Symbol pin
   numbers are the datasheet's, so library footprints line up. Check these by hand:
   - **XIAO:** use a footprint whose pad 23 is BAT+ and pad 24 is BAT−.
   - **Exposed pads:** MAX17048 pad 9 and TPS61099 pad 7 are their exposed pads. Some footprints call
     that pad `EP` instead of a number.
   - **Slide switch:** pad 2 must be the centre (common) tail.
   - **Jack:** see [Open questions](#open-questions).
   - **No-buy parts:** E1/E2 (electrode contacts) and TP1–TP3 (test points) have no LCSC number.
     R13 is marked DNP. None of these is in the BOM.
4. Run the design check, then update the PCB from the schematic.

Bands need a fresh BOM after any change, so edit `band.ts` and rebuild rather than editing in
EasyEDA and letting the two drift.

## Ordering

The sensors are on the bottom and the XIAO is on top, which makes this a double-sided assembly.
JLCPCB's [price page](https://jlcpcb.com/help/article/pcb-assembly-price) (updated 2026-09-09) prices
Standard PCBA as follows:
- setup: $51.12 double-sided
- stencil: $16.42
- feeder loading: $1.53 per part
- joints: $0.0016 each

Spread over 8 bands, those fees come to about $15 a band. With about $35 of parts on the board, plus
the battery, case, strap and electrodes, a band costs roughly **$60–70, or $480–560 for 8**, before
shipping and import fees. The real number comes from JLC's quote once the BOM exists.

The stock risk is the MAX30101 (35 left at LCSC). Pre-order it, and the XIAO, through JLC's parts
service before the board order.

## Open questions

1. **Jack contacts.** XKB's drawing for the PJ-3701-SMT doesn't name its contacts. The mapping in the
   schematic is inferred from the contact positions: 4 tip, 3 ring, 1 and 2 sleeve, 5–6 detect closed
   with no plug. Check two or three loose jacks with a plug and a meter before the order.
2. **Battery connector polarity.** Pin 1 is BAT+ in the schematic. Match it to the cells you buy.
3. **Case and strap.** How the snap studs and the temperature contact pass through the case bottom,
   and the strap (Velcro, as on EmotiBit, or a watch strap).
4. **Where beats are detected.** Either on the band, sending `HR` and beat intervals as EmotiBit does,
   or in the workbench from raw PPG.
5. **Receiver and workbench intake** for band lines. This is a software follow-on, not part of the
   board.
