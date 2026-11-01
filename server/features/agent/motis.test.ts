import { describe, expect, it, vi } from "vitest";
import plan from "./fixtures/motis-plan.json";
import { encodePolyline, gtfsId, httpMotis, motisResponse, toOtpItinerary } from "./motis";
import { decodePolyline, itineraryToTrip } from "./otp";
import type { StationEntrances } from "./transit";

const noStations: StationEntrances = { stations: () => Promise.resolve([]), entrances: () => Promise.resolve([]) };
const it0 = () => toOtpItinerary(motisResponse.parse(plan).itineraries[0]);

describe("MOTIS glue", () => {
  it("maps dataset-tagged ids onto OTP feed ids", () => {
    expect(gtfsId("subway_A")).toBe("SUBWAY:A");
    expect(gtfsId("busco_BM1")).toBe("BUSCO:BM1");
    expect(gtfsId("plain")).toBe("plain");
  });
  it("re-encodes a precision-6 polyline at precision 5", () => {
    const pts = decodePolyline("cntvlAb}ublCcAo@", 6);
    expect(decodePolyline(encodePolyline(pts))).toEqual(pts.map(([o, a]) => [Math.round(o * 1e5) / 1e5, Math.round(a * 1e5) / 1e5]));
  });
  it("maps a real MOTIS bus itinerary onto the OTP shape", () => {
    const it = it0();
    const bus = it.legs.find((l) => l.route)!;
    expect(bus.mode).toBe("BUS");
    expect(bus.route!.gtfsId).toMatch(/^[A-Z]+:/);
    expect(bus.from.stop!.gtfsId).toMatch(/^[A-Z]+:/);
    expect(it.legs[0].from.name).toBeNull();
    expect(it.walkDistance).toBeGreaterThan(0);
    const [lon, lat] = decodePolyline(bus.legGeometry!.points)[0];
    expect(lon).toBeCloseTo(bus.from.lon, 2);
    expect(lat).toBeCloseTo(bus.from.lat, 2);
  });
  it("turns it into a Trip with a bus ride", async () => {
    const trip = await itineraryToTrip(it0(), { label: "Times Square", at: [-73.9855, 40.758] }, { label: "Penn Station", at: [-73.9934, 40.7505] }, noStations);
    expect(trip.legs.some((l) => l.kind === "ride" && l.mode === "bus")).toBe(true);
  });
  it("asks for rail only when the rider wants the subway", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(plan)));
    await httpMotis.plan([-73.9855, 40.758], [-73.9934, 40.7505], "2026-10-31T15:00", false, "subway");
    const url = new URL(f.mock.calls[0][0] as string);
    expect(url.pathname).toBe("/api/v6/plan");
    expect(url.searchParams.get("transitModes")).toContain("SUBWAY");
    expect(url.searchParams.get("fromPlace")).toBe("40.758,-73.9855");
    expect(url.searchParams.get("time")).toBe("2026-10-31T15:00:00-04:00");
    f.mockRestore();
  });
});
