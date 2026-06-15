"use client";

import { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/app/supabase";
import {
  Drink,
  getOrderStatusLabel,
  getMenuCategoryLabel,
  MENU_CATEGORIES,
  MenuCategory,
  ORDER_STATUSES,
  OrderStatus,
  OrderWithDrink,
} from "@/lib/models";

type DrinkFormState = {
  name: string;
  description: string;
  category: MenuCategory;
  alcohol_units: string;
};

type DrinkDraftState = {
  name: string;
  description: string;
  category: MenuCategory;
  alcohol_units: string;
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
const PARTY_MISSIONS = [
  "Find en at skale med inden 2 minutter 🥂",
  "Tag en selfie med en ny ven 📸",
  "Byt plads med personen til venstre i 1 sang 🔄",
  "Giv et kompliment til 3 personer ✨",
  "Lav dit bedste dansetrin i 20 sekunder 💃",
  "Start en mini-skålerunde med 4 personer 🍻",
  "Find den mest farverige drink og vis den frem 🌈",
  "Syng med på omkvædet i næste sang 🎤",
  "Lær et nyt navn og gentag det højt 🫶",
  "Lav en hemmelig high-five med en fremmed 🙌",
];

export default function AdminPage() {
  const [orders, setOrders] = useState<OrderWithDrink[]>([]);
  const [drinks, setDrinks] = useState<Drink[]>([]);
  const [drinkForm, setDrinkForm] = useState<DrinkFormState>({
    name: "",
    description: "",
    category: "drinks",
    alcohol_units: "1",
  });
  const [drinkImageFile, setDrinkImageFile] = useState<File | null>(null);
  const [drinkDrafts, setDrinkDrafts] = useState<Record<string, DrinkDraftState>>({});
  const [editingDrinks, setEditingDrinks] = useState<Record<string, boolean>>({});
  const [drinkEditImageFiles, setDrinkEditImageFiles] = useState<Record<string, File | null>>({});
  const [savingDrinkId, setSavingDrinkId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sendingMissions, setSendingMissions] = useState(false);
  const [missionStatus, setMissionStatus] = useState<string | null>(null);
  const [missionTitle, setMissionTitle] = useState("🎯 Festmission");
  const [missionBodyTemplate, setMissionBodyTemplate] = useState(
    "{name}, din mission: {mission}"
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getDraftForDrink = (drink: Drink): DrinkDraftState =>
    drinkDrafts[drink.id] ?? {
      name: drink.name,
      description: drink.description ?? "",
      category: drink.category,
      alcohol_units: String(drink.alcohol_units ?? 0),
    };

  const fetchDrinks = async () => {
    const { data, error: drinksError } = await supabase
      .from("drinks")
      .select("id,name,description,image_url,category,alcohol_units,low_stock,price_dkk,is_active")
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

  const sendMissionsToAll = async () => {
    if (sendingMissions) {
      return;
    }

    setSendingMissions(true);
    setMissionStatus(null);
    setError(null);

    const trimmedTitle = missionTitle.trim();
    const trimmedBodyTemplate = missionBodyTemplate.trim();

    if (!trimmedTitle || !trimmedBodyTemplate) {
      setError("Udfyld både titel og besked for mission-notifikationen.");
      setSendingMissions(false);
      return;
    }

    const { data, error: subscriptionsError } = await supabase
      .from("push_subscriptions")
      .select("guest_name");

    if (subscriptionsError) {
      setError("Kunne ikke hente push-abonnenter.");
      setSendingMissions(false);
      return;
    }

    const guestNames = Array.from(
      new Set(
        (data ?? [])
          .map((row) => (row as { guest_name?: string }).guest_name?.trim() ?? "")
          .filter((name) => name.length > 0)
      )
    );

    if (guestNames.length === 0) {
      setError("Ingen brugere med aktive notifikationer endnu.");
      setSendingMissions(false);
      return;
    }

    const shuffledMissions = [...PARTY_MISSIONS].sort(() => Math.random() - 0.5);

    const results = await Promise.allSettled(
      guestNames.map(async (guestName, index) => {
        const mission = shuffledMissions[index % shuffledMissions.length];
        const resolvedTitle = trimmedTitle
          .replaceAll("{name}", guestName)
          .replaceAll("{mission}", mission);
        const resolvedBody = trimmedBodyTemplate
          .replaceAll("{name}", guestName)
          .replaceAll("{mission}", mission);
        const response = await fetch("/api/push/notify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            guestName,
            title: resolvedTitle,
            body: resolvedBody,
            tag: `party-mission-${Date.now()}-${index}`,
            url: "/orders",
          }),
        });

        if (!response.ok) {
          throw new Error(`Mission fejlede for ${guestName}`);
        }

        return guestName;
      })
    );

    const successCount = results.filter((result) => result.status === "fulfilled").length;

    if (successCount === 0) {
      setError("Kunne ikke sende mission-notifikationer.");
      setSendingMissions(false);
      return;
    }

    setMissionStatus(`Mission sendt til ${successCount} bruger${successCount > 1 ? "e" : ""} 🎉`);
    setSendingMissions(false);
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

    const alcoholUnits = Number(drinkForm.alcohol_units);
    if (!Number.isFinite(alcoholUnits) || alcoholUnits < 0) {
      setError("Genstande skal være 0 eller højere.");
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
      category: drinkForm.category,
      alcohol_units: alcoholUnits,
      low_stock: false,
      is_active: true,
      price_dkk: 0,
    });

    if (insertError) {
      setError("Kunne ikke tilføje drink.");
      setUploading(false);
      return;
    }

    setDrinkForm({ name: "", description: "", category: "drinks", alcohol_units: "1" });
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
    setDrinkDrafts((previous) => {
      const next = { ...previous };
      delete next[drink.id];
      return next;
    });
    setEditingDrinks((previous) => {
      const next = { ...previous };
      delete next[drink.id];
      return next;
    });
    setDrinkEditImageFiles((previous) => {
      const next = { ...previous };
      delete next[drink.id];
      return next;
    });
  };

  const openEditDrink = (drink: Drink) => {
    setEditingDrinks((previous) => ({ ...previous, [drink.id]: true }));
    setDrinkDrafts((previous) => ({
      ...previous,
      [drink.id]: previous[drink.id] ?? {
        name: drink.name,
        description: drink.description ?? "",
        category: drink.category,
        alcohol_units: String(drink.alcohol_units ?? 0),
      },
    }));
  };

  const closeEditDrink = (drinkId: string) => {
    setEditingDrinks((previous) => {
      const next = { ...previous };
      delete next[drinkId];
      return next;
    });
    setDrinkDrafts((previous) => {
      const next = { ...previous };
      delete next[drinkId];
      return next;
    });
    setDrinkEditImageFiles((previous) => {
      const next = { ...previous };
      delete next[drinkId];
      return next;
    });
  };

  const updateDrinkDraft = (
    drinkId: string,
    field: keyof DrinkDraftState,
    value: string | MenuCategory
  ) => {
    setDrinkDrafts((previous) => ({
      ...previous,
      [drinkId]: {
        name: previous[drinkId]?.name ?? drinks.find((item) => item.id === drinkId)?.name ?? "",
        description:
          previous[drinkId]?.description ??
          drinks.find((item) => item.id === drinkId)?.description ??
          "",
        category:
          previous[drinkId]?.category ??
          drinks.find((item) => item.id === drinkId)?.category ??
          "drinks",
        alcohol_units:
          previous[drinkId]?.alcohol_units ??
          String(drinks.find((item) => item.id === drinkId)?.alcohol_units ?? 0),
        [field]: value as never,
      },
    }));
  };

  const saveDrinkEdits = async (drink: Drink) => {
    if (savingDrinkId) {
      return;
    }

    const draft = getDraftForDrink(drink);
    const normalizedName = draft.name.trim();
    const replacementImageFile = drinkEditImageFiles[drink.id] ?? null;
    const alcoholUnits = Number(draft.alcohol_units);

    if (!normalizedName) {
      setError("Drink navn må ikke være tomt.");
      return;
    }

    if (!Number.isFinite(alcoholUnits) || alcoholUnits < 0) {
      setError("Genstande skal være 0 eller højere.");
      return;
    }

    setSavingDrinkId(drink.id);

    let uploadedImageUrl: string | null | undefined;
    if (replacementImageFile) {
      const fileExt = replacementImageFile.name.includes(".")
        ? replacementImageFile.name.split(".").pop()
        : "jpg";
      const filePath = `${crypto.randomUUID()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from(DRINK_IMAGES_BUCKET)
        .upload(filePath, replacementImageFile, { upsert: false });

      if (uploadError) {
        setError("Kunne ikke uploade nyt billede.");
        setSavingDrinkId(null);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from(DRINK_IMAGES_BUCKET)
        .getPublicUrl(filePath);

      uploadedImageUrl = publicUrlData.publicUrl;
    }

    const nextDescription = draft.description.trim() || null;
    const updatePayload: {
      name: string;
      description: string | null;
      category: MenuCategory;
      alcohol_units: number;
      image_url?: string | null;
    } = {
      name: normalizedName,
      description: nextDescription,
      category: draft.category,
      alcohol_units: alcoholUnits,
    };

    if (typeof uploadedImageUrl === "string") {
      updatePayload.image_url = uploadedImageUrl;
    }

    const { error: updateError } = await supabase
      .from("drinks")
      .update(updatePayload)
      .eq("id", drink.id);

    if (updateError) {
      setError("Kunne ikke gemme ændringer på drink.");
      setSavingDrinkId(null);
      return;
    }

    if (uploadedImageUrl && drink.image_url) {
      const oldStoragePath = extractStoragePathFromPublicUrl(drink.image_url);
      if (oldStoragePath) {
        await supabase.storage.from(DRINK_IMAGES_BUCKET).remove([oldStoragePath]);
      }
    }

    setDrinks((previous) =>
      previous.map((item) =>
        item.id === drink.id
          ? {
              ...item,
              name: normalizedName,
              description: nextDescription,
              category: draft.category,
              alcohol_units: alcoholUnits,
              image_url: typeof uploadedImageUrl === "string" ? uploadedImageUrl : item.image_url,
            }
          : item
      )
    );

    setDrinkDrafts((previous) => {
      const next = { ...previous };
      delete next[drink.id];
      return next;
    });
    setDrinkEditImageFiles((previous) => {
      const next = { ...previous };
      delete next[drink.id];
      return next;
    });
    setEditingDrinks((previous) => {
      const next = { ...previous };
      delete next[drink.id];
      return next;
    });
    setError(null);
    setSavingDrinkId(null);
  };

  const renderOrderCard = (order: GroupedAdminOrder) => (
    <article className="card-float menu-card glass-panel rounded-xl p-4" key={order.groupId}>
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
    <main className="app-shell orders-shell min-h-screen p-8 bg-party-950 text-party-100">
      <div className="app-content max-w-4xl mx-auto">
      <h1 className="fade-up text-4xl font-bold mb-8">🧾 Admin: Bestillinger</h1>

      <a className="fancy-btn inline-flex border border-party-700 rounded-lg px-4 py-2 mb-6" href="/qr">
        Åbn printvenlig QR
      </a>

      <div className="mb-6 card-float menu-card glass-panel rounded-xl p-4 space-y-3">
        <p className="font-semibold text-party-100">Mission-notifikation</p>
        <input
          className="w-full border border-party-700 bg-party-950/80 rounded-lg p-2"
          onChange={(event) => setMissionTitle(event.target.value)}
          placeholder="Titel"
          value={missionTitle}
        />
        <textarea
          className="w-full border border-party-700 bg-party-950/80 rounded-lg p-2 min-h-24"
          onChange={(event) => setMissionBodyTemplate(event.target.value)}
          placeholder="Besked"
          value={missionBodyTemplate}
        />
        <p className="text-xs text-party-300">
          Brug placeholders: {"{name}"} for brugerens navn og {"{mission}"} for den tilfældige mission.
        </p>

        <div className="flex flex-wrap items-center gap-3">
        <button
          className="fancy-btn inline-flex bg-party-600 text-party-950 rounded-lg px-4 py-2 font-semibold disabled:opacity-70"
          disabled={sendingMissions}
          onClick={sendMissionsToAll}
          type="button"
        >
          {sendingMissions ? "Sender missioner..." : "Send mission til alle"}
        </button>
        {missionStatus ? <p className="text-sm text-party-200">{missionStatus}</p> : null}
        </div>
      </div>

      {error ? <p className="mb-4 text-party-300">{error}</p> : null}

      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-4">Nuværende</h2>
        <div className="stagger-list space-y-4">
          {grouped.active.length === 0 ? (
            <p>Ingen aktive bestillinger.</p>
          ) : (
            grouped.active.map(renderOrderCard)
          )}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Tidligere</h2>
        <div className="stagger-list space-y-4">
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
          className="card-float menu-card glass-panel rounded-xl p-4 space-y-3 mb-6"
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

          <select
            className="w-full border border-party-700 bg-party-950/80 rounded-lg p-2"
            onChange={(event) =>
              setDrinkForm((previous) => ({
                ...previous,
                category: event.target.value as MenuCategory,
              }))
            }
            value={drinkForm.category}
          >
            {MENU_CATEGORIES.map((categoryOption) => (
              <option key={categoryOption.value} value={categoryOption.value}>
                {categoryOption.label}
              </option>
            ))}
          </select>

          <input
            className="w-full border border-party-700 bg-party-950/80 rounded-lg p-2"
            min="0"
            onChange={(event) =>
              setDrinkForm((previous) => ({ ...previous, alcohol_units: event.target.value }))
            }
            placeholder="Genstande pr stk"
            step="0.1"
            type="number"
            value={drinkForm.alcohol_units}
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

        <div className="stagger-list space-y-4">
          {drinks.map((drink) => {
            const draft = getDraftForDrink(drink);
            const normalizedDraftName = draft.name.trim();
            const normalizedDraftDescription = draft.description.trim();
            const normalizedDrinkDescription = (drink.description ?? "").trim();
            const normalizedDraftAlcoholUnits = Number(draft.alcohol_units);
            const replacementImageFile = drinkEditImageFiles[drink.id] ?? null;
            const isEditing = editingDrinks[drink.id] ?? false;
            const isDirty =
              normalizedDraftName !== drink.name ||
              normalizedDraftDescription !== normalizedDrinkDescription ||
              draft.category !== drink.category ||
              normalizedDraftAlcoholUnits !== drink.alcohol_units ||
              Boolean(replacementImageFile);

            return (
              <article
                className="card-float menu-card glass-panel rounded-xl p-4 flex flex-col gap-3"
                key={drink.id}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold">{drink.name}</p>
                    <p className="text-xs text-party-200 mt-1">Kategori: {getMenuCategoryLabel(drink.category)}</p>
                    {drink.description ? (
                      <p className="admin-drink-description text-sm text-party-300 mt-1">{drink.description}</p>
                    ) : null}
                    {drink.image_url ? (
                      <p className="text-xs text-party-300 mt-2">Billede: uploadet</p>
                    ) : (
                      <p className="text-xs text-party-300 mt-2">Billede: mangler</p>
                    )}
                    <p className="text-xs text-party-300 mt-1">Genstande: {drink.alcohol_units} / stk</p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      className="fancy-btn border border-party-700 rounded-lg h-9 w-9 inline-flex items-center justify-center"
                      aria-label={isEditing ? "Luk redigering" : "Rediger"}
                      title={isEditing ? "Luk redigering" : "Rediger"}
                      onClick={() => (isEditing ? closeEditDrink(drink.id) : openEditDrink(drink))}
                      type="button"
                    >
                      {isEditing ? (
                        <span className="text-lg leading-none" aria-hidden="true">×</span>
                      ) : (
                        <svg
                          aria-hidden="true"
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M16.862 3.487a2.25 2.25 0 113.182 3.182l-9.53 9.53a4.5 4.5 0 01-1.897 1.117l-3.224.966.966-3.224a4.5 4.5 0 011.117-1.898l9.386-9.673z"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="1.7"
                          />
                        </svg>
                      )}
                    </button>

                    <button
                      className="fancy-btn border border-party-700 rounded-lg h-9 w-9 inline-flex items-center justify-center"
                      aria-label="Fjern"
                      title="Fjern"
                      onClick={() => deleteDrink(drink)}
                      type="button"
                    >
                      <svg
                        aria-hidden="true"
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M9 3.75h6M10.5 3.75h3a1.5 1.5 0 0 1 1.5 1.5v.75h4.5m-15 0H6m12 0-1.05 12.08a2.25 2.25 0 0 1-2.24 2.05H9.29a2.25 2.25 0 0 1-2.24-2.05L6 6m4.5 3.75v6.75m3-6.75v6.75"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="1.7"
                        />
                      </svg>
                    </button>
                  </div>
                </div>

                {isEditing ? (
                  <>
                    <div className="grid gap-3 md:grid-cols-2">
                      <input
                        className="w-full border border-party-700 bg-party-950/80 rounded-lg p-2"
                        onChange={(event) => updateDrinkDraft(drink.id, "name", event.target.value)}
                        placeholder="Navn"
                        value={draft.name}
                      />

                      <select
                        className="w-full border border-party-700 bg-party-950/80 rounded-lg p-2"
                        onChange={(event) =>
                          updateDrinkDraft(drink.id, "category", event.target.value as MenuCategory)
                        }
                        value={draft.category}
                      >
                        {MENU_CATEGORIES.map((categoryOption) => (
                          <option key={categoryOption.value} value={categoryOption.value}>
                            {categoryOption.label}
                          </option>
                        ))}
                      </select>

                      <input
                        className="w-full border border-party-700 bg-party-950/80 rounded-lg p-2"
                        min="0"
                        onChange={(event) =>
                          updateDrinkDraft(drink.id, "alcohol_units", event.target.value)
                        }
                        placeholder="Genstande pr stk"
                        step="0.1"
                        type="number"
                        value={draft.alcohol_units}
                      />
                    </div>

                    <input
                      className="w-full border border-party-700 bg-party-950/80 rounded-lg p-2"
                      onChange={(event) =>
                        updateDrinkDraft(drink.id, "description", event.target.value)
                      }
                      placeholder="Beskrivelse"
                      value={draft.description}
                    />

                    <input
                      className="w-full border border-party-700 bg-party-950/80 rounded-lg p-2"
                      accept="image/*"
                      onChange={(event) =>
                        setDrinkEditImageFiles((previous) => ({
                          ...previous,
                          [drink.id]: event.target.files?.[0] ?? null,
                        }))
                      }
                      type="file"
                    />

                    {replacementImageFile ? (
                      <p className="text-xs text-party-200">Nyt billede valgt: {replacementImageFile.name}</p>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <button
                        className="fancy-btn bg-party-600 text-party-950 rounded-lg px-3 py-1 font-semibold disabled:opacity-70"
                        disabled={
                          !isDirty ||
                          savingDrinkId === drink.id ||
                          !Number.isFinite(normalizedDraftAlcoholUnits) ||
                          normalizedDraftAlcoholUnits < 0
                        }
                        onClick={() => saveDrinkEdits(drink)}
                        type="button"
                      >
                        {savingDrinkId === drink.id ? "Gemmer..." : "Gem ændringer"}
                      </button>

                      <button
                        className="fancy-btn border border-party-700 rounded-lg px-3 py-1 text-sm"
                        onClick={() => closeEditDrink(drink.id)}
                        type="button"
                      >
                        Annuller
                      </button>
                    </div>
                  </>
                ) : null}

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
            );
          })}
        </div>
      </section>
      </div>
    </main>
  );
}
