/**
 * The app itself, loaded by main.tsx once the static chat bar has painted.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DataViewProvider } from "@/lib/store/DataViewContext";
import { MapStateProvider } from "@/lib/store/MapStateContext";
import { PanelProvider } from "@/lib/store/PanelContext";
import { keepLastData } from "@/lib/queryKeep";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
// The previous visit's line shapes and stations show at once; fresh data replaces them (#368).
keepLastData(queryClient);
// Station data, trip steps and the page itself stay on the phone once seen, for below the street (#132).
void import("@/lib/offline/worker").then((m) => m.registerOfflineWorker()).catch(() => undefined);

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <MapStateProvider>
          <DataViewProvider>
            <PanelProvider>
              <TooltipProvider delayDuration={200}>
                <ErrorBoundary name="app">
                  <App />
                </ErrorBoundary>
                <Toaster />
              </TooltipProvider>
            </PanelProvider>
          </DataViewProvider>
        </MapStateProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
