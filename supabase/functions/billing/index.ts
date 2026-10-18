// Barbook Pro: opens Stripe's payment page (Checkout) or the customer portal for the signed-in user
// (Supabase Edge Function "billing"). Card details never touch Barbook.
// Secrets: STRIPE_SECRET_KEY, STRIPE_PRICE_MONTH, STRIPE_PRICE_YEAR (see SUPABASE.md, step 8).
import Stripe from "npm:stripe@22.6.2";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const SITE = "https://leonyx32974326587.github.io/lkjhgfdsa/";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const key = Deno.env.get("STRIPE_SECRET_KEY"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const prices: Record<string, string | undefined> = { month: Deno.env.get("STRIPE_PRICE_MONTH"), year: Deno.env.get("STRIPE_PRICE_YEAR") };
  const configured = !!(key && service && prices.month && prices.year);

  let body: { action?: string; plan?: string };
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  // is Pro on sale yet, and how many free AI requests a month (same secret as the function "claude")
  if (body.action === "status") return json({ configured, free: Number(Deno.env.get("FREE_AI_PER_MONTH") ?? "5") });
  if (!configured) return json({ error: "not_configured" }, 503);

  // who is asking: their own session
  const authorization = req.headers.get("Authorization") ?? "";
  const publicKey = req.headers.get("apikey") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!publicKey || !authorization) return json({ error: "not_signed_in" }, 401);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: who } = await sb.auth.getUser(authorization.replace(/^Bearer\s+/i, ""));
  const user = who?.user;
  if (!user) return json({ error: "not_signed_in" }, 401);

  const stripe = new Stripe(key!, { httpClient: Stripe.createFetchHttpClient() });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, service!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sub } = await db.from("subscriptions").select("stripe_customer").eq("user_id", user.id).maybeSingle();

  try {
    if (body.action === "portal") {
      if (!sub?.stripe_customer) return json({ error: "no_customer" }, 400);
      const portal = await stripe.billingPortal.sessions.create({ customer: sub.stripe_customer, return_url: SITE + "app.html" });
      return json({ url: portal.url });
    }
    // "Verträge hier kündigen": at the end of the paid period / "Vertrag widerrufen" (14 days): right away,
    // the pro-rata refund is done by hand in Stripe (the request lands in cancel_requests)
    if (body.action === "cancel" || body.action === "withdraw") {
      const { data: row } = await db.from("subscriptions").select("stripe_subscription,status,current_period_end").eq("user_id", user.id).maybeSingle();
      if (!row?.stripe_subscription || !["active", "trialing", "past_due"].includes(row.status)) return json({ error: "no_subscription" }, 400);
      let until: string | null = row.current_period_end;
      if (body.action === "cancel") {
        await stripe.subscriptions.update(row.stripe_subscription, { cancel_at_period_end: true });
        await db.from("subscriptions").update({ cancel_at_period_end: true, updated: new Date().toISOString() }).eq("user_id", user.id);
      } else {
        await stripe.subscriptions.cancel(row.stripe_subscription);
        await db.from("subscriptions").update({ status: "canceled", updated: new Date().toISOString() }).eq("user_id", user.id);
        until = new Date().toISOString();
      }
      await db.from("cancel_requests").insert({ kind: body.action === "cancel" ? "kuendigung" : "widerruf", email: user.email ?? "", user_id: user.id, done_automatically: true,
        note: body.action === "withdraw" ? "Widerruf: anteilige Erstattung in Stripe veranlassen" : "Kündigung zum Laufzeitende" });
      return json({ ok: true, until, at: new Date().toISOString() });
    }
    if (body.action !== "checkout" || !prices[body.plan ?? ""]) return json({ error: "bad_request" }, 400);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: prices[body.plan!]!, quantity: 1 }],
      client_reference_id: user.id,
      subscription_data: { metadata: { user_id: user.id } },
      metadata: { user_id: user.id },
      ...(sub?.stripe_customer ? { customer: sub.stripe_customer } : { customer_email: user.email }),
      allow_promotion_codes: true,
      locale: "de",
      success_url: SITE + "app.html#pro=ok",
      cancel_url: SITE + "app.html#pro=cancel",
    });
    return json({ url: session.url });
  } catch (err) {
    return json({ error: "stripe", message: (err as Error).message }, 502);
  }
});
