/**
 * The band's circuit: every part, its LCSC number, and the net on each pin. The design behind it is
 * in ../README.md. Pin numbers come from each part's own datasheet (the XIAO's from Seeed's
 * XIAO-ESP32-C6-SMD footprint) and must match the footprint bound in EasyEDA Pro.
 */

import type { Block, Part, Pin, Side } from "./easyeda.ts";

export const title = "game-night band";

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

const stock = {
  r0: {
    value: "0Ω",
    footprint: "R0402",
    lcsc: "C17168",
    manufacturer: UNI,
    mpn: "0402WGF0000TCE",
    jlcClass: "Basic Part",
  },
  r1k: {
    value: "1kΩ",
    footprint: "R0402",
    lcsc: "C11702",
    manufacturer: UNI,
    mpn: "0402WGF1001TCE",
    jlcClass: "Basic Part",
  },
  r4k7: {
    value: "4.7kΩ",
    footprint: "R0402",
    lcsc: "C25900",
    manufacturer: UNI,
    mpn: "0402WGF4701TCE",
    jlcClass: "Basic Part",
  },
  r10k: {
    value: "10kΩ",
    footprint: "R0402",
    lcsc: "C25744",
    manufacturer: UNI,
    mpn: "0402WGF1002TCE",
    jlcClass: "Basic Part",
  },
  r100k: {
    value: "100kΩ",
    footprint: "R0402",
    lcsc: "C25741",
    manufacturer: UNI,
    mpn: "0402WGF1003TCE",
    jlcClass: "Basic Part",
  },
  r1m: {
    value: "1MΩ",
    footprint: "R0402",
    lcsc: "C26083",
    manufacturer: UNI,
    mpn: "0402WGF1004TCE",
    jlcClass: "Basic Part",
  },
  r270k: {
    value: "270kΩ",
    footprint: "R0402",
    lcsc: "C25770",
    manufacturer: UNI,
    mpn: "0402WGF2703TCE",
    jlcClass: "Extended Part",
  },
  r180k: {
    value: "180kΩ",
    footprint: "R0603",
    lcsc: "C22827",
    manufacturer: UNI,
    mpn: "0603WAF1803T5E",
    jlcClass: "Extended Part",
  },
  r49k9: {
    value: "49.9kΩ",
    footprint: "R0603",
    lcsc: "C23184",
    manufacturer: UNI,
    mpn: "0603WAF4992T5E",
    jlcClass: "Basic Part",
  },
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
    lcsc: "C45783",
    manufacturer: SAMSUNG,
    mpn: "CL21A226MAQNNNE",
    jlcClass: "Basic Part",
  },
  l2u2: {
    value: "2.2uH",
    footprint: "IND-SMD_L2.0-W1.6",
    lcsc: "C79317",
    manufacturer: "Murata",
    mpn: "DFE201612P-2R2M=P2",
    jlcClass: "Extended Part",
  },
} satisfies Record<string, Stock>;

/** A two-pin passive: pin 1 on the left, pin 2 on the right. */
function two(ref: string, s: Stock, a: string, b: string, kind: "resistor" | "capacitor", dnp = false): Part {
  return {
    ref,
    value: dnp ? `${s.value} DNP` : s.value,
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

/** Pins as [number, name, side, net?]; a missing net means unconnected on purpose. */
const pins = (...rows: [string, string, Side, string?][]): Pin[] =>
  rows.map(([num, name, side, net]) => ({ num, name, side, ...(net ? { net } : {}) }));

/** A single-pad feature with no part to buy: an electrode contact or a test point. */
const pad = (ref: string, value: string, footprint: string, net: string): Part => ({
  ref,
  value,
  footprint,
  kind: "box",
  pins: pins(["1", "1", "L", net]),
});

const power: Block = {
  title: "Battery (check JST polarity), reverse protection, fuel gauge, USB sense",
  parts: [
    {
      ref: "J1",
      value: "S2B-PH-SM4-TB",
      footprint: "CONN-SMD_JST_S2B-PH-SM4-TB",
      lcsc: "C295747",
      manufacturer: "JST",
      mpn: "S2B-PH-SM4-TB(LF)(SN)",
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
      pins: pins(["1", "A", "L", "BAT_IN"], ["2", "COM", "R", "BAT_SW"], ["3", "B", "L"]),
    },
    {
      ref: "Q1",
      value: "AO3401A",
      footprint: "SOT-23-3_L2.9-W1.3-P1.90-LS2.4-BR",
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
      footprint: "TDFN-8_L2.0-W2.0-P0.50-EP",
      lcsc: "C2682616",
      manufacturer: "ADI/MAXIM",
      mpn: "MAX17048G+T10",
      jlcClass: "Extended Part",
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
    R("R1", stock.r100k, "VBUS", "VBUS_DIV"),
    R("R2", stock.r100k, "VBUS_DIV", "GND"),
  ],
};

const mcu: Block = {
  title: "XIAO ESP32C6 (pads 15-22 under the board stay unconnected)",
  parts: [
    {
      ref: "U1",
      value: "XIAO ESP32C6",
      footprint: "XIAO-ESP32-C6-SMD",
      lcsc: "C9900124963",
      manufacturer: "Seeed Studio",
      mpn: "XIAO-ESP32-C6",
      jlcClass: "Extended Part",
      kind: "box",
      pins: pins(
        ["1", "D0", "L", "PPG_INT"],
        ["2", "D1", "L", "IMU_INT"],
        ["3", "D2", "L", "ADC_RDY"],
        ["4", "D3", "L", "VBUS_DIV"],
        ["5", "D4/SDA", "L", "SDA"],
        ["6", "D5/SCL", "L", "SCL"],
        ["7", "D6/TX", "L"],
        ["14", "5V", "R", "VBUS"],
        ["13", "GND", "R", "GND"],
        ["12", "3V3", "R", "3V3"],
        ["11", "D10", "R", "GAUGE_ALRT"],
        ["10", "D9", "R", "VLED_EN"],
        ["9", "D8", "R", "PLUG_DET"],
        ["8", "D7/RX", "R"],
        ["23", "BAT+", "R", "VBAT"],
        ["24", "BAT-", "R", "GND"],
      ),
    },
    C("C3", stock.c10u, "3V3"),
    R("R3", stock.r4k7, "SDA", "3V3"),
    R("R4", stock.r4k7, "SCL", "3V3"),
    R("R5", stock.r4k7, "PPG_INT", "3V3"),
    R("R6", stock.r10k, "ADC_RDY", "3V3"),
    R("R7", stock.r10k, "GAUGE_ALRT", "3V3"),
    R("R8", stock.r100k, "PLUG_DET", "3V3"),
    R("R9", stock.r100k, "VLED_EN", "GND"),
  ],
};

const ppgPower: Block = {
  title: "PPG supplies: 5 V boost for the LEDs, 1.8 V for the core",
  parts: [
    {
      ref: "U3",
      value: "TPS61099DRVR",
      footprint: "WSON-6_L2.0-W2.0-P0.65-EP",
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
        ["2", "VOUT", "R", "V5_LED"],
        ["3", "FB", "R", "FB_BOOST"],
      ),
    },
    R("L1", stock.l2u2, "VBAT", "SW_BOOST"),
    C("C4", stock.c10u, "VBAT"),
    C("C5", stock.c22u, "V5_LED"),
    C("C6", stock.c22u, "V5_LED"),
    R("R10", stock.r1m, "V5_LED", "FB_BOOST"),
    R("R11", stock.r270k, "FB_BOOST", "GND"),
    R("R12", stock.r0, "V5_LED", "VLED"),
    two("R13", stock.r0, "3V3", "VLED", "resistor", true),
    {
      ref: "U4",
      value: "XC6206P182MR",
      footprint: "SOT-23-3_L2.9-W1.3-P1.90-LS2.4-BR",
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
  title: "PPG (on the skin side)",
  parts: [
    {
      ref: "U5",
      value: "MAX30101EFD+T",
      footprint: "OESIP-14_L5.6-W3.3-P0.80-TL",
      lcsc: "C2859066",
      manufacturer: "ADI/MAXIM",
      mpn: "MAX30101EFD+T",
      jlcClass: "Extended Part",
      kind: "box",
      pins: pins(
        ["11", "VDD", "L", "1V8"],
        ["9", "VLED+", "L", "VLED"],
        ["10", "VLED+", "L", "VLED"],
        ["12", "GND", "L", "GND"],
        ["4", "PGND", "L", "GND"],
        ["1", "NC", "L"],
        ["5", "NC", "L"],
        ["3", "SDA", "R", "SDA"],
        ["2", "SCL", "R", "SCL"],
        ["13", "INT", "R", "PPG_INT"],
        ["6", "NC", "R"],
        ["7", "NC", "R"],
        ["8", "NC", "R"],
        ["14", "NC", "R"],
      ),
    },
    C("C8", stock.c10u, "1V8"),
    C("C9", stock.c100n, "1V8"),
    C("C10", stock.c10u, "VLED"),
    C("C11", stock.c100n, "VLED"),
  ],
};

const sensors: Block = {
  title: "Motion and skin temperature",
  parts: [
    {
      ref: "U6",
      value: "LSM6DSOXTR",
      footprint: "LGA-14_L3.0-W2.5-P0.50",
      lcsc: "C481766",
      manufacturer: "ST",
      mpn: "LSM6DSOXTR",
      jlcClass: "Extended Part",
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
        ["9", "INT2", "R", "IMU_INT"],
        ["4", "INT1", "R"],
        ["10", "OCS_AUX", "R"],
        ["11", "SDO_AUX", "R"],
      ),
    },
    C("C12", stock.c100n, "3V3"),
    C("C13", stock.c100n, "3V3"),
    {
      ref: "U7",
      value: "TMP117AIDRVR",
      footprint: "WSON-6_L2.0-W2.0-P0.65",
      lcsc: "C699536",
      manufacturer: "TI",
      mpn: "TMP117AIDRVR",
      jlcClass: "Extended Part",
      kind: "box",
      pins: pins(
        ["5", "V+", "L", "3V3"],
        ["4", "ADD0", "L", "3V3"],
        ["2", "GND", "L", "GND"],
        ["6", "SDA", "R", "SDA"],
        ["1", "SCL", "R", "SCL"],
        ["3", "ALERT", "R"],
      ),
    },
    C("C14", stock.c100n, "3V3"),
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
      footprint: "VSSOP-8_L3.0-W3.0-P0.65",
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
    {
      ref: "U9",
      value: "ADS1115IDGSR",
      footprint: "VSSOP-10_L3.0-W3.0-P0.50",
      lcsc: "C37593",
      manufacturer: "TI",
      mpn: "ADS1115IDGSR",
      jlcClass: "Extended Part",
      kind: "box",
      pins: pins(
        ["4", "AIN0", "L", "EDA_OUT"],
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
  footprint: "X1SON-2_L1.0-W0.6",
  lcsc: "C2868952",
  manufacturer: "TI",
  mpn: "ESD321DPYR",
  jlcClass: "Extended Part",
  kind: "box",
  pins: pins(["1", "IO", "L", net], ["2", "GND", "R", "GND"]),
});

const electrodes: Block = {
  title: "Electrodes: wrist snaps or the jack, opened while USB power is present",
  parts: [
    {
      ref: "U10",
      value: "TMUX1133PWR",
      footprint: "TSSOP-16_L5.0-W4.4-P0.65",
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
    pad("E1", "Wrist electrode A", "ELECTRODE_SNAP", "WRIST_A"),
    pad("E2", "Wrist electrode B", "ELECTRODE_SNAP", "WRIST_B"),
    {
      ref: "J2",
      value: "PJ-3701-SMT",
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
