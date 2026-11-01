import { describe, expect, it } from "vitest";
import { SPEECH_RMS, encodeWav, nextFloor, rms, shouldStop, speechLevel } from "./serverStt";

describe("recording one voice turn", () => {
  it("measures loudness", () => {
    expect(rms([0, 0, 0])).toBe(0);
    expect(rms([0.5, -0.5])).toBeCloseTo(0.5);
    expect(rms([0.001, -0.001])).toBeLessThan(SPEECH_RMS);
  });
  it("ends after a pause once someone spoke, waits for a first word, and caps the length", () => {
    const base = { started: 0, endMs: 1300, waitMs: 6000, maxMs: 20_000 };
    expect(shouldStop({ ...base, now: 2000, lastSpeech: 1500 })).toBeNull();
    expect(shouldStop({ ...base, now: 3000, lastSpeech: 1500 })).toBe("silence");
    expect(shouldStop({ ...base, now: 5000, lastSpeech: null })).toBeNull();
    expect(shouldStop({ ...base, now: 6000, lastSpeech: null })).toBe("no-speech");
    expect(shouldStop({ ...base, now: 20_000, lastSpeech: 19_900 })).toBe("max");
  });
  it("raises the speech bar in a noisy room but never below the quiet-room bar", () => {
    expect(speechLevel(0)).toBe(SPEECH_RMS);
    expect(speechLevel(0.005)).toBe(SPEECH_RMS);
    expect(speechLevel(0.05)).toBeGreaterThan(0.1);
  });
  it("learns steady noise so the recording can end, and still hears speech over it", () => {
    let floor: number | null = null;
    let lastSpeech: number | null = null;
    // 3 s of steady street noise at 0.05 RMS: it must stop counting as speech.
    for (let i = 0; i < 30; i += 1) {
      const speech = floor !== null && 0.05 > speechLevel(floor);
      if (speech) lastSpeech = i * 100;
      floor = nextFloor(floor, 0.05, speech);
    }
    expect(lastSpeech).toBeNull();
    // A voice well above the noise still crosses the bar; more of the same noise does not.
    expect(0.2 > speechLevel(floor as number)).toBe(true);
    expect(0.05 > speechLevel(floor as number)).toBe(false);
  });
  it("follows the background level down when the room gets quieter", () => {
    let floor = 0.05;
    for (let i = 0; i < 30; i += 1) floor = nextFloor(floor, 0.005, false);
    expect(floor).toBeLessThan(0.01);
  });
});

describe("the clip sent to the speech server", () => {
  it("is a 16 kHz mono 16-bit WAV a speech server can read", async () => {
    const bytes = new DataView(await encodeWav(new Float32Array([0, 0.5, -0.5, 2]), 16_000).arrayBuffer());
    const tag = (at: number) => String.fromCharCode(...[0, 1, 2, 3].map((i) => bytes.getUint8(at + i)));
    expect([tag(0), tag(8), tag(12), tag(36)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
    expect(bytes.byteLength).toBe(44 + 8);
    expect(bytes.getUint32(24, true)).toBe(16_000);
    expect(bytes.getUint16(22, true)).toBe(1);
    expect([bytes.getInt16(46, true), bytes.getInt16(48, true), bytes.getInt16(50, true)]).toEqual([16384, -16383, 32767]);
  });
});
