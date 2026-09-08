"use client";

import { useEffect, useState } from "react";

/**
 * Notice when a newer build has been deployed.
 *
 * A tab left open for a week keeps running the JavaScript it loaded on day
 * one — it never re-fetches the page on its own — so new screens simply do
 * not appear and it looks like the app is broken. The service worker knows
 * when it has been replaced; this turns that into a visible "reload" prompt.
 */
export function useUpdateAvailable(): { ready: boolean; reload: () => void } {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let cancelled = false;

    const register = async () => {
      let registration: ServiceWorkerRegistration;
      try {
        registration = await navigator.serviceWorker.register("/sw.js");
      } catch {
        return; // Offline support is a bonus; the app works without it.
      }
      if (cancelled) return;

      // A worker already waiting means this tab is running the old build.
      if (registration.waiting && navigator.serviceWorker.controller) setReady(true);

      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          // Only an *update* counts: on a first visit there is no controller
          // yet and nothing to reload for.
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            setReady(true);
          }
        });
      });

      const check = () => {
        if (document.visibilityState === "visible") void registration.update();
      };
      const timer = setInterval(check, 5 * 60_000);
      document.addEventListener("visibilitychange", check);
      window.addEventListener("focus", check);

      return () => {
        clearInterval(timer);
        document.removeEventListener("visibilitychange", check);
        window.removeEventListener("focus", check);
      };
    };

    // Registering immediately competes with first paint; a beat later is fine.
    const timer = setTimeout(() => void register(), 1200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return { ready, reload: () => window.location.reload() };
}
