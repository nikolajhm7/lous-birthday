"use client";

import { useEffect, useState } from "react";

type DeferredPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const getCookieValue = (key: string) => {
  if (typeof document === "undefined") {
    return "";
  }

  const match = document.cookie
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${key}=`));

  return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : "";
};

const getPersistedNickname = () => {
  if (typeof window === "undefined") {
    return "";
  }

  return localStorage.getItem("nickname")?.trim() ?? getCookieValue("nickname") ?? "";
};

export default function Home() {
  const [nickname, setNickname] = useState(() => getPersistedNickname());
  const [savedNickname, setSavedNickname] = useState<string | null>(() => {
    const persisted = getPersistedNickname();
    return persisted || null;
  });
  const [deferredPrompt, setDeferredPrompt] = useState<DeferredPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    const localNickname = localStorage.getItem("nickname")?.trim() ?? "";
    const cookieNickname = getCookieValue("nickname").trim();

    if (!localNickname && cookieNickname) {
      localStorage.setItem("nickname", cookieNickname);
    }

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

  const handleContinue = () => {
    const trimmed = nickname.trim();
    if (!trimmed) {
      return;
    }

    localStorage.setItem("nickname", trimmed);
    document.cookie = `nickname=${encodeURIComponent(trimmed)}; Max-Age=31536000; Path=/; SameSite=Lax`;
    window.location.href = "/orders";
  };

  return (
    <main className="party-hero min-h-screen flex items-center justify-center bg-party-950 text-party-100 px-4">
      <div className="party-blob party-blob-one" />
      <div className="party-blob party-blob-two" />
      <div className="party-blob party-blob-three" />

      <div className="party-card menu-card glass-panel p-8 rounded-2xl w-full max-w-md">
        <h1 className="party-title text-3xl font-bold text-center mb-6">
          🍸 Velkommen 🍸
        </h1>

        {savedNickname ? (
          <div className="space-y-3 mb-4">
            <button
              className="fancy-btn w-full bg-party-600 text-party-950 py-3 rounded-lg font-semibold"
              onClick={handleContinue}
              type="button"
            >
              Fortsæt som {savedNickname}
            </button>

            <button
              className="fancy-btn w-full border border-party-700 text-party-100 py-3 rounded-lg font-semibold"
              onClick={() => {
                setSavedNickname(null);
                setNickname("");
              }}
              type="button"
            >
              Brug et andet navn
            </button>
          </div>
        ) : (
          <>
            <input
              className="fancy-btn w-full border border-party-700 bg-party-950/80 text-party-100 rounded-lg p-3 mb-4"
              placeholder="Dit navn"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />

            <button
              className="fancy-btn w-full bg-party-600 text-party-950 py-3 rounded-lg font-semibold"
              onClick={handleContinue}
            >
              Fortsæt
            </button>
          </>
        )}

        {deferredPrompt ? (
          <button
            className="fancy-btn w-full mt-3 border border-party-700 text-party-100 py-3 rounded-lg font-semibold"
            onClick={handleInstall}
            type="button"
          >
            Installér app på telefon
          </button>
        ) : null}

        {showIosHint ? (
          <p className="text-xs text-party-300 mt-3">
            iPhone: tryk Del-ikonet i Safari og vælg &quot;Føj til hjemmeskærm&quot;.
          </p>
        ) : null}
      </div>
    </main>
  );
}