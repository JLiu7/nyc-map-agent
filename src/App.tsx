import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import Index from "@/pages/Index";

// The walk recorder is its own page and its own chunk; the map page never loads it.
const RecordPage = lazy(() => import("@/features/recorder/capture/RecordPage"));

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/record" element={<Suspense fallback={null}><RecordPage /></Suspense>} />
    </Routes>
  );
}
