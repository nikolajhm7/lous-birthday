import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import webpush from "web-push";

type NotifyPayload = {
  guestName: string;
  title: string;
  body: string;
};

type DbSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export async function POST(request: Request) {
  const payload = (await request.json()) as NotifyPayload;

  if (!payload.guestName || !payload.title || !payload.body) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT ?? "mailto:hello@example.com";

  if (!vapidPublicKey || !vapidPrivateKey) {
    return NextResponse.json({ error: "Missing VAPID keys" }, { status: 500 });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint,p256dh,auth")
    .eq("guest_name", payload.guestName);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const subscriptions = (data ?? []) as DbSubscription[];

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          JSON.stringify({
            title: payload.title,
            body: payload.body,
            url: "/orders",
          })
        );
      } catch (sendError) {
        const statusCode =
          typeof sendError === "object" && sendError && "statusCode" in sendError
            ? (sendError as { statusCode?: number }).statusCode
            : undefined;

        if (statusCode === 404 || statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        }
      }
    })
  );

  return NextResponse.json({ ok: true, sent: subscriptions.length });
}
