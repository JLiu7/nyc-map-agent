import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { jpegBase64, matchRead, READ_PROMPT, seeSign, signTokens } from "./seeSign";

const JPEG = `/9j/${"A".repeat(400)}`;
const SIGNS = [{ id: "us-to-l", sign: "Elevator to L" }, { id: "us-yellow", sign: "Exit 14 St & 4 Av" }];
const req = (body: unknown) => new Request("http://x/api/agent/see-sign", { method: "POST", body: JSON.stringify(body) });
const model = (reply: string) => () => new MockLanguageModelV4({
  doGenerate: () => Promise.resolve({ content: [{ type: "text", text: reply }], finishReason: { unified: "stop", raw: "stop" }, usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } }, warnings: [] } as never),
});

describe("which sign a photo shows (#88)", () => {
  it("asks only for the words on the signs, and NONE when there are none", () => {
    expect(READ_PROMPT).toMatch(/only the words/);
    expect(READ_PROMPT).toMatch(/reply NONE/);
  });

  it("treats Street and St, Avenue and Av as the same word", () => {
    expect(signTokens("Exit 14 Street & 4 Avenue")).toEqual(signTokens("exit 14 St 4 Av"));
  });

  // What the model read off our own frames on 2026-11-13, against the signs of 14 St-Union Sq in walk order.
  const UNION = [
    { id: "us-platform", sign: "14 Street" },
    { id: "us-to-mezzanine", sign: "To Mezzanine L & Downtown N Q R W" },
    { id: "us-to-l", sign: "Elevator to L" },
    { id: "us-yellow", sign: "Exit 14 St & 4 Av" },
    { id: "us-sw-turnstiles", sign: "Exit 14 St & 4 Av SW corner" },
    { id: "us-downtown-sign", sign: "Exit 14 Street Downtown" },
    { id: "us-exit-arrow", sign: "Exit 14 Street & 4 Avenue" },
    { id: "us-mural-elevator", sign: "Exit 14 Street & 4 Avenue Union Square East NE corner" },
    { id: "us-street", sign: "14 St - Union Square Subway Station" },
    { id: "us-downtown-elevator", sign: "Downtown & Brooklyn N Q R W" },
  ];
  const pick = (read: string, signs = UNION) => { const i = matchRead(read, signs); return i === null ? null : signs[i].id; };

  it("matches the words read to the sign that says them", () => {
    expect(pick("To Mezzanine L & Downtown N Q R W")).toBe("us-to-mezzanine");
    expect(pick("Elevator to L")).toBe("us-to-l");
    expect(pick("Downtown & Brooklyn N Q R W")).toBe("us-downtown-elevator");
    expect(pick("Exit 14 Street & 4 Avenue Union Square East ME corner")).toBe("us-mural-elevator");
    expect(pick("14 STREET- UNION SQ 4 5 L N Q R W")).toBe("us-street");
  });

  it("takes the fuller sign when a word is cut off, and the nearer one when two say the same", () => {
    expect(pick("Exit 14 St & 4 Av SW Co")).toBe("us-sw-turnstiles");
    // "Exit 14 St & 4 Av" is on two signs: the first in the list is the nearer.
    expect(pick("Exit 14 St & 4 Av")).toBe("us-yellow");
    expect(pick("Exit 14 St & 4 Av", [UNION[6], UNION[3]])).toBe("us-exit-arrow");
  });

  it("does not take a sign whose street numbers were not read", () => {
    // What the live route read off a blurred frame of the 14 Street & 4 Avenue wall sign on 2026-11-14.
    expect(pick("Exit M 40th Street & 9th Avenue")).toBeNull();
    expect(pick("Exit 16 Street & 4 Avenue")).toBeNull();
  });

  it("matches nothing when no sign was read or the words are not on the list", () => {
    expect(pick("NONE")).toBeNull();
    expect(pick("")).toBeNull();
    expect(pick("USE NO ELEVATOR COMMUNICATION FAILURE OFF LMA RES CALL IS BEING PLACED CALL ANSWERED")).toBeNull();
    expect(pick("RETAIL SPACE AVAILABLE for lease")).toBeNull();
  });

  it("takes a JPEG as a data URL or bare, and nothing else", () => {
    expect(jpegBase64(`data:image/jpeg;base64,${JPEG}`)).toBe(JPEG);
    expect(jpegBase64(JPEG)).toBe(JPEG);
    expect(jpegBase64(`iVBOR${"A".repeat(400)}`)).toBeNull();
    expect(jpegBase64(`/9j/${"A".repeat(900_000)}`)).toBeNull();
    expect(jpegBase64(42)).toBeNull();
  });

  it("answers the id of the sign the model picks", async () => {
    const res = await seeSign(req({ image: JPEG, signs: SIGNS }), model("Exit 14 St & 4 Av"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "us-yellow", read: "Exit 14 St & 4 Av" });
  });

  it("answers null when the photo shows none of them", async () => {
    expect(await (await seeSign(req({ image: JPEG, signs: SIGNS }), model("NONE"))).json()).toEqual({ id: null, read: "NONE" });
  });

  it("refuses a missing photo, no signs, and an id that is not a plain name", async () => {
    for (const body of [{ signs: SIGNS }, { image: JPEG, signs: [] }, { image: JPEG, signs: [{ id: "a b", sign: "x" }] }, { image: "hello", signs: SIGNS }]) {
      expect((await seeSign(req(body), model("Elevator to L"))).status).toBe(400);
    }
  });

  it("says so when no model here can look at a photo", async () => {
    expect((await seeSign(req({ image: JPEG, signs: SIGNS }), () => null)).status).toBe(503);
  });
});
