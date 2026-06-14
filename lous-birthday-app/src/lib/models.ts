export type OrderStatus = "new" | "in_progress" | "ready" | "delivered";

export type Drink = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  low_stock: boolean;
  price_dkk: number;
  is_active: boolean;
};

export type OrderWithDrink = {
  id: string;
  guest_name: string;
  quantity: number;
  note: string | null;
  status: OrderStatus;
  created_at: string;
  drinks: {
    id: string;
    name: string;
    price_dkk: number;
  } | null;
};

export const ORDER_STATUSES: { value: OrderStatus; label: string }[] = [
  { value: "new", label: "Afsendt" },
  { value: "in_progress", label: "I gang" },
  { value: "ready", label: "Klar" },
  { value: "delivered", label: "Leveret" },
];

export const getOrderStatusLabel = (status: OrderStatus) =>
  ORDER_STATUSES.find((item) => item.value === status)?.label ?? status;
