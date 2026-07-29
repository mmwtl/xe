"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallButton() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(
    null,
  );
  const [installedFromPrompt, setInstalledFromPrompt] = useState(false);
  const isStandalone = useSyncExternalStore(
    subscribeToDisplayMode,
    getDisplayModeSnapshot,
    getDisplayModeServerSnapshot,
  );

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (isStandalone || installedFromPrompt) {
    return <span className="installed-state">Установлено</span>;
  }

  if (!promptEvent) {
    return <span className="pwa-state">Можно установить как приложение</span>;
  }

  const install = async () => {
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === "accepted") setInstalledFromPrompt(true);
    setPromptEvent(null);
  };

  return (
    <button className="install-button" type="button" onClick={install}>
      Установить
    </button>
  );
}

function subscribeToDisplayMode(callback: () => void) {
  const media = window.matchMedia("(display-mode: standalone)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function getDisplayModeSnapshot() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

function getDisplayModeServerSnapshot() {
  return false;
}
