"use client";

import { useState } from "react";

export default function Home() {
  const [nickname, setNickname] = useState("");

  const handleContinue = () => {
    const trimmed = nickname.trim();
    if (!trimmed) {
      return;
    }

    localStorage.setItem("nickname", trimmed);
    window.location.href = "/orders";
  };

  return (
    <main className="party-hero min-h-screen flex items-center justify-center bg-party-950 text-party-100 px-4">
      <div className="party-blob party-blob-one" />
      <div className="party-blob party-blob-two" />
      <div className="party-blob party-blob-three" />

      <div className="party-card glass-panel p-8 rounded-2xl w-full max-w-md">
        <h1 className="party-title text-3xl font-bold text-center mb-6">
          🍸 Lou&apos;s Drinks Menu 🍹
        </h1>

        <input
          className="w-full border border-party-700 bg-party-950/80 text-party-100 rounded-lg p-3 mb-4"
          placeholder="Dit nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
        />

        <button
          className="fancy-btn w-full bg-party-600 text-party-950 py-3 rounded-lg font-semibold"
          onClick={handleContinue}
        >
          Fortsæt
        </button>

        <a className="block text-center text-sm text-party-300 mt-4 underline" href="/admin">
          Gå til admin
        </a>
      </div>
    </main>
  );
}