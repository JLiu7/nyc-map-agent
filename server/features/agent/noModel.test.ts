import { describe, expect, it } from "vitest";
import { answerWithoutModel, clock, fastIntent, foundAsAsked, noModelIntent } from "./noModel";
import { makeTools } from "./tools";

describe("noModelIntent", () => {
  it("knows a restroom question in English and Spanish", () => {
    expect(noModelIntent("where is the nearest restroom?")).toEqual({ kind: "restroom" });
    expect(noModelIntent("¿Dónde hay un baño cerca?")).toEqual({ kind: "restroom" });
  });

  it("knows the Restroom button's question in every app language", async () => {
    const { tr } = await import("../../../src/lib/i18n/appLang");
    for (const lang of ["en", "es", "zh", "ru", "bn", "ht", "fr", "ko"] as const) {
      expect(noModelIntent(tr(lang, "askRestroom")), lang).toEqual({ kind: "restroom" });
    }
  });

  it("reads a subway line by its capital letter or number", () => {
    expect(noModelIntent("is the N train running?")).toEqual({ kind: "line", route: "N" });
    expect(noModelIntent("any delays on the 7 line")).toEqual({ kind: "line", route: "7" });
    expect(noModelIntent("Is the Q delayed")).toEqual({ kind: "line", route: "Q" });
  });

  it("leaves everything else to the model", () => {
    expect(noModelIntent("take a train to Flushing")).toBeNull();
    expect(noModelIntent("how do I get to the Met?")).toBeNull();
  });
});

describe("answerWithoutModel", () => {
  const row = { facility_name: "Union Square Park", longitude: "-73.9905", latitude: "40.7362", status: "Operational", hours_of_operation: "8am-8pm", accessibility: "Fully Accessible" };
  const walk = () => Promise.resolve({ coords: [[-73.99, 40.735], [-73.9905, 40.7362]] as [number, number][], distanceM: 140, durationS: 120, turns: [] });
  const tools = (location: { lon: number; lat: number } | null) => makeTools({
    location, emit: () => {},
    deps: { restrooms: () => Promise.resolve([row]), walk, landmarks: () => Promise.resolve([]), alerts: () => Promise.resolve([]), alertEntities: () => Promise.resolve([]), outages: () => Promise.resolve(outages) },
  });
  let outages: import("./services").Outage[] = [];

  it("names the nearest restroom and the walk", async () => {
    const text = await answerWithoutModel({ text: "nearest bathroom", hasLocation: true }, tools({ lon: -73.99, lat: 40.735 }));
    expect(text).toMatch(/Union Square Park, about 2 min on foot/);
    expect(text).toMatch(/Open today 8am-8pm\./);
  });

  it("asks for the location when it has none", async () => {
    expect(await answerWithoutModel({ text: "nearest bathroom", hasLocation: false }, tools(null))).toMatch(/Use my location/);
  });

  it("says a quiet line is quiet", async () => {
    expect(await answerWithoutModel({ text: "is the L train running", hasLocation: false }, tools(null))).toMatch(/no delays or changes on the L train/);
  });

  it("does not call a line clear over the elevator outages its card lists", async () => {
    const out = (station: string, trainno: string, type = "EL", upcoming = "N") => ({ station, trainno, equipmenttype: type, serving: "street to mezzanine", outagedate: "", estimatedreturntoservice: "", reason: "Repair", isupcomingoutage: upcoming });
    outages = [out("Myrtle Av", "J/M/Z"), out("Myrtle Av", "J/M/Z", "ES"), out("Forest Av", "M", "ES"), out("Essex St", "F/J/M/Z", "EL", "Y"), out("Court Sq", "G")];
    const text = await answerWithoutModel({ text: "is the M train running", hasLocation: false }, tools(null));
    outages = [out("Forest Av", "M", "ES")];
    const one = await answerWithoutModel({ text: "is the M train running", hasLocation: false }, tools(null));
    outages = [];
    expect(text).toMatch(/no delays or changes on the M train right now\. 2 stations have an elevator or escalator out/);
    expect(one).toMatch(/Escalator out at Forest Av\./);
  });

  it("returns null for other questions", async () => {
    expect(await answerWithoutModel({ text: "what's the weather", hasLocation: false }, tools(null))).toBeNull();
  });
});

describe("fastIntent: answered before the model", () => {
  it("takes the home buttons' plain English questions", async () => {
    const { tr } = await import("../../../src/lib/i18n/appLang");
    expect(fastIntent(tr("en", "askRestroom"))).toEqual({ kind: "restroom" });
    expect(fastIntent(tr("en", "askLine").replace("{r}", "7"))).toEqual({ kind: "line", route: "7" });
  });

  it("takes short plain asks", () => {
    expect(fastIntent("nearest bathroom")).toEqual({ kind: "restroom" });
    expect(fastIntent("I need a toilet near me")).toEqual({ kind: "restroom" });
    expect(fastIntent("Where’s the closest restroom?")).toEqual({ kind: "restroom" });
    expect(fastIntent("is the A train running?")).toEqual({ kind: "line", route: "A" });
    expect(fastIntent("any delays on the Q")).toEqual({ kind: "line", route: "Q" });
    expect(fastIntent("L train status")).toEqual({ kind: "line", route: "L" });
  });

  it("leaves anything with more in it to the model", () => {
    expect(fastIntent("nearest public restroom to Bryant Park")).toBeNull();
    expect(fastIntent("I'm with a stroller and need a bathroom on the way to Penn")).toBeNull();
    expect(fastIntent("is the 7 running to Flushing?")).toBeNull();
    expect(fastIntent("is the N or the Q faster?")).toBeNull();
    expect(fastIntent("is there a delay")).toBeNull();
    expect(fastIntent("what should I see at the Met?")).toBeNull();
    // Other languages: the model answers in the asker's language.
    expect(fastIntent("¿Dónde hay un baño cerca?")).toBeNull();
  });
});

describe("fastIntent: exits and trips", () => {
  it("takes a plain which-exit ask, with or without the station", () => {
    expect(fastIntent("Which exit for the Met?")).toEqual({ kind: "exit", station: "here", to: "Met" });
    expect(fastIntent("which exit should I take at Herald Sq for Macy's")).toEqual({ kind: "exit", station: "Herald Sq", to: "Macy's" });
    expect(fastIntent("what exit to Bryant Park from 42 St-Bryant Pk")).toEqual({ kind: "exit", station: "42 St-Bryant Pk", to: "Bryant Park" });
  });

  it("takes a plain trip ask, from here or from a named place", () => {
    expect(fastIntent("How do I get to Grand Central?")).toEqual({ kind: "trip", from: "here", to: "Grand Central" });
    expect(fastIntent("Plan a trip to the Brooklyn Museum")).toEqual({ kind: "trip", from: "here", to: "Brooklyn Museum" });
    expect(fastIntent("Plan a trip from Union Square to Grand Central")).toEqual({ kind: "trip", from: "Union Square", to: "Grand Central" });
  });

  it("leaves times, ways to travel and extra wishes to the model", () => {
    expect(fastIntent("How do I get to Grand Central at 5pm?")).toBeNull();
    expect(fastIntent("how do I get to JFK tomorrow")).toBeNull();
    expect(fastIntent("how do I get to the Met by bus")).toBeNull();
    expect(fastIntent("how do I get to Penn with a stroller")).toBeNull();
    expect(fastIntent("how do I get to MoMA and then the park")).toBeNull();
    expect(fastIntent("Which exit should I take at the nearest subway station?")).toBeNull();
    expect(fastIntent("which exit has an elevator for the Met")).toBeNull();
  });
});

describe("fast trip checks", () => {
  it("leaves a trip to a whole borough to the model, which asks where in it (#625)", async () => {
    expect(await answerWithoutModel({ text: "How do I get to Brooklyn", hasLocation: true }, {} as never, { kind: "trip", from: "here", to: "Brooklyn" })).toBeNull();
  });

  it("reads New York local time as it is", () => {
    expect(clock("2026-10-28T22:43")).toBe("10:43 pm");
    expect(clock("2026-10-28T00:05")).toBe("12:05 am");
    expect(clock("2026-10-28T12:00")).toBe("12:00 pm");
    expect(clock("soon")).toBeNull();
  });

  it("trusts a found place only when it carries the asked name", () => {
    expect(foundAsAsked("Brooklyn Museum", "Brooklyn Museum, 200 Eastern Parkway")).toBe(true);
    expect(foundAsAsked("Grand Central", "Grand Central Terminal, 89 E 42nd St")).toBe(true);
    // A read-back pick names the trains; the station found carries the name, not the trains.
    expect(foundAsAsked("86 St (4 5 6 trains)", "86 St station")).toBe(true);
    expect(foundAsAsked("Brooklyn Museum", "Spark Brooklyn Children's Museum Annex, 1 John Street, Dumbo")).toBe(false);
    expect(foundAsAsked("Macy's", "Macy's Herald Square, 151 W 34th St")).toBe(true);
    expect(foundAsAsked("Met", undefined)).toBe(false);
  });
});
