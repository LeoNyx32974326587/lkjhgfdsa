// Barbook Pro: Stripe reports payments and subscription changes here (Supabase Edge Function "stripe-webhook").
// Only messages signed with STRIPE_WEBHOOK_SECRET count; the account's Pro status is written to the table subscriptions.
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (see SUPABASE.md, step 8). "Verify JWT" must be off: Stripe has no Supabase login.
import Stripe from "npm:stripe@22.6.2";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const key = Deno.env.get("STRIPE_SECRET_KEY"), secret = Deno.env.get("STRIPE_WEBHOOK_SECRET"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key || !secret || !service) return json({ error: "not_configured" }, 503);
  const stripe = new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });

  // a real message from Stripe? (signature over the raw body)
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, req.headers.get("Stripe-Signature") ?? "", secret, undefined, Stripe.createSubtleCryptoProvider());
  } catch {
    return json({ error: "bad_signature" }, 400);
  }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, service, { auth: { persistSession: false, autoRefreshToken: false } });

  // the subscription as it is now -> one row in subscriptions
  async function save(sub: Stripe.Subscription, userHint?: string | null) {
    const userId = (sub.metadata && sub.metadata.user_id) || userHint;
    if (!userId) return;
    const item = sub.items?.data?.[0] as (Stripe.SubscriptionItem & { current_period_end?: number }) | undefined;
    const end = (sub as unknown as { current_period_end?: number }).current_period_end ?? item?.current_period_end;
    const interval = item?.price?.recurring?.interval;
    await db.from("subscriptions").upsert({
      user_id: userId,
      status: sub.status,
      plan: interval === "year" ? "year" : interval === "month" ? "month" : "",
      current_period_end: end ? new Date(end * 1000).toISOString() : null,
      cancel_at_period_end: !!sub.cancel_at_period_end,
      stripe_customer: typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
      stripe_subscription: sub.id,
      updated: new Date().toISOString(),
    }, { onConflict: "user_id" });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.mode === "subscription" && s.subscription) {
          const sub = await stripe.subscriptions.retrieve(typeof s.subscription === "string" ? s.subscription : s.subscription.id);
          await save(sub, s.client_reference_id ?? s.metadata?.user_id);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await save(event.data.object as Stripe.Subscription);
        break;
    }
  } catch (err) {
    // Stripe tries again later
    return json({ error: "save_failed", message: (err as Error).message }, 500);
  }
  return json({ received: true });
});
