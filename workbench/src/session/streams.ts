/**
 * What each EmotiBit OSC address carries. The receiver stores OSC messages raw ({address, args, rx});
 * knowing the stream behind each address is what lets the workbench turn them back into samples.
 *
 * Addresses come from EmotiBit Oscilloscope's stock oscOutputSettings.xml ("/EmotiBit/0/<STREAM>").
 * Periodic streams arrive as one message per firmware packet, about every 100 ms, carrying every sample
 * taken since the last one; aperiodic streams carry one value per event (a heartbeat, a skin-conductance
 * response). Rates are the stock firmware's.
 */

export type StreamKind = "periodic" | "aperiodic" | "unknown";

export interface StreamInfo {
  label: string;
  unit: string;
  kind: StreamKind;
  /** Samples per second, for periodic streams. */
  hz?: number;
}

export const STREAMS: Record<string, StreamInfo> = {
  "EDA": { label: "electrodermal activity", unit: "µS", kind: "periodic", hz: 15 },
  "PPG:IR": { label: "PPG infrared", unit: "a.u.", kind: "periodic", hz: 25 },
  "PPG:RED": { label: "PPG red", unit: "a.u.", kind: "periodic", hz: 25 },
  "PPG:GRN": { label: "PPG green", unit: "a.u.", kind: "periodic", hz: 25 },
  "ACC:X": { label: "acceleration X", unit: "g", kind: "periodic", hz: 25 },
  "ACC:Y": { label: "acceleration Y", unit: "g", kind: "periodic", hz: 25 },
  "ACC:Z": { label: "acceleration Z", unit: "g", kind: "periodic", hz: 25 },
  "GYRO:X": { label: "rotation X", unit: "°/s", kind: "periodic", hz: 25 },
  "GYRO:Y": { label: "rotation Y", unit: "°/s", kind: "periodic", hz: 25 },
  "GYRO:Z": { label: "rotation Z", unit: "°/s", kind: "periodic", hz: 25 },
  "MAG:X": { label: "magnetic field X", unit: "µT", kind: "periodic", hz: 25 },
  "MAG:Y": { label: "magnetic field Y", unit: "µT", kind: "periodic", hz: 25 },
  "MAG:Z": { label: "magnetic field Z", unit: "µT", kind: "periodic", hz: 25 },
  "SCR:FREQ": { label: "skin-conductance responses per minute", unit: "/min", kind: "periodic", hz: 3 },
  "THERM": { label: "skin temperature (EmotiBit MD)", unit: "°C", kind: "periodic", hz: 7.5 },
  "HR": { label: "heart rate", unit: "bpm", kind: "aperiodic" },
  "SCR:AMP": { label: "skin-conductance response amplitude", unit: "µS", kind: "aperiodic" },
  "SCR:RIS": { label: "skin-conductance response rise time", unit: "s", kind: "aperiodic" },
};

/** Streams a healthy stock setup should always deliver; the others may legitimately be absent. */
export const EXPECTED_STREAMS = ["EDA", "PPG:IR", "ACC:X", "ACC:Y", "ACC:Z", "SCR:FREQ"];

export function streamInfo(stream: string): StreamInfo {
  return STREAMS[stream] ?? { label: stream, unit: "", kind: "unknown" };
}

/** "/EmotiBit/0/PPG:IR" → { device: "/EmotiBit/0", stream: "PPG:IR" }. */
export function splitAddress(address: string): { device: string; stream: string } {
  const cut = address.lastIndexOf("/");
  return cut <= 0 ? { device: "", stream: address } : { device: address.slice(0, cut), stream: address.slice(cut + 1) };
}
