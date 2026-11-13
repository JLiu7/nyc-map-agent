import LivePaused from "./LivePaused";
import { StationWalkHost } from "./stationWalk/StationWalkHost";

/** Transit's overlays on the map page: "Paused, tap to resume", and the walk inside Fulton St while it is open. */
export default function TransitOverlays() {
  return (
    <>
      <LivePaused />
      <StationWalkHost />
    </>
  );
}
