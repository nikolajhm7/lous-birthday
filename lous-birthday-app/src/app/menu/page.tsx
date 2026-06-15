"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/app/supabase";
import { Drink } from "@/lib/models";

export default function MenuPage() {
  const [drinks, setDrinks] = useState<Drink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const nickname = localStorage.getItem("nickname");
    if (!nickname) {
      window.location.href = "/";
      return;
    }

    const fetchDrinks = async () => {
      const { data, error: drinksError } = await supabase
        .from("drinks")
        .select("id,name,description,image_url,low_stock,price_dkk,is_active")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (drinksError) {
        setError("Kunne ikke hente menuen lige nu.");
        setLoading(false);
        return;
      }

      const drinkRows = (data ?? []) as Drink[];
      setDrinks(drinkRows);
      setLoading(false);
    };

    fetchDrinks();
  }, []);

  const totalItems = useMemo(
    () => Object.values(cart).reduce((sum, quantity) => sum + quantity, 0),
    [cart]
  );

  const cartItems = useMemo(
    () =>
      drinks
        .map((drink) => ({
          id: drink.id,
          name: drink.name,
          quantity: cart[drink.id] ?? 0,
        }))
        .filter((item) => item.quantity > 0),
    [cart, drinks]
  );

  const addOne = (drinkId: string) => {
    setCart((previous) => ({
      ...previous,
      [drinkId]: (previous[drinkId] ?? 0) + 1,
    }));
    setMessage(null);
    setError(null);
  };

  const removeOne = (drinkId: string) => {
    setCart((previous) => {
      const currentQuantity = previous[drinkId] ?? 0;
      if (currentQuantity <= 1) {
        const next = { ...previous };
        delete next[drinkId];
        return next;
      }

      return {
        ...previous,
        [drinkId]: currentQuantity - 1,
      };
    });
  };

  const handleSubmitOrder = async () => {
    if (sending) {
      return;
    }

    const nickname = localStorage.getItem("nickname")?.trim();
    if (!nickname) {
      setError("Dit nickname mangler. Gå tilbage og indtast det igen.");
      return;
    }

    const entries = Object.entries(cart).filter(([, quantity]) => quantity > 0);
    if (entries.length === 0) {
      setError("Tilføj mindst én drink.");
      return;
    }

    setSending(true);
    const orderGroupId = crypto.randomUUID();

    const payload = entries.map(([drinkId, quantity]) => ({
      order_group_id: orderGroupId,
      guest_name: nickname,
      drink_id: drinkId,
      quantity,
      note: null,
      status: "new",
    }));

    const { error: insertError } = await supabase.from("orders").insert(payload);

    if (insertError) {
      setError("Kunne ikke oprette bestilling. Prøv igen.");
      setSending(false);
      return;
    }

    setMessage("Bestilling sendt 🍸");
    setError(null);
    setCart({});
    setSending(false);
    window.location.href = "/orders";
  };

  if (loading) {
    return <main className="min-h-screen p-8 bg-party-950 text-party-100">Henter menukort...</main>;
  }

  return (
    <main className="app-shell min-h-screen p-8 pb-44 bg-party-950 text-party-100">
      <div className="app-content max-w-4xl mx-auto">
      <h1 className="fade-up text-4xl font-bold mb-8">🍹 Menukort</h1>
      <a className="fancy-btn menu-back-btn inline-flex items-center gap-2 mb-6" href="/orders">
        <span aria-hidden="true">←</span>
        <span>Tilbage til dine ordrer</span>
      </a>

      {error ? <p className="mb-4 text-party-300">{error}</p> : null}
      {message ? <p className="mb-4 text-party-400">{message}</p> : null}

      <div className="stagger-list space-y-6 mb-10">
        {drinks.map((drink) => {
          const quantity = cart[drink.id] ?? 0;

          return (
          <article className="card-float menu-card glass-panel w-full p-0 rounded-2xl overflow-hidden text-left" key={drink.id}>
              <div
                className="h-56 w-full bg-party-800"
                style={
                  drink.image_url
                    ? {
                        backgroundImage: `linear-gradient(rgba(89,13,34,0.25), rgba(89,13,34,0.25)), url(${drink.image_url})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }
                    : undefined
                }
              >
                {!drink.image_url ? (
                  <div className="h-full w-full flex items-center justify-center text-party-200 text-sm">
                    Intet billede endnu
                  </div>
                ) : null}
              </div>

              <div className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-xl text-party-100">{drink.name}</p>
                  {drink.low_stock ? (
                    <span className="text-xs bg-party-600 text-party-950 px-2 py-1 rounded-full">
                      Få tilbage
                    </span>
                  ) : null}
                </div>

                {drink.description ? (
                  <p className="text-sm text-party-300 mt-2">{drink.description}</p>
                ) : null}

                <div className="qty-control mt-4">
                  <div className={`qty-inline-shell ${quantity > 0 ? "open" : ""}`}>
                    <button
                      aria-label="Fjern én"
                      className="qty-inline-btn decrease"
                      onClick={() => removeOne(drink.id)}
                      tabIndex={quantity > 0 ? 0 : -1}
                      type="button"
                    >
                      -
                    </button>
                    <span className="qty-inline-count">{quantity} valgt</span>
                    <button
                      aria-label="Tilføj én"
                      className="qty-inline-btn"
                      onClick={() => addOne(drink.id)}
                      type="button"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
          </article>
          );
        })}
      </div>

      {totalItems > 0 ? (
        <div className="floating-bar fixed left-0 right-0 bottom-0 p-4 bg-party-950/95 backdrop-blur-sm border-t border-party-800">
          <div className="max-w-4xl mx-auto cart-bar-wrap">
            <div className="cart-summary-block">
              <p className="font-semibold">{totalItems} drink{totalItems > 1 ? "s" : ""} i kurven</p>
              <ul className="cart-items-list" aria-label="Varer i kurv">
                {cartItems.map((item) => (
                  <li className="cart-item-chip" key={item.id}>
                    <span className="cart-item-qty">{item.quantity}x</span>
                    <span>{item.name}</span>
                  </li>
                ))}
              </ul>
            </div>
            <button
              className="fancy-btn bg-party-600 text-party-950 rounded-lg px-5 py-3 font-semibold disabled:opacity-70 whitespace-nowrap"
              disabled={sending}
              onClick={handleSubmitOrder}
              type="button"
            >
              {sending ? "Sender..." : "Send bestilling"}
            </button>
          </div>
        </div>
      ) : null}
      </div>
    </main>
  );
}