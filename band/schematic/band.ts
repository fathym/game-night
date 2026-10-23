/**
 * The band's circuit: every part, its LCSC number, and the net on each pin. The design behind it is
 * in ../README.md and the firmware contract in ../FIRMWARE.md. Pin numbers come from each part's own
 * datasheet (the XIAO's from Seeed's XIAO-ESP32-C6-SMD footprint) and must match the footprint
 * bound in EasyEDA Pro. Footprint names are the ones EasyEDA's library uses for each LCSC number, so
 * `deno task diff-netlist` shows any part bound to a different one.
 *
 * A pin marked NC is unconnected on purpose and gets a no-connect flag; the build fails on any pin
 * that has neither a net nor NC.
 */

import type { Block, Part, Pin, Side } from "./easyeda.ts";

export const title = "game-night band";

/** Marks a pin as unconnected on purpose. */
const NC = "NC";

interface Stock {
  value: string;
  footprint: string;
  lcsc: string;
  manufacturer: string;
  mpn: string;
  jlcClass: "Basic Part" | "Extended Part";
}

const UNI = "UNI-ROYAL(厚声)";
const SAMSUNG = "SAMSUNG(三星)";

const resistor = (value: string, lcsc: string, mpn: string, basic = true, footprint = "R0402"): Stock => ({
  value,
  footprint,
  lcsc,
  manufacturer: UNI,
  mpn,
  jlcClass: basic ? "Basic Part" : "Extended Part",
});

const stock = {
  r0: resistor("0Ω", "C17168", "0402WGF0000TCE"),
  r1k: resistor("1kΩ", "C11702", "0402WGF1001TCE"),
  r2k2: resistor("2.2kΩ", "C25879", "0402WGF2201TCE"),
  r4k7: resistor("4.7kΩ", "C25900", "0402WGF4701TCE"),
  r6k8: resistor("6.8kΩ", "C25917", "0402WGF6801TCE", false),
  r10k: resistor("10kΩ", "C25744", "0402WGF1002TCE"),
  r100k: resistor("100kΩ", "C25741", "0402WGF1003TCE"),
  r270k: resistor("270kΩ", "C25770", "0402WGF2703TCE", false),
  r1m: resistor("1MΩ", "C26083", "0402WGF1004TCE"),
  r180k: resistor("180kΩ", "C22827", "0603WAF1803T5E", false, "R0603"),
  r49k9: resistor("49.9kΩ", "C23184", "0603WAF4992T5E", true, "R0603"),
  r68k: {
    value: "68kΩ 0.1%",
    footprint: "R0603",
    lcsc: "C705793",
    manufacturer: "YAGEO(国巨)",
    mpn: "RT0603BRD0768KL",
    jlcClass: "Extended Part",
  },
  c100n: {
    value: "100nF",
    footprint: "C0402",
    lcsc: "C1525",
    manufacturer: SAMSUNG,
    mpn: "CL05B104KO5NNNC",
    jlcClass: "Basic Part",
  },
  c1u: {
    value: "1uF",
    footprint: "C0402",
    lcsc: "C52923",
    manufacturer: SAMSUNG,
    mpn: "CL05A105KA5NQNC",
    jlcClass: "Basic Part",
  },
  c470n: {
    value: "470nF",
    footprint: "C0603",
    lcsc: "C1623",
    manufacturer: SAMSUNG,
    mpn: "CL10B474KA8NNNC",
    jlcClass: "Basic Part",
  },
  c10u: {
    value: "10uF",
    footprint: "C0603",
    lcsc: "C96446",
    manufacturer: SAMSUNG,
    mpn: "CL10A106MA8NRNC",
    jlcClass: "Basic Part",
  },
  c22u: {
    value: "22uF",
    footprint: "C0805",
    lcsc: "C602037",
    manufacturer: SAMSUNG,
    mpn: "CL21A226MAYNNNE",
    jlcClass: "Extended Part",
  },
  l2u2: {
    value: "2.2uH",
    footprint: "L0806",
    lcsc: "C79317",
    manufacturer: "Murata",
    mpn: "DFE201612P-2R2M=P2",
    jlcClass: "Extended Part",
  },
} satisfies Record<string, Stock>;

type TwoPin = "resistor" | "capacitor" | "inductor";

/** A two-pin passive: pin 1 on the left, pin 2 on the right. */
function two(ref: string, s: Stock, a: string, b: string, kind: TwoPin, dnp?: string): Part {
  return {
    ref,
    value: dnp ? `${s.value} DNP, ${dnp}` : s.value,
    footprint: s.footprint,
    ...(dnp ? {} : { lcsc: s.lcsc, manufacturer: s.manufacturer, mpn: s.mpn, jlcClass: s.jlcClass }),
    kind,
    pins: [
      { num: "1", name: "1", side: "L", net: a },
      { num: "2", name: "2", side: "R", net: b },
    ],
  };
}
const R = (ref: string, s: Stock, a: string, b: string) => two(ref, s, a, b, "resistor");
const C = (ref: string, s: Stock, a: string, b = "GND") => two(ref, s, a, b, "capacitor");
const L = (ref: string, s: Stock, a: string, b: string) => two(ref, s, a, b, "inductor");

/** Pins as [number, name, side, net]; NC marks a pin left unconnected on purpose. */
const pins = (...rows: [string, string, Side, string][]): Pin[] =>
  rows.map(([num, name, side, net]) => net === NC ? { num, name, side, nc: true } : { num, name, side, net });

/** A single-pad feature with no part to buy: an electrode contact, a test point, a skin pad. */
const pad = (ref: string, value: string, footprint: string, net: string): Part => ({
  ref,
  value,
  footprint,
  kind: "box",
  pins: pins(["1", "1", "L", net]),
});

const power: Block = {
  title: "Battery, reverse protection, fuel gauge, USB sense",
  parts: [
    {
      ref: "J1",
      value: "SM02B-SRSS-TB (check cell polarity)",
      footprint: "CONN-SMD_2P-P1.00_SM02B-SRSS-TB-LF-SN",
      lcsc: "C160402",
      manufacturer: "JST",
      mpn: "SM02B-SRSS-TB(LF)(SN)",
      jlcClass: "Extended Part",
      kind: "box",
      pins: pins(["1", "BAT+", "R", "BAT_IN"], ["2", "BAT-", "R", "GND"]),
    },
    {
      ref: "SW1",
      value: "MK-12C02-G020",
      footprint: "SW-SMD_MK-12C02-G020",
      lcsc: "C963206",
      manufacturer: "G-Switch",
      mpn: "MK-12C02-G020",
      jlcClass: "Extended Part",
      kind: "box",
      pins: pins(["1", "A", "L", "BAT_IN"], ["2", "COM", "R", "BAT_SW"], ["3", "B", "L", NC]),
    },
    {
      ref: "Q1",
      value: "AO3401A",
      footprint: "SOT-23_L2.9-W1.3-P1.90-LS2.4-BR",
      lcsc: "C15127",
      manufacturer: "AOS",
      mpn: "AO3401A",
      jlcClass: "Basic Part",
      kind: "box",
      pins: pins(["3", "D", "L", "BAT_SW"], ["1", "G", "L", "GND"], ["2", "S", "R", "VBAT"]),
    },
    C("C1", stock.c10u, "VBAT"),
    {
      ref: "U2",
      value: "MAX17048G+T10",
      footprint: "TDFN-8_L2.0-W2.0-P0.50-BL-EP1.2",
      lcsc: "C2682616",
      manufacturer: "ADI/MAXIM",
      mpn: "MAX17048G+T10",
      jlcClass: "Extended Part",
      i2c: "0x36",
      kind: "box",
      pins: pins(
        ["3", "VDD", "L", "VBAT"],
        ["2", "CELL", "L", "VBAT"],
        ["1", "CTG", "L", "GND"],
        ["6", "QSTRT", "L", "GND"],
        ["4", "GND", "L", "GND"],
        ["9", "EP", "L", "GND"],
        ["8", "SDA", "R", "SDA"],
        ["7", "SCL", "R", "SCL"],
        ["5", "ALRT", "R", "GAUGE_ALRT"],
      ),
    },
    C("C2", stock.c100n, "VBAT"),
    // 0.6 x VBUS, and stiff enough that the XIAO's warm VBUS diode leakage can't lift it on battery.
    R("R1", stock.r6k8, "VBUS", "VBUS_DIV"),
    R("R2", stock.r10k, "VBUS_DIV", "GND"),
  ],
};

const mcu: Block = {
  title: "XIAO ESP32C6 with Seeed's pad numbers (underside pads 15, 16, 18, 19, 20, 22 unused)",
  parts: [
    {
      ref: "U1",
      value: "XIAO ESP32C6",
      // JLC's footprint for C9900124963, with its underside pads renumbered to Seeed's (see the README).
      footprint: "LCC-14P_L17.7-W20.8-XIAO-ESP32-C6",
      lcsc: "C27675191",
      manufacturer: "Seeed Studio",
      mpn: "113991254",
      jlcClass: "Extended Part",
      kind: "box",
      pins: pins(
        ["1", "D0", "L", "PPG_INT"],
        ["2", "D1", "L", "IMU_INT"],
        ["3", "D2", "L", "VLED_EN"],
        ["4", "D3", "L", "VBUS_DIV"],
        ["5", "D4/SDA", "L", "SDA"],
        ["6", "D5/SCL", "L", "SCL"],
        ["7", "D6/TX", "L", "STATUS_LED"],
        ["17", "EN", "L", "XIAO_EN"],
        ["21", "BOOT", "L", "XIAO_BOOT"],
        ["14", "5V", "R", "VBUS"],
        ["13", "GND", "R", "GND"],
        ["12", "3V3", "R", "3V3"],
        ["11", "D10", "R", "GAUGE_ALRT"],
        ["10", "D9", "R", "ADC_RDY"],
        ["9", "D8", "R", "PLUG_DET"],
        ["8", "D7/RX", "R", NC],
        ["23", "BAT+", "R", "VBAT"],
        ["24", "BAT-", "R", "GND"],
      ),
    },
    R("R3", stock.r2k2, "SDA", "3V3"),
    R("R4", stock.r2k2, "SCL", "3V3"),
    R("R5", stock.r4k7, "PPG_INT", "3V3"),
    R("R6", stock.r10k, "ADC_RDY", "3V3"),
    R("R7", stock.r10k, "GAUGE_ALRT", "3V3"),
    R("R8", stock.r100k, "PLUG_DET", "3V3"),
    // D2 has no pull at or after reset, so this keeps the LED boost off through boot.
    R("R9", stock.r100k, "VLED_EN", "GND"),
    {
      ref: "D5",
      value: "KT-0603R status",
      footprint: "LED-SMD_L1.6-W0.8-R-RD",
      lcsc: "C2286",
      manufacturer: "Hubei KENTO Elec",
      mpn: "KT-0603R",
      jlcClass: "Basic Part",
      kind: "box",
      pins: pins(["1", "A", "L", "LED_A"], ["2", "K", "R", "STATUS_LED"]),
    },
    R("R23", stock.r1k, "3V3", "LED_A"),
    pad("TP4", "BOOT", "TP_1.0mm", "XIAO_BOOT"),
    pad("TP5", "EN", "TP_1.0mm", "XIAO_EN"),
  ],
};

const ppgPower: Block = {
  title: "PPG supplies: 4.7 V boost for the LEDs, 1.8 V for the core",
  parts: [
    {
      ref: "U3",
      value: "TPS61099DRVR",
      footprint: "WSON-6_L2.0-W2.0-P0.65-TL-EP",
      lcsc: "C2842395",
      manufacturer: "TI",
      mpn: "TPS61099DRVR",
      jlcClass: "Extended Part",
      kind: "box",
      pins: pins(
        ["6", "VIN", "L", "VBAT"],
        ["5", "SW", "L", "SW_BOOST"],
        ["4", "EN", "L", "VLED_EN"],
        ["1", "GND", "L", "GND"],
        ["7", "EP", "L", "GND"],
        ["2", "VOUT", "R", "VBOOST"],
        ["3", "FB", "R", "FB_BOOST"],
      ),
    },
    L("L1", stock.l2u2, "VBAT", "SW_BOOST"),
    C("C4", stock.c10u, "VBAT"),
    C("C5", stock.c22u, "VBOOST"),
    C("C6", stock.c22u, "VBOOST"),
    // 1.00 V x (1 + 1M/270k) = 4.70 V in PWM, about 4.85 V at light load: inside both LED windows.
    R("R10", stock.r1m, "VBOOST", "FB_BOOST"),
    R("R11", stock.r270k, "FB_BOOST", "GND"),
    R("R12", stock.r0, "VBOOST", "VLED"),
    two("R13", stock.r0, "3V3", "VLED", "resistor", "fit only with R12 removed"),
    {
      ref: "U4",
      value: "XC6206P182MR",
      footprint: "SOT-23-3_L2.9-W1.6-P1.90-LS2.8-BR",
      lcsc: "C21659",
      manufacturer: "TOREX",
      mpn: "XC6206P182MR",
      jlcClass: "Extended Part",
      kind: "box",
      pins: pins(["3", "VIN", "L", "3V3"], ["1", "VSS", "L", "GND"], ["2", "VOUT", "R", "1V8"]),
    },
    C("C7", stock.c1u, "3V3"),
  ],
};

const ppg: Block = {
  title: "PPG (skin side, under its window)",
  parts: [
    {
      ref: "U5",
      value: "MAX30101EFD+T",
      footprint: "OESIP-14_L5.6-W3.3-P0.80-TL",
      lcsc: "C2859066",
      manufacturer: "ADI/MAXIM",
      mpn: "MAX30101EFD+T",
      jlcClass: "Extended Part",
      i2c: "0x57",
      kind: "box",
      pins: pins(
        ["11", "VDD", "L", "1V8"],
        ["9", "VLED+", "L", "VLED"],
        ["10", "VLED+", "L", "VLED"],
        ["12", "GND", "L", "GND"],
        ["4", "PGND", "L", "GND"],
        ["1", "NC", "L", NC],
        ["5", "NC", "L", NC],
        ["3", "SDA", "R", "SDA"],
        ["2", "SCL", "R", "SCL"],
        ["13", "INT", "R", "PPG_INT"],
        ["6", "NC", "R", NC],
        ["7", "NC", "R", NC],
        ["8", "NC", "R", NC],
        ["14", "NC", "R", NC],
      ),
    },
    C("C8", stock.c10u, "1V8"),
    C("C9", stock.c100n, "1V8"),
    C("C10", stock.c10u, "VLED"),
    C("C11", stock.c100n, "VLED"),
  ],
};

const sensors: Block = {
  title: "Motion and skin temperature (TMP117 on top of a slotted tab)",
  parts: [
    {
      ref: "U6",
      value: "LSM6DSOXTR",
      footprint: "LGA-14L_L3.0-W2.5-P0.50-TL",
      lcsc: "C481766",
      manufacturer: "ST",
      mpn: "LSM6DSOXTR",
      jlcClass: "Extended Part",
      i2c: "0x6A",
      kind: "box",
      pins: pins(
        ["8", "VDD", "L", "3V3"],
        ["5", "VDDIO", "L", "3V3"],
        ["12", "CS", "L", "3V3"],
        ["1", "SDO/SA0", "L", "GND"],
        ["2", "SDX", "L", "GND"],
        ["3", "SCX", "L", "GND"],
        ["6", "GND", "L", "GND"],
        ["7", "GND", "L", "GND"],
        ["14", "SDA", "R", "SDA"],
        ["13", "SCL", "R", "SCL"],
        // INT2, not INT1: INT1 must sit low at power-on or the part starts in I3C-only mode.
        ["9", "INT2", "R", "IMU_INT"],
        ["4", "INT1", "R", NC],
        ["10", "OCS_AUX", "R", NC],
        ["11", "SDO_AUX", "R", NC],
      ),
    },
    C("C12", stock.c100n, "3V3"),
    C("C13", stock.c100n, "3V3"),
    {
      ref: "U7",
      value: "TMP117AIDRVR",
      footprint: "WSON-6_L2.0-W2.0-P0.65-TL-EP",
      lcsc: "C699536",
      manufacturer: "TI",
      mpn: "TMP117AIDRVR",
      jlcClass: "Extended Part",
      i2c: "0x49",
      kind: "box",
      pins: pins(
        ["5", "V+", "L", "3V3"],
        ["4", "ADD0", "L", "3V3"],
        ["2", "GND", "L", "GND"],
        // The thermal pad isn't tied to device ground. It solders to a floating land that vias join
        // to TC1, the skin-side pad, so skin heat reaches the die; TEMP_PAD carries no circuit.
        ["7", "EP", "L", "TEMP_PAD"],
        ["6", "SDA", "R", "SDA"],
        ["1", "SCL", "R", "SCL"],
        ["3", "ALERT", "R", NC],
      ),
    },
    C("C14", stock.c100n, "3V3"),
    pad("TC1", "Skin temperature pad, no circuit net", "TEMP_SKIN_PAD", "TEMP_PAD"),
  ],
};

const eda: Block = {
  title: "EDA front end: 0.5 V across the skin, current to voltage, 16-bit ADC",
  parts: [
    R("R14", stock.r180k, "3V3", "V15"),
    R("R15", stock.r49k9, "V15", "V10"),
    R("R16", stock.r100k, "V10", "GND"),
    C("C15", stock.c1u, "V15"),
    C("C16", stock.c1u, "V10"),
    {
      ref: "U8",
      value: "OPA2333AIDGKR",
      footprint: "MSOP-8_L3.0-W3.0-P0.65-LS5.0-BL",
      lcsc: "C19608",
      manufacturer: "TI",
      mpn: "OPA2333AIDGKR",
      jlcClass: "Extended Part",
      kind: "box",
      pins: pins(
        ["3", "+INA", "L", "V10"],
        ["2", "-INA", "L", "EXC_DRV"],
        ["5", "+INB", "L", "V15"],
        ["6", "-INB", "L", "SENSE_IN"],
        ["8", "V+", "L", "3V3"],
        ["4", "V-", "L", "GND"],
        ["1", "OUTA", "R", "EXC_DRV"],
        ["7", "OUTB", "R", "EDA_OUT"],
      ),
    },
    C("C17", stock.c100n, "3V3"),
    R("R17", stock.r68k, "SENSE_IN", "EDA_OUT"),
    C("C18", stock.c470n, "SENSE_IN", "EDA_OUT"),
    // Anti-alias RC at the ADC: 1.6 kHz corner, -44 dB at the 250 kHz modulator, nothing at 60 Hz.
    R("R22", stock.r1k, "EDA_OUT", "EDA_ADC"),
    C("C21", stock.c100n, "EDA_ADC", "V15"),
    {
      ref: "U9",
      value: "ADS1115IDGSR",
      footprint: "MSOP-10_L3.0-W3.0-P0.50-LS5.0-BL",
      lcsc: "C37593",
      manufacturer: "TI",
      mpn: "ADS1115IDGSR",
      jlcClass: "Extended Part",
      i2c: "0x48",
      kind: "box",
      pins: pins(
        ["4", "AIN0", "L", "EDA_ADC"],
        ["5", "AIN1", "L", "V15"],
        ["6", "AIN2", "L", "V15"],
        ["7", "AIN3", "L", "V10"],
        ["8", "VDD", "L", "3V3"],
        ["3", "GND", "L", "GND"],
        ["1", "ADDR", "L", "GND"],
        ["9", "SDA", "R", "SDA"],
        ["10", "SCL", "R", "SCL"],
        ["2", "ALERT/RDY", "R", "ADC_RDY"],
      ),
    },
    C("C19", stock.c100n, "3V3"),
    pad("TP1", "EDA_OUT", "TP_1.0mm", "EDA_OUT"),
    pad("TP2", "V15", "TP_1.0mm", "V15"),
    pad("TP3", "V10", "TP_1.0mm", "V10"),
  ],
};

const esd = (ref: string, net: string): Part => ({
  ref,
  value: "ESD321DPYR",
  footprint: "X1SON-2_L1.0-W0.6-P0.65-RD-1",
  lcsc: "C2868952",
  manufacturer: "TI",
  mpn: "ESD321DPYR",
  jlcClass: "Extended Part",
  kind: "box",
  pins: pins(["1", "IO", "L", net], ["2", "GND", "R", "GND"]),
});

const electrodes: Block = {
  title: "Electrodes: wrist contacts or the finger lead, opened while USB power is present",
  parts: [
    {
      ref: "U10",
      value: "TMUX1133PWR",
      footprint: "TSSOP-16_L5.0-W4.4-P0.65-LS6.4-BL",
      lcsc: "C1849385",
      manufacturer: "TI",
      mpn: "TMUX1133PWR",
      jlcClass: "Extended Part",
      kind: "box",
      pins: pins(
        ["14", "D1", "L", "EXC_DRV"],
        ["15", "D2", "L", "SENSE_IN"],
        ["11", "SEL1", "L", "PLUG_DET"],
        ["10", "SEL2", "L", "PLUG_DET"],
        ["6", "EN_N", "L", "VBUS_DIV"],
        ["16", "VDD", "L", "3V3"],
        ["7", "VSS", "L", "GND"],
        ["8", "GND", "L", "GND"],
        ["9", "SEL3", "L", "GND"],
        ["4", "D3", "L", "GND"],
        ["12", "S1A", "R", "WRIST_A_P"],
        ["13", "S1B", "R", "JACK_TIP_P"],
        ["2", "S2A", "R", "WRIST_B_P"],
        ["1", "S2B", "R", "JACK_RING_P"],
        ["5", "S3A", "R", "GND"],
        ["3", "S3B", "R", "GND"],
      ),
    },
    C("C20", stock.c100n, "3V3"),
    R("R18", stock.r1k, "WRIST_A", "WRIST_A_P"),
    R("R19", stock.r1k, "WRIST_B", "WRIST_B_P"),
    R("R20", stock.r1k, "JACK_TIP", "JACK_TIP_P"),
    R("R21", stock.r1k, "JACK_RING", "JACK_RING_P"),
    esd("D1", "WRIST_A"),
    esd("D2", "WRIST_B"),
    esd("D3", "JACK_TIP"),
    esd("D4", "JACK_RING"),
    pad("E1", "Wrist contact A (Ag/AgCl disc)", "ELECTRODE_CONTACT", "WRIST_A"),
    pad("E2", "Wrist contact B (Ag/AgCl disc)", "ELECTRODE_CONTACT", "WRIST_B"),
    {
      ref: "J2",
      value: "PJ-3701-SMT finger lead",
      footprint: "AUDIO-SMD_PJ-3701-SMT",
      lcsc: "C2684645",
      manufacturer: "XKB Connection",
      mpn: "PJ-3701-SMT",
      jlcClass: "Extended Part",
      kind: "box",
      pins: pins(
        ["4", "TIP", "L", "JACK_TIP"],
        ["3", "RING1", "L", "JACK_RING"],
        ["2", "RING2", "L", "JACK_SLV"],
        ["1", "SLEEVE", "L", "JACK_SLV"],
        ["5", "DET", "R", "PLUG_DET"],
        ["6", "DET", "R", "GND"],
      ),
    },
  ],
};

export const blocks: Block[] = [mcu, eda, power, electrodes, ppgPower, ppg, sensors];
