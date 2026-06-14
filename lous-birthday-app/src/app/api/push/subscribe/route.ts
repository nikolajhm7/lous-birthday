import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type SubscribePayload = {
  guestName: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export async function POST(request: Request) {
  const payload = (await request.json()) as SubscribePayload;

  if (!payload.guestName || !payload.endpoint || !payload.p256dh || !payload.auth) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        guest_name: payload.guestName,
        endpoint: payload.endpoint,
        p256dh: payload.p256dh,
        auth: payload.auth,
      },
      { onConflict: "endpoint" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
