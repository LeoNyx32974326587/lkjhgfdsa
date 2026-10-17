// Barbook accounts (Supabase). Fill in both values from your Supabase project:
// Project Settings → API: "Project URL" and the publishable key (sb_publishable_…, formerly "anon"). See SUPABASE.md.
// Empty values: no accounts, projects stay only in this browser.
window.BARBOOK_CONFIG = {
  supabaseUrl: 'https://pfveinhwrptajnqclhtw.supabase.co',
  supabaseAnonKey: 'sb_publishable_2qQeTCKeBZ-TUI7AJShxAw_0AsO15lH',
  // public half of the push key pair (the private half is the Supabase secret VAPID_PRIVATE_KEY)
  vapidPublicKey: 'BE53intYkqWL3nOSAZNTpoym8SkOjAnfk-Irvp_N7qCa26xYTMcD1ZP1xoBHjOpd8XZj9JtS7G5598XgdBIVCpI'
};
