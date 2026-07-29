"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // The application remains usable without offline shell caching.
      });
      return;
    }

    const wasControlled = Boolean(navigator.serviceWorker.controller);
    Promise.all([
      navigator.serviceWorker.getRegistrations().then((registrations) =>
        Promise.all(
          registrations
            .filter((registration) =>
              registration.active?.scriptURL.endsWith("/sw.js"),
            )
            .map((registration) => registration.unregister()),
        ),
      ),
      "caches" in window
        ? caches
            .keys()
            .then((keys) =>
              Promise.all(
                keys
                  .filter((key) => key.startsWith("xe-schet-shell-"))
                  .map((key) => caches.delete(key)),
              ),
            )
        : Promise.resolve([]),
    ])
      .then(() => {
        if (wasControlled) window.location.reload();
      })
      .catch(() => {
        // Development still works if browser storage cannot be cleaned.
      });
  }, []);

  return null;
}
