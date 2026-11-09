import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { parseLines, translate, translatePrompt } from "./translate";

const req = (body: unknown) => new Request("http://x/api/agent/translate", { method: "POST", body: JSON.stringify(body) });
const model = (reply: string) => () => new MockLanguageModelV4({
  doGenerate: () => Promise.resolve({ content: [{ type: "text", text: reply }], finishReason: { unified: "stop", raw: "stop" }, usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } }, warnings: [] } as never),
});

describe("notice translation (#55)", () => {
  it("keeps names as written and asks for the same number of lines", () => {
    expect(translatePrompt("es")).toMatch(/Español \(es\)/);
    expect(translatePrompt("es")).toMatch(/station names, street names/);
  });

  it("takes only an array of exactly the lines asked for", () => {
    expect(parseLines('Sure: ["Uno", "Dos"]', 2)).toEqual(["Uno", "Dos"]);
    expect(parseLines('["Uno"]', 2)).toBeNull();
    expect(parseLines("no", 1)).toBeNull();
  });

  it("translates, then answers the same lines from memory", async () => {
    const lines = ["No 1 trains between Dyckman Street and 242 Street.", "Ride the 1 to Dyckman Street."];
    const res = await translate(req({ lang: "es", lines }), model('["No hay trenes 1 entre Dyckman Street y 242 Street.", "Tome el 1 hasta Dyckman Street."]'));
    expect(await res.json()).toEqual({ lines: ["No hay trenes 1 entre Dyckman Street y 242 Street.", "Tome el 1 hasta Dyckman Street."] });
    const again = await translate(req({ lang: "es", lines }), () => { throw new Error("not called"); });
    expect(again.status).toBe(200);
  });

  it("refuses English, unknown languages and empty or long input", async () => {
    for (const body of [{ lang: "en", lines: ["a"] }, { lang: "de", lines: ["a"] }, { lang: "es", lines: [] }, { lang: "es", lines: ["x".repeat(401)] }]) {
      expect((await translate(req(body), model("[]"))).status).toBe(400);
    }
  });

  it("answers 502 when the model does not return the lines", async () => {
    expect((await translate(req({ lang: "fr", lines: ["a", "b"] }), model('["seulement un"]'))).status).toBe(502);
  });
});
