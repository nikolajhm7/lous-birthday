"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type DeferredPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export default function InstallPage() {
  const [deferredPrompt, setDeferredPrompt] = useState<DeferredPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    const isIOS = /iPhone|iPad|iPod/i.test(window.navigator.userAgent);
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches;

    const timeoutId = window.setTimeout(() => {
      setShowIosHint(isIOS && !isStandalone);
    }, 0);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as DeferredPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      return;
    }

    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  return (
    <main className="party-hero min-h-screen flex items-center justify-center bg-party-950 text-party-100 px-4">
      <div className="party-blob party-blob-one" />
      <div className="party-blob party-blob-two" />
      <div className="party-blob party-blob-three" />

      <div className="party-card menu-card glass-panel p-8 rounded-2xl w-full max-w-md text-center">
        <h1 className="party-title text-3xl font-bold mb-4">📲 Installér Lou&apos;s Drinks</h1>
        <p className="text-party-300 mb-6">
          Installer appen på hjemmeskærmen for hurtig adgang og notifikationer.
        </p>

        {deferredPrompt ? (
          <button
            className="fancy-btn w-full bg-party-600 text-party-950 py-3 rounded-lg font-semibold"
            onClick={handleInstall}
            type="button"
          >
            Installér app
          </button>
        ) : null}

        {showIosHint ? (
          <p className="text-sm text-party-300 mb-5">
            iPhone: tryk Del-ikonet i Safari og vælg &quot;Føj til hjemmeskærm&quot;.
          </p>
        ) : null}

        <Link
          className="fancy-btn inline-flex justify-center w-full mt-3 border border-party-700 text-party-100 py-3 rounded-lg font-semibold"
          href="/"
        >
          Åbn bestilling
        </Link>
      </div>
    </main>
  );
}
