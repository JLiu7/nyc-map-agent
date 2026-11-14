import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import Index from "@/pages/Index";
import { loadRecordPage } from "@/features";

const RecordPage = lazy(loadRecordPage);

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/record" element={<Suspense fallback={<div className="fixed inset-0 bg-black" />}><RecordPage /></Suspense>} />
    </Routes>
  );
}
