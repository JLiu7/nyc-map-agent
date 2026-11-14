import { describe, expect, it } from "vitest";
import { app } from "../../app";
import { CODE, createSessions } from "./sessions";

const post = (code: string, body: unknown) => app.request(`/api/v1/live/${code}/state`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
/** The first event a watcher of the code is sent. */
async function firstEvent(code: string): Promise<Record<string, unknown>> {
  const ctrl = new AbortController();
  const res = await app.request(`/api/v1/live/${code}/watch`, { signal: ctrl.signal });
  expect(res.headers.get("content-type")).toBe("text/event-stream");
  const reader = res.body!.getReader();
  const { value } = await reader.read();
  ctrl.abort();
  await reader.cancel();
  return JSON.parse(new TextDecoder().decode(value).replace(/^data: /, "")) as Record<string, unknown>;
}

describe("the live phone demo's routes", () => {
  it("hands a watcher the state the phone posted", async () => {
    expect((await post("TEST", { steps: 12, lon: -73.99, lat: 40.73, floor: 7 })).status).toBe(200);
    const got = await firstEvent("TEST");
    expect(got).toMatchObject({ steps: 12, lon: -73.99, lat: 40.73, floor: 7 });
    expect(typeof got.at).toBe("number");
  });

  it("keeps each code's phone apart", async () => {
    await post("AAAA", { steps: 1 });
    await post("BBBB", { steps: 2 });
    expect((await firstEvent("AAAA")).steps).toBe(1);
    expect((await firstEvent("BBBB")).steps).toBe(2);
  });

  it("refuses a code that is not 4 to 8 letters and digits, and a state that is not an object", async () => {
    for (const bad of ["abc", "A", "TOOLONGCODE", "AB-C", "ABC0"]) expect((await post(bad, { steps: 1 })).status).toBe(400);
    expect((await app.request("/api/v1/live/ab/watch")).status).toBe(400);
    expect((await post("GOOD", [1, 2])).status).toBe(400);
    expect(CODE.test("K7QF")).toBe(true);
  });

  it("stops taking new codes when it is full, and forgets a code half an hour after its last post", () => {
    let t = 0;
    const s = createSessions(() => t);
    for (let i = 0; i < 300; i++) expect(s.post(`C${i}`, { i })).toBe(true);
    expect(s.post("NEWONE", {})).toBe(false);
    expect(s.post("C7", { again: true })).toBe(true);
    t += 31 * 60_000;
    expect(s.post("LATER", {})).toBe(true);
    expect(s.size()).toBe(1);
  });

  it("lets at most 20 screens watch one phone", () => {
    const s = createSessions();
    for (let i = 0; i < 20; i++) expect(typeof s.watch("ROOM", () => {})).toBe("function");
    expect(s.watch("ROOM", () => {})).toBe("busy");
  });
});
