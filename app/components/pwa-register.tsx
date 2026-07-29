"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (
      process.env.NODE_ENV === "production" &&
      "serviceWorker" in navigator
    ) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // The application remains usable without offline shell caching.
      });
    }
  }, []);

  return null;
}
