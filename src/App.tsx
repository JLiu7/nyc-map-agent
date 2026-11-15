import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import Index from "@/pages/Index";
import { loadRecordPage, loadStationCloudPage, loadTrackerHealthPage } from "@/features";

const RecordPage = lazy(loadRecordPage);
const StationCloudPage = lazy(loadStationCloudPage);
const TrackerHealthPage = lazy(loadTrackerHealthPage);

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/record" element={<Suspense fallback={<div className="fixed inset-0 bg-black" />}><RecordPage /></Suspense>} />
      <Route path="/station-3d" element={<Suspense fallback={<div className="fixed inset-0 bg-black" />}><StationCloudPage /></Suspense>} />
      <Route path="/tracker-health" element={<Suspense fallback={<div className="fixed inset-0 bg-[#0b1220]" />}><TrackerHealthPage /></Suspense>} />
    </Routes>
  );
}
