import { describe, expect, it } from "vitest";
import { bearingBetween, bearingOf, exitToward, facingFrom, facingOf, matchSign, signFace, signWords, turnBetween, wordFit, type ReadableSign } from "./signMatch";

const routes = (...short: string[]) => short.map((s) => ({ short: s }));
const sign = (p: Partial<ReadableSign> & Pick<ReadableSign, "kind">): ReadableSign => ({ x: 0, y: 0, z: -6, angle: 0, back: false, name: "", routes: [], ...p });

/** A station like Fulton St: two platforms 60 m apart, three street exits, one stair between floors. */
const NW = sign({ kind: "exit", x: -40, y: 30, z: -3, angle: Math.PI / 2, words: "Broadway & Fulton St · NW corner" });
const SE = sign({ kind: "exit", x: 80, y: -20, z: -3, angle: -Math.PI / 2, words: "Nassau St & Fulton St · SE corner" });
const JOHN = sign({ kind: "exit", x: 150, y: -90, z: -3, angle: 0, words: "William St & John St" });
const INNER = sign({ kind: "exit", x: 10, y: 0, z: -9, angle: Math.PI });
const AC = [0, 20, 40, 60].map((x) => sign({ kind: "name", x, y: 0, z: -9, angle: Math.PI / 2, back: true, name: "Fulton St", routes: routes("A", "C") }));
const N23 = [0, 20].map((x) => sign({ kind: "name", x, y: 60, z: -6, angle: Math.PI / 2, back: true, name: "Fulton St", routes: routes("2", "3") }));
const UP45 = sign({ kind: "way", x: 100, y: 100, angle: 0, back: true, words: "Uptown", routes: routes("4", "5") });
const DOWN45 = sign({ kind: "way", x: 100, y: 106, angle: 0, back: true, words: "Downtown", routes: routes("4", "5") });
const DOWNAC = sign({ kind: "way", x: 30, y: 3, z: -9, angle: 0, back: true, words: "Downtown", routes: routes("A", "C") });
const STAIR_AC = sign({ kind: "trains", x: 5, y: 20, angle: 0, routes: routes("A", "C") });
const SIGNS = [NW, SE, JOHN, INNER, ...AC, ...N23, UP45, DOWN45, DOWNAC, STAIR_AC];

describe("signWords", () => {
  it("makes Street and St, Avenue and Av, 42nd and 42 the same word", () => {
    expect(signWords("Fulton Street")).toEqual(signWords("FULTON ST."));
    expect(signWords("Lexington Avenue & 42nd St")).toEqual(["lexington", "av", "42", "st"]);
  });
  it("drops accents and punctuation", () => {
    expect(signWords("Exit · Broadway, & Fulton St: NW corner")).toEqual(["exit", "broadway", "fulton", "st", "nw", "corner"]);
  });
  it("reads a sign's face from its kind", () => {
    expect(signFace(NW).words).toEqual(["exit", "broadway", "fulton", "st", "nw", "corner"]);
    expect(signFace(AC[0])).toEqual({ words: ["fulton", "st"], bullets: ["a", "c"] });
    expect(signFace(STAIR_AC)).toEqual({ words: [], bullets: ["a", "c"] });
  });
});

describe("wordFit", () => {
  it("forgives one wrong letter in a long word and a read cut short", () => {
    expect(wordFit("futon", "fulton")).toBeGreaterThan(0.5);
    expect(wordFit("nassay", "nassau")).toBeGreaterThan(0.5);
    expect(wordFit("broadw", "broadway")).toBeGreaterThan(0.5);
  });
  it("never bends short words or numbers", () => {
    expect(wordFit("se", "sw")).toBe(0);
    expect(wordFit("143", "145")).toBe(0);
    expect(wordFit("st", "sq")).toBe(0);
  });
});

describe("matchSign", () => {
  it("pins an exit from its street corner, read whole", () => {
    const m = matchSign("Exit © Broadway & Fulton St - NW corner", SIGNS)!;
    expect(m.sign).toBe(NW);
    expect(m.level).toBe("spot");
    expect(m.score).toBeGreaterThan(0.85);
    expect(m.confidence).toBeGreaterThan(0.7);
  });

  it("pins it from a partial read", () => {
    expect(matchSign("Exit Broadway", SIGNS)!.sign).toBe(NW);
    expect(matchSign("Nassau", SIGNS)!.sign).toBe(SE);
    expect(matchSign("William St & John", SIGNS)!.sign).toBe(JOHN);
  });

  // Text the reader gave for rendered signs seen at an angle, tilted and far off (the feasibility run).
  it.each([
    ["_— Exit 1 Broadway & Futon St: NW comer", NW],
    ["Exit I Broadway, & Fulton St. Nw Corner", NW],
    ["EE — Exit 4 Nassau St & Fulton St- SE comer", SE],
    ["Exit 4 Nassay St & Fulton St. Sg corner", SE],
    ["Exit Nassay g; & Fulton St. Sg corner", SE],
    ["SE —— Exit 1 William St & John st", JOHN],
    ["Exit p William St & John st", JOHN],
    ["Nassau St & Fulton Si E corner", SE],
  ])("pins the exit from a real misread: %s", (text, want) => {
    const m = matchSign(text, SIGNS)!;
    expect(m.sign).toBe(want);
    expect(m.level).toBe("spot");
  });

  it("knows only the station from its name, which hangs all along the platforms", () => {
    const m = matchSign("Fulton", SIGNS)!;
    expect(m.sign.kind).toBe("name");
    expect(m.level).toBe("station");
    expect(m.same).toHaveLength(AC.length + N23.length);
    expect(m.spreadM).toBeGreaterThan(50);
    expect(facingFrom(m, 10)).toBeNull();
  });

  it("uses the line bullets, when they were read, to tell the platforms apart", () => {
    expect(matchSign("Fulton St 2 3", SIGNS)!.same).toEqual(N23);
    expect(matchSign("Fulton St A C", SIGNS)!.same).toEqual(AC);
  });

  it("chooses among signs that say the same by where the rider last was", () => {
    const m = matchSign("Fulton St", SIGNS, { x: 22, y: 61 })!;
    expect(m.sign).toBe(N23[1]);
    // The next name sign is only 20 m off, too close to rule out.
    expect(m.same.length).toBeGreaterThan(1);
    const far = matchSign("Fulton St", [AC[0], AC[3]], { x: 58, y: 1 })!;
    expect(far.same).toEqual([AC[3]]);
    expect(far.level).toBe("spot");
  });

  it("tells Uptown from Downtown and the platform from its bullets", () => {
    expect(matchSign("4 5 Uptown", SIGNS)!.sign).toBe(UP45);
    expect(matchSign("A C Downtown", SIGNS)!.sign).toBe(DOWNAC);
    expect(matchSign("AC Downtown", SIGNS)!.sign.words).toBe("Downtown");
    // "Downtown" alone fits both platforms.
    expect(matchSign("Downtown", SIGNS)!.level).toBe("station");
  });

  it("takes a bare Exit as the stair between floors, not a street exit that names its corner", () => {
    const m = matchSign("Exit", SIGNS)!;
    expect(m.sign).toBe(INNER);
    // With every exit named, "Exit" alone fits them all: the station, not a spot.
    const named = matchSign("Exit", [NW, SE, JOHN])!;
    expect(named.same).toHaveLength(3);
    expect(named.level).toBe("station");
  });

  it("reads a sign of bullets alone", () => {
    expect(matchSign("A C", SIGNS)!.sign).toBe(STAIR_AC);
    expect(matchSign("7", SIGNS)).toBeNull();
  });

  it("is less sure when two corners share the street that was read", () => {
    const whole = matchSign("Exit Broadway & Fulton St NW corner", SIGNS)!;
    const half = matchSign("Exit Fulton St", SIGNS)!;
    expect(half.same).toEqual(expect.arrayContaining([NW, SE]));
    expect(half.level).toBe("station");
    expect(half.confidence).toBeLessThan(whole.confidence);
  });

  it("splits two words the reader ran together", () => {
    // The feasibility run read the name sign as "FultonSt" every time.
    const m = matchSign("FultonSt A Cc J (Z (2 (3 4 (5", SIGNS)!;
    expect(m.sign.kind).toBe("name");
    expect(matchSign("Exit BroadwayFulton", SIGNS)!.sign).toBe(NW);
  });

  it("refuses words that are on no sign here", () => {
    expect(matchSign("Canal St", SIGNS)).toBeNull();
    expect(matchSign("Dunkin Donuts open 24 hours", SIGNS)).toBeNull();
    expect(matchSign("", SIGNS)).toBeNull();
    expect(matchSign("rns co ioe", SIGNS)).toBeNull();
    expect(matchSign("Fulton", [])).toBeNull();
  });

  it("is not thrown by an advert read along with the sign", () => {
    expect(matchSign("Exit Broadway & Fulton St NW corner SALE", SIGNS)!.sign).toBe(NW);
  });
});

describe("facing", () => {
  it("turns the model's angles into compass bearings", () => {
    expect(bearingOf(0)).toBeCloseTo(90);
    expect(bearingOf(Math.PI / 2)).toBeCloseTo(0);
    expect(bearingOf(Math.PI)).toBeCloseTo(270);
    expect(turnBetween(350, 10)).toBe(20);
    expect(turnBetween(10, 350)).toBe(-20);
    expect(bearingBetween({ x: 0, y: 0 }, { x: 10, y: 10 })).toBeCloseTo(45);
  });

  it("has the rider look against the face of a wall sign", () => {
    // NW's face looks north, so its reader looks south.
    expect(facingOf(NW)).toEqual([180]);
    expect(facingFrom(matchSign("Exit Broadway", SIGNS)!, null)).toBe(180);
  });

  it("needs a rough compass to choose a side of a hanging sign", () => {
    const m = matchSign("4 5 Uptown", SIGNS)!;
    expect(m.facing.map(Math.round).sort((a, b) => a - b)).toEqual([90, 270]);
    expect(facingFrom(m, null)).toBeNull();
    expect(Math.round(facingFrom(m, 250)!)).toBe(270);
    expect(Math.round(facingFrom(m, 120)!)).toBe(90);
    // A compass reading square to both sides settles nothing.
    expect(facingFrom(m, 0)).toBeNull();
  });
});

describe("exitToward", () => {
  it("picks the exit the trip names, else the nearest", () => {
    expect(exitToward(SIGNS, { x: 0, y: 0 }, "Nassau St & Fulton St")).toBe(SE);
    expect(exitToward(SIGNS, { x: 140, y: -80 })).toBe(JOHN);
    expect(exitToward(SIGNS, { x: 0, y: 0 }, "Wall St")).toBe(INNER);
    expect(exitToward(AC, { x: 0, y: 0 })).toBeNull();
  });
});
