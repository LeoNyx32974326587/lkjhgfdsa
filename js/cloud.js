// Accounts and cloud storage through Supabase (see SUPABASE.md).
// Projects live in the table "projects", files (beats, licenses) in the private bucket "files"
// with a row in the table "files". Row level security keeps every user to their own rows.
(function (root) {
  'use strict';

  var cfg = root.BARBOOK_CONFIG || {};
  var configured = !!(cfg.supabaseUrl && cfg.supabaseAnonKey);
  var STORAGE_KEY = 'barbook-auth';
  var sb = configured && root.supabase ? root.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { storageKey: STORAGE_KEY, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  }) : null;
  var uid = null;

  function storedSession() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) { return null; }
  }

  // supabase-js answers { data, error }: turn errors into rejections
  function ok(res) {
    if (res.error) throw res.error;
    return res.data;
  }

  // -> the signed-in user or null. Offline (library not loaded) the stored session is used.
  function currentUser() {
    if (!configured) return Promise.resolve(null);
    if (!sb) {
      var s = storedSession();
      return Promise.resolve(s && s.user ? s.user : null);
    }
    return sb.auth.getSession().then(function (res) {
      var s = res.data && res.data.session;
      return s ? s.user : null;
    });
  }

  // German messages for the errors people actually run into
  function message(err) {
    var m = (err && (err.message || err.error_description)) || String(err || '');
    if (/invalid login credentials/i.test(m)) return 'E-Mail oder Passwort stimmt nicht.';
    if (/already registered|already been registered|user_already_exists/i.test(m)) return 'Für diese E-Mail gibt es schon ein Konto. Melde dich an.';
    if (/email not confirmed/i.test(m)) return 'Bitte bestätige zuerst deine E-Mail – der Link liegt in deinem Postfach.';
    if (/password.*(at least|characters|weak)/i.test(m)) return 'Das Passwort ist zu kurz oder zu einfach (mindestens 8 Zeichen).';
    if (/invalid.*email|email.*invalid|unable to validate email/i.test(m)) return 'Bitte gib eine gültige E-Mail-Adresse ein.';
    if (/rate limit|too many|security purposes/i.test(m)) return 'Zu viele Versuche – warte kurz und probier es dann noch mal.';
    if (/failed to fetch|network|load failed/i.test(m)) return 'Keine Verbindung zum Server. Bist du online?';
    return 'Das hat nicht geklappt: ' + m;
  }

  // where links in e-mails lead back to (only works when the site is online, not from a file)
  function backUrl(page) {
    return /^https?:/.test(location.protocol) ? new URL(page, location.href).href : undefined;
  }

  var api = {
    configured: configured,
    online: function () { return !!sb; },
    currentUser: currentUser,
    message: message,
    setUser: function (id) { uid = id; },

    signUp: function (email, password) {
      return sb.auth.signUp({ email: email, password: password, options: { emailRedirectTo: backUrl('app.html') } }).then(ok);
    },
    signIn: function (email, password) {
      return sb.auth.signInWithPassword({ email: email, password: password }).then(ok);
    },
    signOut: function () {
      if (!sb) { try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* private mode */ } return Promise.resolve(); }
      return sb.auth.signOut().then(ok);
    },
    resetPassword: function (email) {
      return sb.auth.resetPasswordForEmail(email, { redirectTo: backUrl('login.html') }).then(ok);
    },
    updatePassword: function (password) {
      return sb.auth.updateUser({ password: password }).then(ok);
    },
    onAuth: function (fn) { if (sb) sb.auth.onAuthStateChange(fn); },

    // ---------- profile: name and artist name in the account, picture in the bucket ----------
    // -> { name, artist, avatar: version or 0 }, fresh from the server
    getProfile: function () {
      return sb.auth.getUser().then(ok).then(function (data) {
        var m = (data.user && data.user.user_metadata) || {};
        return { name: m.name || '', artist: m.artist || '', avatar: m.avatar || 0 };
      });
    },
    saveProfile: function (fields) {
      return sb.auth.updateUser({ data: fields }).then(ok);
    },
    uploadAvatar: function (blob) {
      return sb.storage.from('files').upload(uid + '/avatar.jpg', blob, { upsert: true, contentType: 'image/jpeg' }).then(ok);
    },
    downloadAvatar: function () {
      return sb.storage.from('files').download(uid + '/avatar.jpg').then(ok);
    },
    removeAvatar: function () {
      return sb.storage.from('files').remove([uid + '/avatar.jpg']).then(ok);
    },

    // ---------- data ----------
    listProjects: function () {
      return sb.from('projects').select('id,data,updated').then(ok);
    },
    saveProject: function (p) {
      return sb.from('projects').upsert({ user_id: uid, id: p.id, data: p, updated: p.updated }, { onConflict: 'user_id,id' }).then(ok);
    },
    deleteProject: function (id) {
      return sb.from('files').select('id').eq('project', id).then(ok).then(function (rows) {
        return Promise.all(rows.map(function (r) { return api.deleteFile(r.id); }));
      }).then(function () {
        return sb.from('projects').delete().eq('id', id).then(ok);
      });
    },
    putFile: function (rec) {
      var path = uid + '/' + rec.id;
      return sb.storage.from('files').upload(path, rec.blob, { upsert: true, contentType: rec.type || 'application/octet-stream' }).then(ok)
        .then(function () {
          return sb.from('files').upsert({ user_id: uid, id: rec.id, project: rec.project, name: rec.name, type: rec.type || '', path: path },
            { onConflict: 'user_id,id' }).then(ok);
        });
    },
    // -> { id, project, name, type, blob } or null
    getFile: function (id) {
      return sb.from('files').select('id,project,name,type,path').eq('id', id).then(ok).then(function (rows) {
        var row = rows[0];
        if (!row) return null;
        return sb.storage.from('files').download(row.path).then(ok).then(function (blob) {
          return { id: row.id, project: row.project, name: row.name, type: row.type, blob: blob };
        });
      });
    },
    deleteFile: function (id) {
      return sb.storage.from('files').remove([uid + '/' + id]).then(ok).then(function () {
        return sb.from('files').delete().eq('id', id).then(ok);
      });
    }
  };

  root.RaimCloud = api;
})(this);
