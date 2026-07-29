"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => {
          registrations.forEach((registration) => {
            void registration.unregister();
          });
        })
        .catch(() => {
          // Development remains usable if old registrations cannot be removed.
        });
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // The application remains usable without offline shell caching.
    });
  }, []);

  return null;
}
