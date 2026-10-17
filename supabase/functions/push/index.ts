// Barbook push notifications (Supabase Edge Function "push").
// The database calls it after a new chat message, message, friend request or song invitation (trigger push_event in
// setup.sql) and only says WHICH row: the function reads the row itself with the service role key, so nobody can
// make it send made-up text. Each event is sent once (table push_sent).
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, optional VAPID_SUBJECT (see SUPABASE.md).
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const SITE = "https://leonyx32974326587.github.io/lkjhgfdsa/";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const MESSAGES: Record<string, (who: string, song: string) => string> = {
  unfriended: (w) => `${w} hat dich als Freund entfernt.`,
  gone: (w) => `${w} hat den Barbook-Account gelöscht.`,
  accepted: (w) => `${w} hat deine Freundschaftsanfrage angenommen.`,
  declined_friend: (w) => `${w} hat deine Freundschaftsanfrage abgelehnt.`,
  joined: (w, s) => `${w} ist jetzt bei „${s}“ dabei.`,
  removed: (w, s) => `${w} hat dich aus „${s}“ entfernt.`,
  left: (w, s) => `${w} hat „${s}“ verlassen.`,
  declined_invite: (w, s) => `${w} hat die Einladung zu „${s}“ abgelehnt.`,
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const pub = Deno.env.get("VAPID_PUBLIC_KEY"), priv = Deno.env.get("VAPID_PRIVATE_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!pub || !priv || !service) return json({ error: "not_configured" }, 503);
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || SITE, pub, priv);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, service, { auth: { persistSession: false, autoRefreshToken: false } });

  let body: { table?: string; ref?: Record<string, string> };
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const ref = body.ref ?? {};
  const name = async (id: string) => {
    const { data } = await db.from("profiles").select("artist,name,code").eq("id", id).maybeSingle();
    return data ? (data.artist || data.name || "#" + data.code) : "Jemand";
  };

  // what to send to whom, from the row as it is in the database
  let to = "", title = "Barbook", text = "", url = "app.html", tag = "", key = "";
  const bucket = Math.floor(Date.now() / 600000);   // friend requests / invitations: once per 10 minutes
  if (body.table === "chat_messages") {
    const { data: m } = await db.from("chat_messages").select("id,sender,recipient,body,attachment").eq("id", ref.id).maybeSingle();
    if (!m) return json({ skipped: "no_row" });
    to = m.recipient; title = await name(m.sender); key = "chat:" + m.id; tag = "chat-" + m.sender;
    text = m.attachment ? (m.attachment.type === "bar" ? "hat dir eine Bar geschickt" : `hat dir einen Song geschickt: ${m.attachment.title}`) : m.body;
    url = "app.html#chat=" + m.sender;
  } else if (body.table === "notifications") {
    const { data: n } = await db.from("notifications").select("id,user_id,kind,actor_name,title").eq("id", ref.id).maybeSingle();
    if (!n) return json({ skipped: "no_row" });
    to = n.user_id; key = "note:" + n.id; tag = "note-" + n.id;
    text = (MESSAGES[n.kind] ?? ((w: string) => w))(n.actor_name || "Jemand", n.title || "Ohne Titel");
    url = "app.html#friends";
  } else if (body.table === "friendships") {
    const { data: f } = await db.from("friendships").select("requester,addressee,status").eq("requester", ref.requester).eq("addressee", ref.addressee).maybeSingle();
    if (!f || f.status !== "pending") return json({ skipped: "no_row" });
    to = f.addressee; title = "Neue Freundschaftsanfrage"; text = `${await name(f.requester)} möchte mit dir befreundet sein.`;
    key = `friend:${f.requester}:${f.addressee}:${bucket}`; tag = "friend-" + f.requester; url = "app.html#friends";
  } else if (body.table === "project_members") {
    const { data: i } = await db.from("project_members").select("owner,project_id,member,title,accepted")
      .eq("owner", ref.owner).eq("project_id", ref.project_id).eq("member", ref.member).maybeSingle();
    if (!i || i.accepted) return json({ skipped: "no_row" });
    to = i.member; title = "Einladung zu einem Song"; text = `${await name(i.owner)} lädt dich zu „${i.title || "einem Song"}“ ein.`;
    key = `invite:${i.owner}:${i.project_id}:${i.member}:${bucket}`; tag = "invite-" + i.project_id; url = "app.html#friends";
  } else {
    return json({ error: "bad_request" }, 400);
  }

  // once only
  const { error: dup } = await db.from("push_sent").insert({ key });
  if (dup) return json({ skipped: "already_sent" });

  const { data: subs } = await db.from("push_subscriptions").select("endpoint,p256dh,auth").eq("user_id", to);
  const payload = JSON.stringify({ title, body: text.length > 180 ? text.slice(0, 180) + "…" : text, url: SITE + url, tag });
  let sent = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 });
      sent++;
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      // the device switched notifications off or the browser dropped the subscription
      if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
    }
  }
  return json({ sent });
});
