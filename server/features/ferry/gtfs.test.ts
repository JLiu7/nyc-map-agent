import { describe, expect, it } from "vitest";
import { merge, parseCsv, readFeed } from "./gtfs";

describe("ferry GTFS reader", () => {
  it("reads quoted cells, doubled quotes, CRLF and a BOM", () => {
    expect(parseCsv('\uFEFFa,b\r\n"x, y","say ""hi"""\r\n\r\n')).toEqual([{ a: "x, y", b: 'say "hi"' }]);
  });
  it("applies calendar weekdays and calendar_dates exceptions", () => {
    const f = readFeed("si", {
      "calendar.txt": "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nweekday,1,1,1,1,1,0,0,20260101,20281231\nweekend,0,0,0,0,0,1,1,20260101,20281231\n",
      "calendar_dates.txt": "service_id,date,exception_type\nweekday,20261126,2\nweekend,20261126,1\n",
    });
    expect([...f.services("20261102")]).toEqual(["si:weekday"]);
    expect([...f.services("20261126")]).toEqual(["si:weekend"]);
  });
  it("keeps timed stops after midnight and skips untimed ones", () => {
    const f = readFeed("si", {
      "routes.txt": "route_id,route_long_name\nSIF,Staten Island Ferry\n",
      "stops.txt": "stop_id,stop_name,stop_lat,stop_lon\na,St. George,40.64,-74.07\nb,Mid,40.67,-74.04\nc,Whitehall,40.70,-74.01\n",
      "trips.txt": "route_id,service_id,trip_id\nSIF,weekday,late\n",
      "stop_times.txt": "trip_id,arrival_time,departure_time,stop_id,stop_sequence\nlate,24:50:00,24:50:00,a,1\nlate,,,b,2\nlate,25:15:00,25:15:00,c,3\n",
    });
    expect(f.trips).toMatchObject([{ id: "si:late", route: "si:SIF", times: [{ dep: 89_400 }, { arr: 90_900 }] }]);
    expect(f.routes[0].stops).toHaveLength(3);
    expect(merge([f, f]).trips).toHaveLength(2);
  });
});
