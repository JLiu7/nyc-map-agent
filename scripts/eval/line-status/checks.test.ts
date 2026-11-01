import { describe, expect, it } from "vitest";
import { checkReply, factsFrom, mentions } from "./checks";
import type { Facts } from "./types";

// The A train alerts of 2026-11-01 (#627), as the tool's structured troubles gave them.
const stationNames = ["Times Sq-42 St", "42 St", "High St", "Fulton St", "Chambers St", "Canal St", "Spring St", "Nostrand Av", "Utica Av", "Lafayette Av", "Jay St-MetroTech"];
const A: Facts = {
  quiet: false,
  skipped: ["High St", "Fulton St", "Chambers St", "Canal St", "Spring St", "Lafayette Av"],
  switchAt: ["Nostrand Av", "Utica Av"],
  named: ["High St", "Fulton St", "Chambers St", "Canal St", "Spring St", "Lafayette Av", "Nostrand Av", "Utica Av"],
  bothDirections: false,
  shuttle: false,
};
const ask = "Is the A train running near Times Square right now?";
const run = (reply: string, facts: Facts = A, planned = false, question = ask) => checkReply({ reply, question, facts, stationNames, planned, about: ["Times Square", "Times Sq-42 St"] }).map((v) => v.check);

describe("line status checks", () => {
  it("catches every mistake in the live A train reply from #627", () => {
    const bad =
      "The A train is running with delays in both directions at Times Square right now, and it's skipping several Inwood-bound stops (High St, Fulton St, Chambers St, Canal St, Spring St) because of track maintenance. To get to an Inwood-bound train, switch at High St or Fulton St/Chambers St/Canal St as needed.\n\nWant to start?";
    const got = run(bad);
    expect(got).toContain("switch-at-skipped-stop");
    expect(got).toContain("widened-direction");
    expect(got).toContain("offer-without-trip");
    expect(got).toContain("trouble-at-unaffected-station");
  });

  it("passes a faithful reply", () => {
    const good = "The A has delays heading downtown through Manhattan, and Inwood-bound trains skip High St, Fulton St, Chambers St, Canal St and Spring St. Nothing is reported at Times Sq-42 St.";
    expect(run(good)).toEqual([]);
  });

  it("allows switching at a station the tool gives, and flags an invented one", () => {
    expect(run("Queens-bound trains skip Lafayette Av; switch at Nostrand Av to reach it.")).toEqual([]);
    expect(run("Switch at Jay St-MetroTech instead.")).toContain("invented-station");
  });

  it("does not call a longer name an invented shorter one", () => {
    expect(run("Nothing is wrong at Times Sq-42 St.", { ...A, quiet: false })).not.toContain("invented-station");
  });

  it("flags trouble claimed when the feed is quiet, and denial when it is not", () => {
    const quiet: Facts = { quiet: true, skipped: [], switchAt: [], named: [], bothDirections: false, shuttle: false };
    expect(run("The L has delays at Canal St.", quiet)).toContain("claims-trouble-when-none");
    expect(run("The L is running normally with no delays.", quiet)).toEqual([]);
    expect(run("The A is running normally with no delays.")).toContain("denies-trouble");
  });

  it("catches the invented shuttle and the advice to use skipped stops seen on LFM3 after #628", () => {
    const got = run("To get back on the A you can take the C shuttle bus from those same stations (High St, Fulton St, Chambers St, Canal St, Spring St) or switch to another line.");
    expect(got).toContain("invented-shuttle");
    expect(got).toContain("advice-names-skipped-stops");
    expect(run("Inwood-bound A trains skip High St, Fulton St and Chambers St, so take the C there.")).not.toContain("advice-names-skipped-stops");
  });

  it("allows 'Want to start?' only after a planned trip", () => {
    expect(run("The A has delays. Want to start?", A, true)).not.toContain("offer-without-trip");
    expect(run("The A has delays. Want to start?", A, false)).toContain("offer-without-trip");
  });

  it("flags an empty reply", () => {
    expect(run("   ")).toEqual(["empty-reply"]);
  });

  it("matches station names as whole words", () => {
    expect(mentions("Take the A to Canal St now", "Canal St")).toBe(true);
    expect(mentions("Canal Street", "Canal St")).toBe(false);
  });

  it("builds facts from structured troubles", () => {
    const f = factsFrom([{ alertId: "x", route: "G", kind: "suspended", headline: "No G.", direction: null, partial: false, problemAt: [], skipped: [{ id: "1", name: "Court Sq", at: [0, 0] }], shuttle: { buses: [], between: [{ id: "2", name: "Bedford-Nostrand Avs", at: [0, 0] }], stops: [] }, rejoin: [{ id: "2", name: "Bedford-Nostrand Avs", at: [0, 0] }], rejoinLine: null, switchDirection: [] }]);
    expect(f).toMatchObject({ quiet: false, skipped: ["Court Sq"], switchAt: ["Bedford-Nostrand Avs"], bothDirections: false });
    expect(f.named).toContain("Bedford-Nostrand Avs");
    expect(factsFrom([]).quiet).toBe(true);
  });
});
