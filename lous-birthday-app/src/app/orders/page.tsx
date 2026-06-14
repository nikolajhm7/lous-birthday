"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/app/supabase";
import { getOrderStatusLabel, OrderStatus } from "@/lib/models";

type MyOrder = {
  id: string;
  quantity: number;
  status: OrderStatus;
  created_at: string;
  drinks: {
    name: string;
  } | null;
};

type RawMyOrderRow = {
  id: string;
  quantity: number;
  status: OrderStatus;
  created_at: string;
  drinks: { name: string } | { name: string }[] | null;
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<MyOrder[]>([]);
  const [nickname, setNickname] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission | null>(() => {
      if (typeof window !== "undefined" && "Notification" in window) {
        return Notification.permission;
      }
      return null;
    });
  const previousStatusesRef = useRef<Record<string, OrderStatus>>({});

  const playBellSound = useCallback(() => {
    const AudioCtx = window.AudioContext || (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioCtx) {
      return;
    }

    const context = new AudioCtx();
    const now = context.currentTime;

    const ring = (frequency: number, offset: number) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(frequency, now + offset);
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.15, now + offset + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.45);

      oscillator.connect(gain);
      gain.connect(context.destination);

      oscillator.start(now + offset);
      oscillator.stop(now + offset + 0.5);
    };

    ring(880, 0);
    ring(1174, 0.18);
  }, []);

  const notifyReadyOrder = useCallback(async (order: MyOrder) => {
    playBellSound();

    if (notificationPermission !== "granted") {
      return;
    }

    const title = "🍹 Din drink er klar";
    const body = `${order.drinks?.name ?? "Din bestilling"} er klar til afhentning`;

    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, {
        body,
        tag: `order-ready-${order.id}`,
      });
      return;
    }

    new Notification(title, { body });
  }, [notificationPermission, playBellSound]);

  const syncAndNotifyReadyTransitions = useCallback((nextOrders: MyOrder[]) => {
    const previousStatuses = previousStatusesRef.current;

    for (const order of nextOrders) {
      const previousStatus = previousStatuses[order.id];

      if (
        previousStatus &&
        previousStatus !== "ready" &&
        order.status === "ready" &&
        (previousStatus === "new" || previousStatus === "in_progress")
      ) {
        void notifyReadyOrder(order);
      }

      previousStatuses[order.id] = order.status;
    }

    const nextIds = new Set(nextOrders.map((order) => order.id));
    for (const orderId of Object.keys(previousStatuses)) {
      if (!nextIds.has(orderId)) {
        delete previousStatuses[orderId];
      }
    }
  }, [notifyReadyOrder]);

  useEffect(() => {
    const savedNickname = localStorage.getItem("nickname")?.trim() ?? "";
    if (!savedNickname) {
      window.location.href = "/";
      return;
    }

    const fetchOrders = async () => {
      const { data, error: fetchError } = await supabase
        .from("orders")
        .select("id,quantity,status,created_at,drinks(name)")
        .eq("guest_name", savedNickname)
        .order("created_at", { ascending: false });

      if (fetchError) {
        setError("Kunne ikke hente dine ordrer.");
        setLoading(false);
        return;
      }

      const normalizedOrders: MyOrder[] = ((data ?? []) as RawMyOrderRow[]).map((row) => ({
        ...row,
        drinks: Array.isArray(row.drinks) ? (row.drinks[0] ?? null) : row.drinks,
      }));

      syncAndNotifyReadyTransitions(normalizedOrders);
      setOrders(normalizedOrders);
      setLoading(false);
    };

    const timeoutId = window.setTimeout(() => {
      setNickname(savedNickname);
      void fetchOrders();
    }, 0);

    const channel = supabase
      .channel("my-orders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        (payload) => {
          const newGuestName =
            payload.eventType === "DELETE"
              ? (payload.old?.guest_name as string | undefined)
              : (payload.new?.guest_name as string | undefined);

          if (newGuestName === savedNickname) {
            void fetchOrders();
          }
        }
      )
      .subscribe((status) => {
        setIsLive(status === "SUBSCRIBED");
      });

    const intervalId = window.setInterval(() => {
      void fetchOrders();
    }, 8000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void fetchOrders();
      }
    };

    const handleFocus = () => {
      void fetchOrders();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      supabase.removeChannel(channel);
    };
  }, [syncAndNotifyReadyTransitions]);

  if (loading) {
    return <main className="min-h-screen p-8 bg-party-950 text-party-100">Henter ordrer...</main>;
  }

  const requestNotifications = async () => {
    if (!("Notification" in window)) {
      setError("Notifikationer understøttes ikke i denne browser.");
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);

    if (permission !== "granted") {
      setError("Notifikationer blev ikke tilladt.");
      return;
    }

    setError(null);
  };

  const statusClass = (status: OrderStatus) => {
    if (status === "new") {
      return "border-party-500 bg-party-500/20 text-party-200";
    }
    if (status === "in_progress") {
      return "border-party-400 bg-party-400/20 text-party-100";
    }
    if (status === "ready") {
      return "border-emerald-300 bg-emerald-300/15 text-emerald-100";
    }
    return "border-party-300 bg-party-300/15 text-party-200";
  };

  return (
    <main className="app-shell min-h-screen p-8 pb-32 bg-party-950 text-party-100">
      <div className="app-content max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-2">
        <h1 className="fade-up text-4xl font-bold">📋 Dine ordrer</h1>
        <span
          className={`text-xs rounded-full px-3 py-1 border ${
            isLive
              ? "border-emerald-300 text-emerald-100 bg-emerald-300/15"
              : "border-party-700 text-party-300"
          }`}
        >
          {isLive ? "Live" : "Offline"}
        </span>
      </div>
      {nickname ? <p className="text-party-300 mb-8">Hej {nickname}</p> : null}
      {error ? <p className="mb-4 text-party-300">{error}</p> : null}

      {notificationPermission !== "granted" ? (
        <button
          className="fancy-btn border border-party-700 rounded-lg px-4 py-2 mb-6"
          onClick={requestNotifications}
          type="button"
        >
          Aktivér notifikationer
        </button>
      ) : (
        <p className="text-sm text-emerald-200 mb-6">Notifikationer er aktive 🔔</p>
      )}

      {orders.length === 0 ? (
        <p className="text-party-300">Ingen ordrer</p>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <article
              className="card-float glass-panel rounded-xl p-4 flex items-center justify-between gap-4"
              key={order.id}
            >
              <div>
                <p className="font-semibold text-party-100">{order.drinks?.name ?? "Ukendt drink"}</p>
                <p className="text-sm text-party-300">Antal: {order.quantity}</p>
              </div>

              <span
                className={`text-sm border rounded-full px-3 py-1 ${statusClass(order.status)}`}
              >
                {getOrderStatusLabel(order.status)}
              </span>
            </article>
          ))}
        </div>
      )}

      <div className="fixed left-0 right-0 bottom-0 p-4 bg-party-950/95 backdrop-blur-sm border-t border-party-800">
        <div className="max-w-4xl mx-auto">
          <a
            className="fancy-btn inline-flex bg-party-600 text-party-950 rounded-lg px-5 py-3 font-semibold"
            href="/menu"
          >
            Tilføj ordrer
          </a>
        </div>
      </div>
      </div>
    </main>
  );
}
