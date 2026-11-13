import LivePaused from "./LivePaused";
import { StationWalkHost } from "./stationWalk/StationWalkHost";
import { StreetEntry } from "./stationWalk/StreetEntry";

/** Transit's overlays on the map page: "Paused, tap to resume", the way down a Fulton St stair in Street view, and the walk inside while it is open. */
export default function TransitOverlays() {
  return (
    <>
      <LivePaused />
      <StreetEntry />
      <StationWalkHost />
    </>
  );
}
