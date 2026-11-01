import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, busFetch, decodePolyline, loadBusArrivals, loadBusStops, towards } from "./routes";

describe("bus sheet endpoints", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it("decodes Google encoded polylines to [lon, lat]", () => {
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([[-120.2, 38.5], [-120.95, 40.7], [-126.453, 43.252]]);
  });
  it("validates route and vehicle before calling Bus Time", async () => {
    vi.stubEnv("MTA_BUSTIME_KEY", "k");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect((await GET(new Request("http://x/api/transit/bus-route?route=../../etc"))).status).toBe(400);
    expect((await GET(new Request("http://x/api/transit/bus-trip?vehicle=a%2Fb%3Fc"))).status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("is unavailable without a Bus Time key", async () => {
    vi.stubEnv("MTA_BUSTIME_KEY", "");
    expect((await GET(new Request("http://x/api/transit/bus-route?route=M42"))).status).toBe(404);
  });
  it("slims SIRI into headsign + upcoming stops", async () => {
    vi.stubEnv("MTA_BUSTIME_KEY", "k");
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({ Siri: { ServiceDelivery: { VehicleMonitoringDelivery: [{ VehicleActivity: [{ MonitoredVehicleJourney: {
      PublishedLineName: "M42", DestinationName: "WEST SIDE PIER", DirectionRef: "1",
      OnwardCalls: { OnwardCall: [{ StopPointRef: "MTA_1", StopPointName: "W 42 ST/11 AV", ExpectedArrivalTime: "2026-10-21T16:00:00-04:00", Extensions: { Distances: { PresentableDistance: "1 stop away" } } }] },
    } }] }] } } })))));
    const body: unknown = await (await GET(new Request("http://x/api/transit/bus-trip?vehicle=MTA%20NYCT_9999"))).json();
    expect(body).toEqual({ found: true, route: "M42", destination: "WEST SIDE PIER", dir: "1", calls: [{ id: "MTA_1", name: "W 42 ST/11 AV", eta: 1792612800, away: "1 stop away" }] });
  });
});

describe("bus pages", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it("serves the borough catalog without a Bus Time key", async () => {
    vi.stubEnv("MTA_BUSTIME_KEY", "");
    const body = await (await GET(new Request("http://x/api/transit/bus-lines"))).json() as { groups: Array<{ pages: Array<{ routes: string[] }> }> };
    const routes = body.groups.flatMap((g) => g.pages.flatMap((p) => p.routes));
    expect(routes).toContain("Q1");
    expect(routes).not.toContain("T102");
    expect(routes.some((r) => r.startsWith("T"))).toBe(false);
  });
  it("refuses an empty, oversized, or invalid route list before calling Bus Time", async () => {
    vi.stubEnv("MTA_BUSTIME_KEY", "k");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect((await GET(new Request("http://x/api/transit/bus?routes=nope"))).status).toBe(400);
    expect((await GET(new Request("http://x/api/transit/bus?routes=" + Array.from({ length: 21 }, (_, i) => `Q${i + 1}`).join(",")))).status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("bus-stops", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it("rejects points outside NYC", async () => {
    vi.stubEnv("MTA_BUSTIME_KEY", "k");
    expect((await GET(new Request("http://x/api/transit/bus-stops?lat=0&lon=0"))).status).toBe(400);
  });
  it("maps OBA stops to names and route short names", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(
      new Response(JSON.stringify({ data: { list: [{ id: "MTA_1", name: "GRAND ST/ESSEX ST", lat: 40.718, lon: -73.988, direction: "W", routeIds: ["MTA NYCT_M14D+", "MTA NYCT_B39"] }], references: { routes: [{ id: "MTA NYCT_M14D+", shortName: "M14D-SBS" }, { id: "MTA NYCT_B39", shortName: "B39" }] } } })))));
    const { stops } = await loadBusStops("k", 40.718, -73.988);
    expect(stops).toEqual([{ id: "MTA_1", name: "GRAND ST/ESSEX ST", lat: 40.718, lon: -73.988, dir: "W", routes: ["B39", "M14D-SBS"], heads: {} }]);
  });
  it("says where each route goes from the stop", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve(new Response(JSON.stringify(url.includes("stops-for-route")
      ? { data: { entry: { stopGroupings: [{ stopGroups: [{ name: { name: "GREENPOINT MANHATTAN AV via GRAHAM AV" }, stopIds: ["MTA_9"] }, { name: { name: "PROSPECT LEFFERTS GARDENS" }, stopIds: ["MTA_8"] }] }] } } }
      : { data: { list: [{ id: "MTA_9", name: "NASSAU AV/MANHATTAN AV", lat: 40.7238, lon: -73.951, direction: "N", routeIds: ["MTA NYCT_B43X"] }], references: { routes: [{ id: "MTA NYCT_B43X", shortName: "B43" }] } } })))));
    const { stops } = await loadBusStops("k", 40.7238, -73.951);
    expect(stops[0].heads).toEqual({ B43: "Greenpoint Manhattan Av" });
  });
  it("words a destination the way a pole sign does", () => {
    expect(towards("DOWNTOWN BKLYN FULTON MALL via 3 AV")).toBe("Downtown Brooklyn Fulton Mall");
    expect(towards("SELECT BUS EAST HARLEM 125 ST")).toBe("East Harlem 125 St");
    expect(towards("7 TRAIN TO 74 ST-BROADWAY")).toBe("7 Train To 74 St-Broadway");
  });
});

describe("bus-arrivals", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it("rejects a malformed stop id", async () => {
    vi.stubEnv("MTA_BUSTIME_KEY", "k");
    expect((await GET(new Request("http://x/api/transit/bus-arrivals?stop=../x"))).status).toBe(400);
  });
  it("lists visits soonest first with route, headsign and distance", async () => {
    const visit = (line: string, t: string) => ({ MonitoredVehicleJourney: { PublishedLineName: [line], DestinationName: ["JAMAICA"], VehicleRef: `MTA NYCT_${line}`, MonitoredCall: { ExpectedArrivalTime: t, Extensions: { Distances: { PresentableDistance: "2 stops away" } } } } });
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({ Siri: { ServiceDelivery: { StopMonitoringDelivery: [{ MonitoredStopVisit: [visit("Q6", "2026-01-01T00:10:00Z"), visit("Q8", "2026-01-01T00:05:00Z")] }] } } })))));
    const { arrivals } = await loadBusArrivals("k", "MTA_1");
    expect(arrivals.map((a) => a.route)).toEqual(["Q8", "Q6"]);
    expect(arrivals[0]).toMatchObject({ destination: "JAMAICA", vehicle: "MTA NYCT_Q8", away: "2 stops away" });
  });
});

describe("Bus Time through the Octo vault relay", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it("sends an MTA key as key= straight to Bus Time", async () => {
    const f = vi.fn(() => Promise.resolve(new Response("{}")));
    vi.stubGlobal("fetch", f);
    await busFetch("https://bustime.mta.info/api/siri/stop-monitoring.json?MonitoringRef=MTA_1", "mta-key");
    expect(new URL((f.mock.calls[0] as unknown[])[0] as string).searchParams.get("key")).toBe("mta-key");
  });
  it("sends a working key to the relay, never as key=, and never follows a redirect", async () => {
    vi.stubEnv("OCTO_BASE_URL", "https://octo.test");
    const f = vi.fn(() => Promise.resolve(new Response("{}")));
    vi.stubGlobal("fetch", f);
    await busFetch("https://bustime.mta.info/api/siri/stop-monitoring.json?MonitoringRef=MTA_1", "octo_tmp_abc");
    const [url, init] = f.mock.calls.find((c) => String((c as unknown[])[0]).endsWith("/api/vault/proxy")) as unknown as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe("https://octo.test/api/vault/proxy");
    expect(init.redirect).toBe("manual");
    expect(init.headers.authorization).toBe("Bearer octo_tmp_abc");
    expect(init.headers["x-octo-target"]).toBe("https://bustime.mta.info/api/siri/stop-monitoring.json?MonitoringRef=MTA_1");
  });
});
