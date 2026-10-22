# Band firmware contract

What the band's firmware must do. No firmware exists yet; this is the contract it is written against,
and what the workbench intake can rely on. The hardware it runs on is in [README.md](README.md) and
[schematic/band.ts](schematic/band.ts).

## Platform

- **SDK.** ESP-IDF on the XIAO ESP32C6 (ESP32-C6, 4 MB flash, 512 KB RAM, no PSRAM).
- **Radio.** Wi-Fi only. The Bluetooth controller is never started. Bluetooth is not used for setup
  either; the radio shares the 2.4 GHz band with Wi-Fi and has no job here.
- **Partitions.** Two OTA app slots (about 1.5 MB each) and a data partition for the outage buffer
  (about 0.9 MB), plus NVS. There is no factory slot. Updates go over USB with a web flasher until
  OpenX has device updates; the two slots are reserved now so over-the-air updates can come later
  without re-partitioning.
- **Console** on the C6's USB Serial/JTAG, never on UART0. UART0 TX is D6, which drives the status
  LED.

## Boot sequence

1. Hold `VLED_EN` (D2) low, and release any deep-sleep hold on it.
2. Increment and store the boot counter. This is the only flash write before the session ends.
3. Drive GPIO3 low (powers the XIAO's RF switch; a 10 kΩ pull-up on the XIAO holds it off) and
   GPIO14 low (selects the ceramic antenna). ESP-IDF has no board code that does this.
4. Read the MAX17048 (VCELL, SOC). Below the low-battery threshold, go straight to deep sleep (see
   [Power](#power)).
5. Configure the sensors, then start Wi-Fi.

## Provisioning

Two kinds of secret, loaded by two people:

| NVS key | Set by | How |
|---|---|---|
| `band` | Host | Printed band ID, e.g. `B03` |
| `hub`, `device`, `key` | Host | The band's OpenX Data Connection: IoT Hub host name, device ID and primary key |
| `wifi` | Player | SSID and password, up to 3 networks |

- **The host, over USB**, before a band ships. A small Web Serial page (Chrome or Edge) talks to
  the band's USB Serial/JTAG port and writes the band ID and the Data Connection's device key. Players
  never see the key.
- **The player, over the setup hotspot.** If the band has no saved network, or can't join any for 2
  minutes, it opens a Wi-Fi network named `GameNight-B03` (password printed on the band) for 10
  minutes. Joining it from any phone or PC opens a captive-portal page at `http://192.168.4.1` to
  enter the home network. The same setup is reachable over USB through the Web Serial tool, using the
  Improv serial protocol, as a backup.
- **2.4 GHz only.** If the router has separate 2.4 and 5 GHz network names, the player picks the 2.4
  GHz one. WPA2/WPA3 personal and enterprise both work.

NVS is encrypted (flash encryption in release mode). The device key never leaves the band.

## Connection to OpenX

Each band is one OpenX Data Connection, which is one IoT Hub device. Data lands in the workspace's
ADX table `Devices(DeviceID, EnqueuedTime, MessageID, RawData)`, with the message body in `RawData`.

**MQTT is the main path:**
- MQTT 3.1.1 over TLS 1.2 on port 8883 to `{hub}`.
- Client ID `{device}`; username `{hub}/{device}/?api-version=2020-09-30`.
- Password: a SAS token the band mints itself. HMAC-SHA256 with the device key over
  `{url-encoded hub/devices/device}\n{expiry}`, with a 1-hour expiry, renewed at 80%. Never store a
  minted token, and never use the 7-day token OpenX's inspector shows.
- Trust only DigiCert Global Root G2 and Microsoft RSA Root CA 2017. Don't pin intermediates or the
  leaf; Microsoft rotates them.
- Publish telemetry to `devices/{device}/messages/events/` at QoS 1, with the property bag
  `$.ct=application%2Fjson&$.ce=utf-8`.

**HTTPS is the fallback.** If MQTT fails three times in a row (some networks block 8883), the band
POSTs each message to `https://{hub}/devices/{device}/messages/events?api-version=2020-09-30` with
the SAS token in `Authorization`. It retries MQTT every 10 minutes. HTTPS can't receive twin updates,
so on HTTPS the band polls `GET .../twins/{device}` once a minute.

**Reconnect.** Back off exponentially from 2 s to 5 minutes, with jitter. On every connect: run a
clock-sync burst, send a `hello` event, fetch the twin, then send the backlog.

**Message size.** Each message stays under 4 KB, which is IoT Hub's metering unit. Eight bands
sending one message a second for a 4-hour night is about 115,000 messages, well inside one S1 unit's
400,000 a day.

## Recording control

The band streams only while its device twin says so:

| Desired property | Type | Meaning |
|---|---|---|
| `recording` | bool | Stream data. Set by the voice bot on `/gamenight start` and `stop`. |
| `session` | string | Session ID, copied into every data message |
| `rawAcc` | bool | Opt-in raw accelerometer (see [Streams](#streams)) |

- **Subscribe** to `$iothub/twin/PATCH/properties/desired/#` and `$iothub/twin/res/#`, and fetch the
  full twin at connect with `$iothub/twin/GET/?$rid={n}`.
- **Report** `recording`, `session`, firmware version and boot counter in reported properties after
  every change.
- **Tags.** OpenX keeps routing tags (`WorkspaceLookup`, `DeviceName`, `DataConnectionLookup`) in
  the twin. The band and the voice bot never write tags.
- **Never while charging.** With USB power present (`VBUS_DIV` high) the band sends status only,
  whatever the twin says. The electrode switch is open then anyway.
- **Not recording:** stay connected in modem sleep and send status every 60 s. After 30 minutes, go
  to deep sleep and wake every 5 minutes to fetch the twin, about 1 mA on average. A band left
  switched on lasts days, not hours.

## Messages

Every message is one UTF-8 JSON object with an envelope:

```json
{"src":"band","band":"B03","boot":17,"seq":4211,"type":"data","session":"2026-10-24T19:05Z", ...}
```

- `boot` increments on every power-up; `seq` restarts at 1 each boot and counts every message.
  `(band, boot, seq)` is unique, so the workbench drops duplicates and finds gaps.
- The band never sets a message ID or touches system properties. IoT Hub supplies `DeviceID` and
  `EnqueuedTime`.

**`data`.** One message per second at most, carrying every stream sampled since the last one:

```json
{..., "type":"data",
 "clock":{"src":"ntp","err":4.1,"age":212},
 "d":[{"s":"EDA","bt":81234567123,"t":1792871234567123,"dt":50000,"v":[2.3141,2.315]},
      {"s":"PPG:GRN","bt":81234561000,"t":1792871234561000,"dt":9987.3,"v":[123456,123470]}]}
```

- `bt`: band time of the first sample, in µs since boot. It never jumps.
- `t`: the same instant in UTC µs, from the band's clock model at send time. It is `null` until this
  boot's first sync; the workbench maps those samples from `bt` and the clock records.
- `dt`: the measured sample interval in µs, never the nominal rate.
- `clock`: `src` is `ntp`, `holdover` (no sync in 15 minutes) or `none`; `err` is the error bound in
  ms; `age` is seconds since the last good sync.

**`clock`.** One per sync burst:
`{"type":"clock","bt":..,"utc":..,"rtt":..,"off":..,"ppm":..,"server":"time.cloudflare.com"}`.
These are the raw points the workbench can re-fit offline, backlog included.

**`status`.** Every 15 s while recording, every 60 s otherwise:

| Field | Meaning |
|---|---|
| `bat`, `mv`, `crate` | MAX17048 state of charge %, cell mV, charge rate %/h |
| `usb` | USB power present: EDA is off |
| `rssi`, `link` | Wi-Fi signal; `mqtt` or `https` |
| `wrist` | On the wrist (from PPG and temperature, not the electrodes) |
| `contact` | `ok`, `poor` (EDA below about 0.05 µS while on the wrist) or `open` |
| `site` | `wrist` or `lead` (from `PLUG_DET`) |
| `settling` | First 15 minutes after the band goes on the wrist |
| `board_c`, `radio` | Board temperature (C6 sensor) and radio state, for separating the band's own heating from skin temperature |
| `backlog` | Bytes waiting to send |
| `fw` | Firmware version |

**`event`.** `{"type":"event","kind":..,"bt":..,"t":..}` for `hello` (at connect, with firmware
version and fixed delays), `usb_on`/`usb_off`, `lead_in`/`lead_out`, `recording_on`/`recording_off`,
`low_battery`, `reset` (a sensor's fit restarted) and `gap` (data discarded, with its time range and
streams).

### Streams

Stream names follow the workbench's `streams.ts`; rates and times come from the band.

| Stream | Unit | Rate | Notes |
|---|---|---|---|
| `EDA` / `EDA:LEAD` | µS | 20 Hz | Wrist contacts / finger lead. The site is in the name, so the two never mix in one series. |
| `HR` | bpm | per beat | From `PPG:GRN` on the band |
| `BI` | ms | per beat | Beat interval from sample counts, never the wall clock |
| `SCR:AMP`, `SCR:RIS` | µS, s | per response | Skin-conductance responses detected on the band |
| `SCR:FREQ` | /min | 1 Hz | Responses per minute |
| `PPG:GRN` | counts | 100 Hz | Raw, sent while connected |
| `PPG:IR`, `PPG:RED` | counts | 25 Hz | Raw, decimated, sent while connected |
| `ACC:ACT` | mg | 2 Hz | Wrist movement: mean deviation over 0.5 s. Always sent. |
| `ACC:X/Y/Z` | g | 26 Hz | Only when the twin sets `rawAcc`. Off by default, because raw wrist motion can reveal typing. |
| `THERM` | °C | 1 Hz | Skin temperature |

No gyro stream: the gyro is powered down. A full-rate message is about 1.2 KB a second.

## Timing

**Timebase.**
- Every sample is stamped from `esp_timer_get_time()`, which runs from the XIAO's 40 MHz 10 ppm
  crystal and never jumps.
- Use integer µs arithmetic; the RISC-V core has no FPU.
- `gettimeofday()` may be set by SNTP for TLS certificate checks only, and is never used for
  stamping.
- No light or deep sleep while recording. The XIAO has no 32 kHz crystal (its pins are D0/D1, which
  carry the interrupts), so sleep would move timekeeping to the internal RC oscillator. Modem sleep
  is fine.

**Clock sync.**
- The band runs its own NTP client. Stock ESP-IDF SNTP takes one reply, ignores the round trip and
  steps the clock.
- Do a burst of 8 queries at connect, reconnect and boot, then 4 every 10 minutes, to
  `time.cloudflare.com`, with `time.windows.com` as the fallback. Don't burst `pool.ntp.org`.
- Turn Wi-Fi power save off for each burst only.
- Keep the exchange with the shortest round trip: offset = ((t2−t1) + (t3−t4))/2, error ≤ RTT/2.
- Fit UTC = a + b·bt over 30 minutes, weighted by 1/RTT², and apply changes as a slew, never a step.
- The target is ±20 ms against UTC, typically better.

**How it is checked.** The home server (or the Azure host) that stamps game events and voice also
keeps UTC from NTP. IoT Hub stamps every message's arrival (`EnqueuedTime`) on Azure's clock, the
same for every sender. The workbench checks each band continuously: the 5th percentile of
`EnqueuedTime − t` (newest sample, live messages only), taken over each minute, must stay between
about −50 and +150 ms. Bands never use sync taps.

**Per-sensor timing.** Each interrupt handler is IRAM-safe and only queues `(source, esp_timer)`. A
sensor task above lwIP and TLS priority does the I2C work. Each sensor's own clock is fitted against
the band clock, and a fit restart sends a `reset` event.

- **ADS1115** (`ADC_RDY`, D9):
  - Continuous mode on AIN0–AIN1 at 475 SPS, with ALERT/RDY in conversion-ready mode (Hi_thresh MSB
    1, Lo_thresh MSB 0, COMP_QUE ≠ 11).
  - Stamp every RDY edge and fit the conversion period. Count edges to catch missed reads.
  - Once per 100 ms, switch to AIN2–AIN3 for one conversion (the excitation voltage) and back.
  - Output each `EDA` value as the time-weighted mean over exactly 100.0 ms of band time, every
    50 ms. That window puts nulls at 10 Hz and its harmonics, which removes 50 and 60 Hz mains hum
    (about −50 dB).
  - Subtract the front end's 32 ms delay (R17·C18). Flag 1 s after any `PLUG_DET` edge as
    settling.
- **MAX30101** (`PPG_INT`, D0):
  - 100 Hz, green, red and IR, with the FIFO-almost-full interrupt only (A_FULL at 17 unread
    samples) and FIFO rollover off.
  - Each service, in order: read status, then OVF_COUNTER, then drain the FIFO.
  - Fit sample index to interrupt time over 60 s.
  - Keep LED current and pulse width fixed for a session.
- **LSM6DSOX** (`IMU_INT` = INT2, D1):
  - Accelerometer only, 26 Hz, high-performance mode, ±4 g; gyro powered down; no tap detection.
  - FIFO in continuous mode with its 25 µs timestamps on (TIMESTAMP_EN, DEC_TS_BATCH), and the
    watermark at 0.5 s routed to INT2, level-triggered.
  - Map the sensor's timestamp counter to band time by reading TIMESTAMP0–3 about once a second.
- **TMP117:** one-shot, 8 averages, every 1 s; stamped at trigger + 62 ms.
- **PLUG_DET (D8) and VBUS_DIV (D3):** stamp edges, debounce, keep the first edge's time, and end the
  current EDA series.

## Signals

**EDA:**
- Conductance = I / V.
  - I = (AIN0−AIN1 − offset) / 68 kΩ
  - V = AIN2−AIN3
  - Subtract the 2 kΩ of series resistance and the switch's on-resistance from V / I before inverting.
- Keep a separate open-electrode offset per site. Capture it only when PPG and temperature agree
  the band has been off the wrist for a while AND the EDA reading itself is at leakage level
  (≤ 0.02 µS). Otherwise discard the capture.
- Never zero real skin conductance from a dry but worn wrist.

**Beats (`HR`, `BI`):**
- Detect beats on `PPG:GRN`, the wrist wavelength least affected by motion.
- Interval = sample-count difference × fitted dt.
- Reject a beat whose interval differs by more than 20% from the median of the previous 5.

**SCRs:**
- Onset (trough) to peak, with the amplitude at least 0.01 µS.
- Mark a response as artifact if its 10–90% rise takes under about 0.25 s.

**On the wrist:**
- Decide from signals that don't depend on the electrodes: MAX30101 IR DC above a calibrated floor
  with no ALC overflow, TMP117 in skin range, and IMU not perfectly still.
- After about 10 s failing, the band is off.

## Delivery and outages

- **Delivery.** Messages go out at QoS 1, and each is kept until its PUBACK (or HTTP 204) arrives.
- **Buffering.** On an outage, sampling and stamping continue. Messages go into a RAM ring of about
  150 KB (about 2 minutes at full rate), then spill to the flash data partition. The flash ring is
  written only while offline, by a low-priority task; interrupt handlers stay IRAM-safe through
  flash erases.
- **Reduced set.** When flash passes half full, the band keeps only EDA, HR, BI, SCR, ACC:ACT,
  THERM and status (about 250 bytes a second, over an hour of outage). It drops raw PPG and sends a
  `gap` event for what it discarded.
- **On reconnect.** Sync first, then send the backlog oldest-first with its original `bt`, `boot`
  and `seq`, interleaved with live data. `t` is computed at send time from the current clock model.

## Power

- **Wi-Fi.** Modem sleep (`WIFI_PS_MIN_MODEM`) while streaming, with power save off only for sync
  bursts. No Wi-Fi 6 target wake time during sessions. The expected draw is about 40–60 mA with
  modem sleep, or about 100–115 mA with power save off; measure it on the first build.
- **LED boost.** `VLED_EN` (D2) goes high only while the PPG runs. Use `gpio_hold_en()` to keep it
  low through deep sleep.
- **Low battery:**
  - Read VCELL and SOC every 10 s.
  - At about 15% send an early `low_battery` event.
  - At 3.50 V or 5%, flush the backlog, send a final `low_battery`, turn the radio off and deep-sleep.
  - The MAX17048 backs this up: VALRT.MIN = 0xAF (3.5 V) and CONFIG.ATHD = 27 (5%) drive `GAUGE_ALRT`
    on D10.
  - Keep the brownout detector at its default. Raising it would trip on transmit bursts.

## Status LED

D5, on D6 (`STATUS_LED`), is active low. The XIAO's own charge LED shows charging through the case
window.

| Pattern | Meaning |
|---|---|
| Solid 2 s | Booting |
| Fast blink | No Wi-Fi; the setup hotspot is open |
| Single blink every 3 s | Connected, not recording |
| Double blink every 3 s | Recording |
| Triple blink every 3 s | Low battery |
| Off | Switched off, or deep sleep |

The ROM boot log on UART0 also flickers the LED briefly at every reset.

## Security

- Flash encryption and NVS encryption in release builds. Secure boot is optional.
- The device key is used only to mint SAS tokens. Each band has its own Data Connection, so one
  leaked key revokes only one band.
- The setup hotspot is WPA2 with the band ID's printed password, open only while unprovisioned or
  for 10 minutes after a failed join.

## Bring-up checks (each band, before casing)

1. **On the cell alone,** USB unplugged and SW1 on: the band boots and the LED blinks. This proves
   the XIAO's hidden BAT+ joint.
2. **I2C scan:** the bus shows 0x36, 0x48, 0x49, 0x57 and 0x6A.
3. **EDA front end, nothing attached:** TP2 (V15) ≈ 1.50 V, TP3 (V10) ≈ 1.00 V, TP1 (EDA_OUT) ≈
   1.50 V.
4. **A 100 kΩ resistor across E1–E2** reads about 10 µS. With the lead plugged in, the same
   resistor across tip and ring reads 10 µS, and `site` reads `lead`.
5. **USB plugged in:** `usb` is true, EDA reads open, and the MAX17048 shows a positive charge rate.
6. **A finger on the PPG window** shows a pulse on `PPG:GRN`.
7. **TP4 (BOOT) held to GND through a reset** (TP5 to GND) enters download mode.
