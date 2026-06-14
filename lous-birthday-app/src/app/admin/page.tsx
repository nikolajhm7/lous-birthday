"use client";

import { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/app/supabase";
import {
  Drink,
  getOrderStatusLabel,
  ORDER_STATUSES,
  OrderStatus,
  OrderWithDrink,
} from "@/lib/models";

type DrinkFormState = {
  name: string;
  description: string;
};

type RawOrderDrink = {
  id: string;
  name: string;
  price_dkk: number;
};

type RawOrderRow = {
  id: string;
  order_group_id: string;
  guest_name: string;
  quantity: number;
  note: string | null;
  status: OrderStatus;
  created_at: string;
  drinks: RawOrderDrink | RawOrderDrink[] | null;
};

type GroupedAdminOrder = {
  groupId: string;
  guest_name: string;
  status: OrderStatus;
  created_at: string;
  items: {
    id: string;
    drinkName: string;
    quantity: number;
    note: string | null;
  }[];
};

const DRINK_IMAGES_BUCKET = "drink-images";

export default function AdminPage() {
  const [orders, setOrders] = useState<OrderWithDrink[]>([]);
  const [drinks, setDrinks] = useState<Drink[]>([]);
  const [drinkForm, setDrinkForm] = useState<DrinkFormState>({
    name: "",
    description: "",
  });
  const [drinkImageFile, setDrinkImageFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDrinks = async () => {
    const { data, error: drinksError } = await supabase
      .from("drinks")
      .select("id,name,description,image_url,low_stock,price_dkk,is_active")
      .order("name", { ascending: true });

    if (drinksError) {
      setError("Kunne ikke hente drinks.");
      return;
    }

    setDrinks((data ?? []) as Drink[]);
  };

  const fetchOrders = async () => {
    const { data, error: ordersError } = await supabase
      .from("orders")
      .select(
        "id,order_group_id,guest_name,quantity,note,status,created_at,drinks(id,name,price_dkk)"
      )
      .order("created_at", { ascending: false });

    if (ordersError) {
      setError("Kunne ikke hente bestillinger.");
      setLoading(false);
      return;
    }

    const normalizedOrders: OrderWithDrink[] = ((data ?? []) as RawOrderRow[]).map(
      (row) => ({
        ...row,
        drinks: Array.isArray(row.drinks) ? (row.drinks[0] ?? null) : row.drinks,
      })
    );

    setOrders(normalizedOrders);
    setLoading(false);
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchOrders();
      void fetchDrinks();
    }, 0);

    const channel = supabase
      .channel("admin-orders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          fetchOrders();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "drinks" },
        () => {
          fetchDrinks();
        }
      )
      .subscribe();

    return () => {
      window.clearTimeout(timeoutId);
      supabase.removeChannel(channel);
    };
  }, []);

  const grouped = useMemo(() => {
    const groupedMap = new Map<string, GroupedAdminOrder>();

    for (const order of orders) {
      const key = order.order_group_id || order.id;
      const existing = groupedMap.get(key);

      if (existing) {
        existing.items.push({
          id: order.id,
          drinkName: order.drinks?.name ?? "Ukendt drink",
          quantity: order.quantity,
          note: order.note,
        });
        continue;
      }

      groupedMap.set(key, {
        groupId: key,
        guest_name: order.guest_name,
        status: order.status,
        created_at: order.created_at,
        items: [
          {
            id: order.id,
            drinkName: order.drinks?.name ?? "Ukendt drink",
            quantity: order.quantity,
            note: order.note,
          },
        ],
      });
    }

    const groupedOrders = Array.from(groupedMap.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const active = groupedOrders.filter(
      (order) => order.status !== "delivered" && order.status !== "ready"
    );
    const done = groupedOrders.filter(
      (order) => order.status === "delivered" || order.status === "ready"
    );

    return { active, done };
  }, [orders]);

  const updateStatus = async (orderGroupId: string, status: OrderStatus) => {
    const allGroupedOrders = grouped.active.concat(grouped.done);
    const targetOrder = allGroupedOrders.find((order) => order.groupId === orderGroupId);
    const previousStatus = targetOrder?.status;

    const { error: updateError } = await supabase
      .from("orders")
      .update({ status })
      .eq("order_group_id", orderGroupId);

    if (updateError) {
      setError("Kunne ikke opdatere status.");
      return;
    }

    setOrders((previous) =>
      previous.map((order) =>
        order.order_group_id === orderGroupId ? { ...order, status } : order
      )
    );

    if (status === "ready" && previousStatus && previousStatus !== "ready" && targetOrder) {
      const guestOrderNumbers = allGroupedOrders
        .filter((order) => order.guest_name === targetOrder.guest_name)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      const orderIndex = guestOrderNumbers.findIndex((order) => order.groupId === orderGroupId);
      const orderNumber = orderIndex >= 0 ? orderIndex + 1 : 1;

      const response = await fetch("/api/push/notify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          guestName: targetOrder.guest_name,
          title: "🍹 Klar til afhentning",
          body: `Din Ordre #${orderNumber} er klar til afhentning!`,
          tag: `order-ready-${orderGroupId}`,
          url: "/orders",
        }),
      });

      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as
          | { error?: string; sent?: number }
          | null;
        setError(result?.error ?? "Push-notifikation kunne ikke sendes.");
      }
    }
  };

  const handleCreateDrink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setUploading(true);

    const name = drinkForm.name.trim();
    if (!name) {
      setError("Drink navn mangler.");
      setUploading(false);
      return;
    }

    let uploadedImageUrl: string | null = null;

    if (drinkImageFile) {
      const fileExt = drinkImageFile.name.includes(".")
        ? drinkImageFile.name.split(".").pop()
        : "jpg";
      const filePath = `${crypto.randomUUID()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from(DRINK_IMAGES_BUCKET)
        .upload(filePath, drinkImageFile, { upsert: false });

      if (uploadError) {
        setError("Kunne ikke uploade billede.");
        setUploading(false);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from(DRINK_IMAGES_BUCKET)
        .getPublicUrl(filePath);

      uploadedImageUrl = publicUrlData.publicUrl;
    }

    const { error: insertError } = await supabase.from("drinks").insert({
      name,
      description: drinkForm.description.trim() || null,
      image_url: uploadedImageUrl,
      low_stock: false,
      is_active: true,
      price_dkk: 0,
    });

    if (insertError) {
      setError("Kunne ikke tilføje drink.");
      setUploading(false);
      return;
    }

    setDrinkForm({ name: "", description: "" });
    setDrinkImageFile(null);
    setError(null);
    setUploading(false);
    fetchDrinks();
  };

  const extractStoragePathFromPublicUrl = (publicUrl: string) => {
    const marker = `/storage/v1/object/public/${DRINK_IMAGES_BUCKET}/`;
    const markerIndex = publicUrl.indexOf(marker);
    if (markerIndex === -1) {
      return null;
    }

    const pathPart = publicUrl.slice(markerIndex + marker.length);
    return decodeURIComponent(pathPart);
  };

  const toggleDrinkField = async (
    drinkId: string,
    field: "low_stock" | "is_active",
    value: boolean
  ) => {
    const { error: updateError } = await supabase
      .from("drinks")
      .update({ [field]: value })
      .eq("id", drinkId);

    if (updateError) {
      setError("Kunne ikke opdatere drink.");
      return;
    }

    setDrinks((previous) =>
      previous.map((drink) => (drink.id === drinkId ? { ...drink, [field]: value } : drink))
    );
  };

  const deleteDrink = async (drink: Drink) => {
    if (drink.image_url) {
      const storagePath = extractStoragePathFromPublicUrl(drink.image_url);
      if (storagePath) {
        await supabase.storage.from(DRINK_IMAGES_BUCKET).remove([storagePath]);
      }
    }

    const { error: deleteError } = await supabase.from("drinks").delete().eq("id", drink.id);

    if (deleteError) {
      setError("Kunne ikke fjerne drink.");
      return;
    }

    setDrinks((previous) => previous.filter((currentDrink) => currentDrink.id !== drink.id));
  };

  const renderOrderCard = (order: GroupedAdminOrder) => (
    <article className="card-float glass-panel rounded-xl p-4" key={order.groupId}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold text-party-100">{order.guest_name}</p>
          <div className="space-y-1 mt-2">
            {order.items.map((item) => (
              <p className="text-sm text-party-300" key={item.id}>
                {item.quantity}x {item.drinkName}
              </p>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <span
            className={`text-xs border rounded-full px-2 py-1 ${
              order.status === "new"
                ? "border-party-500 bg-party-500/20 text-party-200"
                : order.status === "in_progress"
                  ? "border-party-400 bg-party-400/20 text-party-100"
                  : order.status === "ready"
                    ? "border-emerald-300 bg-emerald-300/15 text-emerald-100"
                    : "border-party-300 bg-party-300/15 text-party-200"
            }`}
          >
            {getOrderStatusLabel(order.status)}
          </span>

          <select
            className="border border-party-700 bg-party-950/80 rounded-lg p-2"
            onChange={(event) => updateStatus(order.groupId, event.target.value as OrderStatus)}
            value={order.status}
          >
            {ORDER_STATUSES.map((statusOption) => (
              <option key={statusOption.value} value={statusOption.value}>
                {statusOption.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </article>
  );

  if (loading) {
    return <main className="min-h-screen p-8 bg-party-950 text-party-100">Henter bestillinger...</main>;
  }

  return (
    <main className="app-shell min-h-screen p-8 bg-party-950 text-party-100">
      <div className="app-content max-w-4xl mx-auto">
      <h1 className="fade-up text-4xl font-bold mb-8">🧾 Admin: Bestillinger</h1>

      <a className="fancy-btn inline-flex border border-party-700 rounded-lg px-4 py-2 mb-6" href="/qr">
        Åbn printvenlig QR
      </a>

      {error ? <p className="mb-4 text-party-300">{error}</p> : null}

      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-4">Nuværende</h2>
        <div className="space-y-4">
          {grouped.active.length === 0 ? (
            <p>Ingen aktive bestillinger.</p>
          ) : (
            grouped.active.map(renderOrderCard)
          )}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Tidligere</h2>
        <div className="space-y-4">
          {grouped.done.length === 0 ? (
            <p>Ingen tidligere bestillinger.</p>
          ) : (
            grouped.done.map(renderOrderCard)
          )}
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-semibold mb-4">Drinks kort</h2>

        <form
          className="glass-panel rounded-xl p-4 space-y-3 mb-6"
          onSubmit={handleCreateDrink}
        >
          <p className="font-semibold">Tilføj drink</p>

          <input
            className="w-full border border-party-700 bg-party-950/80 rounded-lg p-2"
            onChange={(event) =>
              setDrinkForm((previous) => ({ ...previous, name: event.target.value }))
            }
            placeholder="Navn"
            value={drinkForm.name}
          />

          <input
            className="w-full border border-party-700 bg-party-950/80 rounded-lg p-2"
            onChange={(event) =>
              setDrinkForm((previous) => ({ ...previous, description: event.target.value }))
            }
            placeholder="Beskrivelse"
            value={drinkForm.description}
          />

          <input
            className="w-full border border-party-700 bg-party-950/80 rounded-lg p-2"
            accept="image/*"
            onChange={(event) => setDrinkImageFile(event.target.files?.[0] ?? null)}
            type="file"
          />

          <button
            className="fancy-btn bg-party-600 text-party-950 rounded-lg px-4 py-2 disabled:opacity-70"
            disabled={uploading}
            type="submit"
          >
            {uploading ? "Uploader..." : "Tilføj drink"}
          </button>
        </form>

        <div className="space-y-4">
          {drinks.map((drink) => (
            <article
              className="card-float glass-panel rounded-xl p-4 flex flex-col gap-3"
              key={drink.id}
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold">{drink.name}</p>
                  {drink.description ? (
                    <p className="text-sm text-party-300">{drink.description}</p>
                  ) : null}
                </div>

                <button
                  className="fancy-btn border border-party-700 rounded-lg px-3 py-1 text-sm"
                  onClick={() => deleteDrink(drink)}
                  type="button"
                >
                  Fjern
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    checked={drink.is_active}
                    onChange={(event) =>
                      toggleDrinkField(drink.id, "is_active", event.target.checked)
                    }
                    type="checkbox"
                  />
                  Aktiv i menu
                </label>

                <label className="flex items-center gap-2">
                  <input
                    checked={drink.low_stock}
                    onChange={(event) =>
                      toggleDrinkField(drink.id, "low_stock", event.target.checked)
                    }
                    type="checkbox"
                  />
                  Få tilbage
                </label>
              </div>
            </article>
          ))}
        </div>
      </section>
      </div>
    </main>
  );
}
