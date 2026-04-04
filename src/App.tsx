import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import SvgRouteTransition, { type SvgRouteTransitionHandle } from "@/components/SvgRouteTransition";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import SearchPage from "./pages/SearchPage.tsx";
import InternalMetrics from "./pages/InternalMetrics.tsx";
import About from "./pages/About.tsx";
import { initPostHog, capturePageView } from "./lib/posthog-client";

const queryClient = new QueryClient();

const shouldUseSvgTransition = (fromPath: string, toPath: string) => {
  return fromPath !== toPath;
};

const RouteTransitionLayer = () => {
  const location = useLocation();
  const [displayLocation, setDisplayLocation] = useState(location);
  const transitionRef = useRef<SvgRouteTransitionHandle>(null);
  const prevPathnameRef = useRef(location.pathname);
  const navLockRef = useRef(false);

  useEffect(() => {
    initPostHog();
  }, []);

  useEffect(() => {
    const fromPath = displayLocation.pathname;
    const toPath = location.pathname;
    const fromSearch = displayLocation.search;
    const toSearch = location.search;

    // If only search params changed, just update display without transition
    if (fromPath === toPath && fromSearch !== toSearch) {
      setDisplayLocation(location);
      prevPathnameRef.current = toPath;
      return;
    }

    if (displayLocation.pathname === location.pathname) {
      prevPathnameRef.current = toPath;
      return;
    }

    const useSvgTransition = shouldUseSvgTransition(fromPath, toPath);

    if (!useSvgTransition || navLockRef.current) {
      setDisplayLocation(location);
      prevPathnameRef.current = toPath;
      capturePageView();
      return;
    }

    navLockRef.current = true;
    const targetLocation = location;

    const run = async () => {
      await transitionRef.current?.playOut();
      setDisplayLocation(targetLocation);
      prevPathnameRef.current = targetLocation.pathname;
      capturePageView();
      await transitionRef.current?.playIn();
      navLockRef.current = false;
    };

    void run();
  }, [location.pathname, location.search]);

  return (
    <>
      <SvgRouteTransition ref={transitionRef} />
      <div className="relative min-h-screen">
        <Routes location={displayLocation}>
          <Route path="/" element={<Index />} />
          <Route path="/about" element={<About />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/internal/metrics" element={<InternalMetrics />} />

          <Route path="/app/search" element={<Navigate to={`/search${displayLocation.search}`} replace />} />
          <Route path="/app/*" element={<Navigate to="/search" replace />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <RouteTransitionLayer />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
