"use client";

import { useEffect, useState } from "react";
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

    return () => {
      window.clearTimeout(timeoutId);
      supabase.removeChannel(channel);
    };
  }, []);

  if (loading) {
    return <main className="min-h-screen p-8 bg-party-950 text-party-100">Henter ordrer...</main>;
  }

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
