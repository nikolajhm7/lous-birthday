"use client";

import Image from "next/image";
import { useMemo } from "react";

const getBaseUrl = () => {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "http://localhost:3000";
};

export default function QrPage() {
  const orderUrl = useMemo(() => getBaseUrl(), []);
  const qrUrl = useMemo(
    () =>
      `https://api.qrserver.com/v1/create-qr-code/?size=1200x1200&margin=24&data=${encodeURIComponent(orderUrl)}`,
    [orderUrl]
  );

  return (
    <main className="app-shell min-h-screen p-6 bg-party-950 text-party-100">
      <div className="app-content max-w-3xl mx-auto">
        <div className="glass-panel rounded-2xl p-6 md:p-10">
          <h1 className="text-3xl md:text-4xl font-bold mb-3">🎉 Scan og bestil drinks 🎉</h1>
          <p className="text-party-300 mb-6">Scan QR-koden med kameraet for at åbne bestillingssiden.</p>

          <div className="bg-white rounded-2xl p-4 md:p-6 mb-5 mx-auto w-full max-w-xl">
            <Image
              alt="QR kode til drinks bestilling"
              className="w-full h-auto"
              height={1200}
              src={qrUrl}
              unoptimized
              width={1200}
            />
          </div>

          <p className="text-sm text-party-300 break-all mb-6">Link: {orderUrl}</p>

          <div className="no-print flex flex-wrap gap-3">
            <button
              className="fancy-btn bg-party-600 text-party-950 rounded-lg px-5 py-3 font-semibold"
              onClick={() => window.print()}
              type="button"
            >
              Print QR
            </button>

            <a className="fancy-btn border border-party-700 rounded-lg px-5 py-3" href="/admin">
              Tilbage til admin
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
