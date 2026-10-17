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
    if (/error sending .*email|smtp/i.test(m)) return 'Die E-Mail konnte nicht verschickt werden – der Mail-Versand in Supabase (SMTP Settings) ist nicht richtig eingerichtet. Der Account ist noch nicht angelegt.';
    if (/rate limit|too many|security purposes/i.test(m)) return 'Zu viele Versuche – warte kurz und probier es dann noch mal.';
    if (/failed to fetch|network|load failed/i.test(m)) return 'Keine Verbindung zum Server. Bist du online?';
    if (/schema cache|does not exist|could not find the (table|function)|column .* of relation/i.test(m)) {
      return 'Die Datenbank ist noch nicht auf dem neuesten Stand: Bitte supabase/setup.sql in Supabase (SQL Editor) noch einmal ausführen.';
    }
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

    // ---------- profile: ID, name, artist name (table profiles), picture in the bucket ----------
    // -> { code, name, artist, avatar: version or 0 }; creates the profile with a new ID the first time
    getProfile: function () {
      return sb.from('profiles').select('code,name,artist,avatar').eq('id', uid).then(ok).then(function (rows) {
        if (rows[0]) return rows[0];
        // names from before profiles existed were kept in the account itself
        return sb.auth.getUser().then(ok).then(function (data) {
          var m = (data.user && data.user.user_metadata) || {};
          return createProfile({ name: m.name || '', artist: m.artist || '', avatar: m.avatar || 0 }, 0);
        });
      });
    },
    saveProfile: function (fields) {
      return sb.from('profiles').update(fields).eq('id', uid).then(ok);
    },
    uploadAvatar: function (blob) {
      return sb.storage.from('files').upload(uid + '/avatar.jpg', blob, { upsert: true, contentType: 'image/jpeg' }).then(ok);
    },
    // own picture, or a friend's (userId)
    downloadAvatar: function (userId) {
      return sb.storage.from('files').download((userId || uid) + '/avatar.jpg').then(ok);
    },
    removeAvatar: function () {
      return sb.storage.from('files').remove([uid + '/avatar.jpg']).then(ok);
    },

    // ---------- friends ----------
    // -> { code, name, artist, avatar, id } or null
    findByCode: function (code) {
      return sb.rpc('find_profile', { c: code }).then(ok).then(function (rows) { return rows[0] || null; });
    },
    // -> [{ id, code, name, artist, avatar, status: 'friend' | 'incoming' | 'outgoing' }]
    relations: function () {
      return sb.from('friendships').select('requester,addressee,status').then(ok).then(function (rows) {
        var state = {};
        rows.forEach(function (r) {
          var other = r.requester === uid ? r.addressee : r.requester;
          state[other] = r.status === 'accepted' ? 'friend' : r.requester === uid ? 'outgoing' : 'incoming';
        });
        var ids = Object.keys(state);
        if (!ids.length) return [];
        return sb.from('profiles').select('id,code,name,artist,avatar').in('id', ids).then(ok).then(function (people) {
          return people.map(function (x) { x.status = state[x.id]; return x; });
        });
      });
    },
    askFriend: function (otherId) {
      return sb.from('friendships').insert({ requester: uid, addressee: otherId }).then(ok);
    },
    acceptFriend: function (otherId) {
      return sb.from('friendships').update({ status: 'accepted' }).eq('requester', otherId).eq('addressee', uid).then(ok);
    },
    // decline, withdraw or unfriend
    endFriendship: function (otherId) {
      return Promise.all([
        sb.from('friendships').delete().eq('requester', uid).eq('addressee', otherId).then(ok),
        sb.from('friendships').delete().eq('requester', otherId).eq('addressee', uid).then(ok)
      ]);
    },

    // ---------- features: friends on a project ----------
    // rights: what the friend may change, e.g. { text: true, beat: false, license: false, info: false, status: false }
    // an invitation: the friend sees the song only after accepting it
    addMember: function (projectId, member, rights, title) {
      return sb.from('project_members').insert({ owner: uid, project_id: projectId, member: member, rights: rights || {}, title: title || '' }).then(ok);
    },
    // everyone I featured -> { projectId: [{ member, accepted, rights }] }
    myFeatures: function () {
      return sb.from('project_members').select('project_id,member,accepted,rights').eq('owner', uid).then(ok).then(function (rows) {
        var out = {};
        rows.forEach(function (r) { (out[r.project_id] = out[r.project_id] || []).push(r); });
        return out;
      });
    },
    // invitations to friends' songs I have not answered yet -> [{ owner, project_id, title }]
    invitations: function () {
      return sb.from('project_members').select('owner,project_id,title').eq('member', uid).eq('accepted', false).then(ok);
    },
    acceptInvitation: function (owner, projectId) {
      return sb.from('project_members').update({ accepted: true }).eq('owner', owner).eq('project_id', projectId).eq('member', uid).then(ok);
    },
    setRights: function (projectId, member, rights) {
      return sb.from('project_members').update({ rights: rights }).eq('owner', uid).eq('project_id', projectId).eq('member', member).then(ok);
    },
    // projects friends featured me on -> { 'owner/projectId': rights }
    myRights: function () {
      return sb.from('project_members').select('owner,project_id,rights').eq('member', uid).eq('accepted', true).then(ok).then(function (rows) {
        var out = {};
        rows.forEach(function (r) { out[r.owner + '/' + r.project_id] = r.rights || {}; });
        return out;
      });
    },
    removeMember: function (projectId, member) {
      return sb.from('project_members').delete().eq('owner', uid).eq('project_id', projectId).eq('member', member).then(ok);
    },
    leaveProject: function (owner, projectId) {
      return sb.from('project_members').delete().eq('owner', owner).eq('project_id', projectId).eq('member', uid).then(ok);
    },

    // ---------- saved states of the song text ----------
    versions: function (owner, projectId) {
      return sb.from('project_versions').select('id,author_name,title,text,created').eq('owner', owner).eq('project_id', projectId).then(ok)
        .then(function (rows) { return rows.map(function (r) { r.project = projectId; return r; }); });
    },
    addVersion: function (v) {
      return sb.from('project_versions').upsert({ owner: v.owner || uid, project_id: v.project, id: v.id, author_name: v.author_name,
        title: v.title, text: v.text, created: v.created }, { onConflict: 'owner,id', ignoreDuplicates: true }).then(ok);
    },

    // ---------- comments on lines (owner and featured friends) ----------
    comments: function (owner, projectId) {
      return sb.from('project_comments').select('id,author,author_name,section,line,line_no,body,created_at')
        .eq('owner', owner).eq('project_id', projectId).then(ok);
    },
    addComment: function (c) {
      return sb.from('project_comments').insert(c).then(ok);
    },
    deleteComment: function (id) {
      return sb.from('project_comments').delete().eq('id', id).then(ok);
    },

    // ---------- data ----------
    // own projects and the ones friends featured you on; -> [{ id, user_id, data, updated }]
    listProjects: function () {
      return sb.from('projects').select('id,user_id,data,updated').then(ok);
    },
    getProject: function (owner, id) {
      return sb.from('projects').select('id,user_id,data,updated').eq('user_id', owner || uid).eq('id', id).then(ok)
        .then(function (rows) { return rows[0] || null; });
    },
    // a featured friend saves into the owner's row
    saveProject: function (p) {
      return sb.from('projects').upsert({ user_id: p._owner || uid, id: p.id, data: p, updated: p.updated }, { onConflict: 'user_id,id' }).then(ok);
    },
    deleteProject: function (id) {
      return sb.from('files').select('id').eq('project', id).eq('project_owner', uid).then(ok).then(function (rows) {
        return Promise.all(rows.map(function (r) { return api.deleteFile(r.id); }));
      }).then(function () {
        return sb.from('projects').delete().eq('user_id', uid).eq('id', id).then(ok);
      });
    },
    // owner: whose project the file belongs to (a featured friend uploads into their own folder)
    putFile: function (rec, owner) {
      var path = uid + '/' + rec.id;
      return sb.storage.from('files').upload(path, rec.blob, { upsert: true, contentType: rec.type || 'application/octet-stream' }).then(ok)
        .then(function () {
          return sb.from('files').upsert({ user_id: uid, id: rec.id, project: rec.project, name: rec.name, type: rec.type || '', path: path,
            project_owner: owner || uid }, { onConflict: 'user_id,id' }).then(ok);
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
    // only the uploader or the project owner may delete; for anyone else there is nothing to do
    deleteFile: function (id) {
      return sb.from('files').select('user_id,project_owner,path').eq('id', id).then(ok).then(function (rows) {
        var row = rows[0];
        if (!row || (row.user_id !== uid && row.project_owner !== uid)) return;
        return sb.storage.from('files').remove([row.path]).then(ok).then(function () {
          return sb.from('files').delete().eq('user_id', row.user_id).eq('id', id).then(ok);
        });
      });
    }
  };

  // a new profile with a fresh ID like "K7M2QX" (no 0/O, 1/I mix-ups); retry if the ID is taken
  var CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function newCode() {
    var out = '', bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    for (var i = 0; i < 6; i++) out += CODE_CHARS[bytes[i] % CODE_CHARS.length];
    return out;
  }
  function createProfile(fields, tries) {
    var row = { id: uid, code: newCode(), name: fields.name, artist: fields.artist, avatar: fields.avatar };
    return sb.from('profiles').insert(row).then(ok).then(function () { return row; }, function (err) {
      if (tries < 5 && /duplicate|unique|23505/i.test((err && (err.code + ' ' + err.message)) || '')) return createProfile(fields, tries + 1);
      throw err;
    });
  }

  root.RaimCloud = api;
})(this);
