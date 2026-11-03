import { describe, expect, it } from "vitest";
import { kokoroLang, pcm16ToFloat } from "./kokoro";

describe("kokoro", () => {
  it("speaks the app's English, Spanish, French and Chinese, and leaves the rest to the browser", () => {
    expect(kokoroLang("Take the 4 train.", "en-US")).toBe("en");
    expect(kokoroLang("Toma el tren 4.", "es-MX")).toBe("es");
    expect(kokoroLang("Prenez le train 4.", "fr")).toBe("fr");
    expect(kokoroLang("乘坐4号线。", "en")).toBe("zh");
    expect(kokoroLang("Pran tren 4 la.", "ht")).toBeNull();
    expect(kokoroLang("Садитесь на поезд 4.", "ru")).toBeNull();
    expect(kokoroLang("4번 열차를 타세요.", "en")).toBeNull();
  });

  it("turns 16-bit little-endian samples into floats and drops an odd last byte", () => {
    const f = pcm16ToFloat(new Uint8Array([0x00, 0x00, 0x00, 0x40, 0x00, 0x80, 0x7f]));
    expect([...f]).toEqual([0, 0.5, -1]);
  });
});
