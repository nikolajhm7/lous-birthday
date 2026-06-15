"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/app/supabase";
import { getOrderStatusLabel, OrderStatus } from "@/lib/models";

type MyOrder = {
  id: string;
  order_group_id: string;
  quantity: number;
  status: OrderStatus;
  created_at: string;
  drinks: {
    name: string;
  } | null;
};

type RawMyOrderRow = {
  id: string;
  order_group_id: string;
  quantity: number;
  status: OrderStatus;
  created_at: string;
  drinks: { name: string } | { name: string }[] | null;
};

type GroupedMyOrder = {
  groupId: string;
  status: OrderStatus;
  created_at: string;
  items: {
    id: string;
    quantity: number;
    name: string;
  }[];
};

export default function OrdersPage() {
  const [groupedOrders, setGroupedOrders] = useState<GroupedMyOrder[]>([]);
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
  const swipeStartXRef = useRef<Record<string, number>>({});
  const activeSwipeRef = useRef<
    { groupId: string; status: OrderStatus; input: "mouse" | "touch" } | null
  >(null);
  const [swipeOffset, setSwipeOffset] = useState<Record<string, number>>({});
  const swipeOffsetRef = useRef<Record<string, number>>({});
  const [isDragging, setIsDragging] = useState<Record<string, boolean>>({});
  const [hasGlobalDrag, setHasGlobalDrag] = useState(false);
  const [isRemoving, setIsRemoving] = useState<Record<string, boolean>>({});
  const removingGroupsRef = useRef<Record<string, boolean>>({});

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let index = 0; index < rawData.length; ++index) {
      outputArray[index] = rawData.charCodeAt(index);
    }

    return outputArray;
  };

  const subscribeForPush = useCallback(async (guestName: string) => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      return;
    }

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    const existingSubscription = await registration.pushManager.getSubscription();
    const subscription =
      existingSubscription ||
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      }));

    const keys = subscription.toJSON().keys;
    if (!keys?.p256dh || !keys.auth) {
      return;
    }

    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        guestName,
        endpoint: subscription.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      }),
    });
  }, []);

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

  const notifyReadyOrder = useCallback(async (order: GroupedMyOrder, orderNumber: number) => {
    playBellSound();

    if (notificationPermission !== "granted") {
      return;
    }

    const title = "🍹 Klar til afhentning";
    const body = `Din Ordre #${orderNumber} er klar til afhentning!`;

    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, {
        body,
        tag: `order-ready-${order.groupId}`,
      });
      return;
    }

    new Notification(title, { body });
  }, [notificationPermission, playBellSound]);

  const syncAndNotifyReadyTransitions = useCallback((nextOrders: GroupedMyOrder[]) => {
    const previousStatuses = previousStatusesRef.current;
    const orderNumbers = new Map(
      [...nextOrders]
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .map((order, index) => [order.groupId, index + 1])
    );

    for (const order of nextOrders) {
      const previousStatus = previousStatuses[order.groupId];

      if (
        previousStatus &&
        previousStatus !== "ready" &&
        order.status === "ready" &&
        (previousStatus === "new" || previousStatus === "in_progress")
      ) {
        void notifyReadyOrder(order, orderNumbers.get(order.groupId) ?? 1);
      }

      previousStatuses[order.groupId] = order.status;
    }

    const nextIds = new Set(nextOrders.map((order) => order.groupId));
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
        .select("id,order_group_id,quantity,status,created_at,drinks(name)")
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

      const groupedMap = new Map<string, GroupedMyOrder>();
      for (const order of normalizedOrders) {
        const key = order.order_group_id || order.id;
        const existing = groupedMap.get(key);

        if (existing) {
          existing.items.push({
            id: order.id,
            quantity: order.quantity,
            name: order.drinks?.name ?? "Ukendt drink",
          });
          continue;
        }

        groupedMap.set(key, {
          groupId: key,
          status: order.status,
          created_at: order.created_at,
          items: [
            {
              id: order.id,
              quantity: order.quantity,
              name: order.drinks?.name ?? "Ukendt drink",
            },
          ],
        });
      }

      const groupedList = Array.from(groupedMap.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      const visibleList = groupedList.filter((order) => !removingGroupsRef.current[order.groupId]);

      syncAndNotifyReadyTransitions(visibleList);
      setGroupedOrders(visibleList);
      setLoading(false);
    };

    const timeoutId = window.setTimeout(() => {
      setNickname(savedNickname);
      if (notificationPermission === "granted") {
        void subscribeForPush(savedNickname);
      }
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
  }, [notificationPermission, subscribeForPush, syncAndNotifyReadyTransitions]);

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

    if (nickname) {
      await subscribeForPush(nickname);
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

  const canCancel = (status: OrderStatus) => status === "new" || status === "in_progress";

  useEffect(() => {
    swipeOffsetRef.current = swipeOffset;
  }, [swipeOffset]);

  useEffect(() => {
    if (!hasGlobalDrag) {
      return;
    }

    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";

    return () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
    };
  }, [hasGlobalDrag]);

  const setRemovingState = useCallback((groupId: string, removing: boolean) => {
    if (removing) {
      removingGroupsRef.current[groupId] = true;
      setIsRemoving((previous) => ({ ...previous, [groupId]: true }));
      return;
    }

    delete removingGroupsRef.current[groupId];
    setIsRemoving((previous) => {
      const next = { ...previous };
      delete next[groupId];
      return next;
    });
  }, []);

  const cancelOrderGroup = useCallback(async (groupId: string) => {
    const targetGroup = groupedOrders.find((order) => order.groupId === groupId);
    if (!targetGroup) {
      return;
    }

    if (isRemoving[groupId]) {
      return;
    }

    setRemovingState(groupId, true);
    setSwipeOffset((previous) => ({ ...previous, [groupId]: -120 }));

    const itemIds = targetGroup.items.map((item) => item.id);

    const { data: deletedRows, error: deleteError } = await supabase
      .from("orders")
      .delete()
      .in("id", itemIds)
      .select("id");

    if (deleteError) {
      setRemovingState(groupId, false);
      setSwipeOffset((previous) => ({ ...previous, [groupId]: 0 }));
      setError("Kunne ikke annullere ordren.");
      return;
    }

    if (!deletedRows || deletedRows.length === 0) {
      setRemovingState(groupId, false);
      setSwipeOffset((previous) => ({ ...previous, [groupId]: 0 }));
      setError("Ordren kunne ikke slettes i databasen.");
      return;
    }

    window.setTimeout(() => {
      setGroupedOrders((previous) => previous.filter((order) => order.groupId !== groupId));
      setSwipeOffset((previous) => {
        const next = { ...previous };
        delete next[groupId];
        return next;
      });
      setIsDragging((previous) => {
        const next = { ...previous };
        delete next[groupId];
        return next;
      });
      setRemovingState(groupId, false);
    }, 260);
  }, [groupedOrders, isRemoving, setRemovingState]);

  const handleSwipeStart = (
    groupId: string,
    status: OrderStatus,
    clientX: number,
    input: "mouse" | "touch"
  ) => {
    if (!canCancel(status)) {
      return;
    }

    if (isRemoving[groupId]) {
      return;
    }

    activeSwipeRef.current = { groupId, status, input };
    swipeStartXRef.current[groupId] = clientX;
    setIsDragging((previous) => ({ ...previous, [groupId]: true }));
    setHasGlobalDrag(true);
  };

  const handleSwipeMove = useCallback((clientX: number) => {
    const active = activeSwipeRef.current;
    if (!active) {
      return;
    }

    const startX = swipeStartXRef.current[active.groupId];
    if (typeof startX !== "number") {
      return;
    }

    const delta = clientX - startX;
    const clamped = Math.max(-180, Math.min(0, delta));
    setSwipeOffset((previous) => ({ ...previous, [active.groupId]: clamped }));
  }, []);

  const handleSwipeEnd = useCallback((groupId: string, status: OrderStatus) => {
    if (!canCancel(status)) {
      return;
    }

    if (isRemoving[groupId]) {
      return;
    }

    activeSwipeRef.current = null;
    setIsDragging((previous) => ({ ...previous, [groupId]: false }));
    setHasGlobalDrag(false);

    const currentOffset = swipeOffsetRef.current[groupId] ?? 0;
    delete swipeStartXRef.current[groupId];

    if (currentOffset <= -90) {
      void cancelOrderGroup(groupId);
      return;
    }

    setSwipeOffset((previous) => ({ ...previous, [groupId]: 0 }));
  }, [cancelOrderGroup, isRemoving]);

  useEffect(() => {
    const handleWindowMouseMove = (event: MouseEvent) => {
      const active = activeSwipeRef.current;
      if (!active || active.input !== "mouse") {
        return;
      }

      event.preventDefault();
      handleSwipeMove(event.clientX);
    };

    const handleWindowMouseUp = (event: MouseEvent) => {
      const active = activeSwipeRef.current;
      if (!active || active.input !== "mouse") {
        return;
      }

      event.preventDefault();
      handleSwipeEnd(active.groupId, active.status);
    };

    const handleWindowTouchMove = (event: TouchEvent) => {
      const active = activeSwipeRef.current;
      if (!active || active.input !== "touch") {
        return;
      }

      const touch = event.touches[0];
      if (!touch) {
        return;
      }

      event.preventDefault();
      handleSwipeMove(touch.clientX);
    };

    const handleWindowTouchEnd = (event: TouchEvent) => {
      const active = activeSwipeRef.current;
      if (!active || active.input !== "touch") {
        return;
      }

      event.preventDefault();
      handleSwipeEnd(active.groupId, active.status);
    };

    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);
    window.addEventListener("touchmove", handleWindowTouchMove, { passive: false });
    window.addEventListener("touchend", handleWindowTouchEnd, { passive: false });
    window.addEventListener("touchcancel", handleWindowTouchEnd, { passive: false });

    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
      window.removeEventListener("touchmove", handleWindowTouchMove);
      window.removeEventListener("touchend", handleWindowTouchEnd);
      window.removeEventListener("touchcancel", handleWindowTouchEnd);
    };
  }, [handleSwipeEnd, handleSwipeMove]);

  if (loading) {
    return <main className="min-h-screen p-8 bg-party-950 text-party-100">Henter ordrer...</main>;
  }

  return (
    <main className="app-shell min-h-screen p-8 pb-32 bg-party-950 text-party-100">
      <div className="app-content max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-2">
        <h1 className="fade-up text-4xl font-bold">📋 Dine ordrer</h1>
        <span
          className={`text-xs rounded-full px-3 py-1 border ${
            isLive
              ? "pulse-live border-emerald-300 text-emerald-100 bg-emerald-300/15"
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
        <div className="notification-active mb-6" role="status" aria-live="polite">
          <span className="notification-dot" aria-hidden="true" />
          <span className="text-sm font-medium">Notifikationer er aktive</span>
          <span aria-hidden="true">🔔</span>
        </div>
      )}

      {groupedOrders.length === 0 ? (
        <p className="text-party-300">Ingen ordrer</p>
      ) : (
        <div className="stagger-list">
          {groupedOrders.map((order) => {
            const offset = swipeOffset[order.groupId] ?? 0;
            const progress = Math.min(1, Math.max(0, Math.abs(offset) / 140));
            const removing = isRemoving[order.groupId] ?? false;

            return (
            <div
              className={`grid overflow-hidden rounded-xl transition-all duration-300 ease-out ${
                removing
                  ? "grid-rows-[0fr] opacity-0 mb-0 -translate-y-1"
                  : "grid-rows-[1fr] opacity-100 mb-4 translate-y-0"
              }`}
              key={order.groupId}
            >
              <div className="min-h-0">
              <div className="relative overflow-hidden rounded-xl">
              <div
                className="absolute inset-y-0 right-0 bg-party-700 text-party-100 px-4 flex items-center justify-center text-2xl"
                style={{
                  opacity: removing ? 1 : progress,
                  transform: `scale(${removing ? 1 : 0.84 + progress * 0.16})`,
                  transition: "opacity 200ms ease, transform 200ms ease",
                }}
                aria-hidden="true"
              >
                🗑️
              </div>
              <article
                className="swipe-card card-float glass-panel rounded-xl p-4 flex items-center justify-between gap-4 touch-pan-y select-none"
                onMouseDown={(event) => {
                  if (event.button !== 0) {
                    return;
                  }

                  if (!canCancel(order.status) || isRemoving[order.groupId]) {
                    return;
                  }

                  event.preventDefault();
                  handleSwipeStart(
                    order.groupId,
                    order.status,
                    event.clientX,
                    "mouse"
                  );
                }}
                onTouchStart={(event) => {
                  const touch = event.touches[0];
                  if (!touch) {
                    return;
                  }

                  if (!canCancel(order.status) || isRemoving[order.groupId]) {
                    return;
                  }

                  event.preventDefault();
                  handleSwipeStart(
                    order.groupId,
                    order.status,
                    touch.clientX,
                    "touch"
                  );
                }}
                onMouseUp={(event) => {
                  const active = activeSwipeRef.current;
                  if (active && active.groupId === order.groupId && active.input === "mouse") {
                    event.preventDefault();
                    handleSwipeEnd(order.groupId, order.status);
                  }
                }}
                onTouchEnd={(event) => {
                  const active = activeSwipeRef.current;
                  if (active && active.groupId === order.groupId && active.input === "touch") {
                    event.preventDefault();
                    handleSwipeEnd(order.groupId, order.status);
                  }
                }}
                onDragStart={(event) => event.preventDefault()}
                style={{
                  transform: `translateX(${offset}px)`,
                  transition: isDragging[order.groupId] ? "none" : "transform 150ms ease",
                  willChange: "transform",
                  userSelect: "none",
                  WebkitUserSelect: "none",
                  WebkitTouchCallout: "none",
                  touchAction: "pan-y",
                  cursor: isDragging[order.groupId] ? "grabbing" : "grab",
                }}
              >
                <div>
                  {order.items.map((item) => (
                    <p className="text-sm text-party-300" key={item.id}>
                      {item.quantity}x {item.name}
                    </p>
                  ))}
                  {canCancel(order.status) ? (
                    <p className="text-xs text-party-300 mt-2">Swipe til venstre for at annullere</p>
                  ) : null}
                </div>

                <span
                  className={`text-sm border rounded-full px-3 py-1 ${statusClass(order.status)}`}
                >
                  {getOrderStatusLabel(order.status)}
                </span>
              </article>
            </div>
            </div>
            </div>
            );
          })}
        </div>
      )}

      <div className="floating-bar fixed left-0 right-0 bottom-0 p-4 bg-party-950/95 backdrop-blur-sm border-t border-party-800">
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
