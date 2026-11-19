// Freunde-Abgleich über Supabase: Jedes Gerät meldet sich anonym an und lädt eine
// Tageszusammenfassung hoch. Freunde (per Code verbunden) sehen sie gegenseitig.

import * as db from './db.js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config.js';
import { dayProductivity, firstActiveDay, streak } from './model.js';
import { addDays } from './time.js';

export const syncConfigured = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

const UPLOAD_DAYS = 30;

const getState = () => db.getMeta('sync', null);
const setState = (state) => db.setMeta('sync', state);

async function call(path, { method = 'GET', body, token, prefer } = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      // Neue Supabase-Schlüssel (sb_publishable_…) sind kein JWT: nur das Nutzer-Token als Bearer.
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(data?.message || data?.msg || data?.error_description || `Fehler ${res.status}`);
    err.status = res.status;
    err.code = data?.code || data?.error_code;
    throw err;
  }
  return data;
}

// Gültiges Zugangs-Token; meldet bei Bedarf anonym an oder erneuert das Token.
// Gleichzeitige Aufrufe teilen sich einen Lauf. Eine neue anonyme Anmeldung gibt es
// nur, wenn der Server das gespeicherte Token ausdrücklich ablehnt, nicht bei
// Netzwerkfehlern (sonst ginge die Verbindung zu den Freunden verloren).
let tokenRun = null;
function token() {
  if (!tokenRun) tokenRun = refreshToken().finally(() => { tokenRun = null; });
  return tokenRun;
}

async function refreshToken() {
  let s = await getState();
  if (s?.accessToken && s.expiresAt > Date.now() + 60_000) return s.accessToken;
  let session = null;
  if (s?.refreshToken) {
    try {
      session = await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refreshToken } });
    } catch (err) {
      if (![400, 401, 403].includes(err.status)) throw err;
    }
  }
  if (!session) session = await call('/auth/v1/signup', { method: 'POST', body: {} });
  s = {
    ...((await getState()) || {}),
    userId: session.user.id,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: Date.now() + session.expires_in * 1000,
  };
  await setState(s);
  return s.accessToken;
}

const rpc = async (name, args = {}) => call(`/rest/v1/rpc/${name}`, { method: 'POST', body: args, token: await token() });

// Mitmachen: Profil mit Anzeigenamen anlegen, liefert den eigenen Freundes-Code.
export async function join(name) {
  const profile = await rpc('create_profile', { p_name: name });
  const s = await getState();
  await setState({ ...s, joined: true, name: profile.name, code: profile.code });
  return profile;
}

export async function leave() {
  await rpc('delete_me');
  await setState(null);
}

// Prüft, ob es zum angemeldeten Gerät noch ein Profil gibt. Fehlt es (Anmeldung ging
// verloren), wird es mit gleichem Namen neu angelegt; der Code ändert sich dabei.
// Läuft einmal pro App-Start.
let profileCheck = null;
export function ensureProfile() {
  if (!profileCheck) profileCheck = checkProfile().catch((err) => { profileCheck = null; throw err; });
  return profileCheck;
}

async function checkProfile() {
  const s = await getState();
  if (!syncConfigured() || !s?.joined) return null;
  const t = await token();
  const { userId } = await getState();
  const rows = await call(`/rest/v1/profiles?select=id,code,name&id=eq.${userId}`, { token: t });
  if (rows.length) {
    if (rows[0].code !== s.code) await setState({ ...(await getState()), code: rows[0].code });
    return null;
  }
  const profile = await rpc('create_profile', { p_name: s.name || 'Gräber' });
  await setState({ ...(await getState()), code: profile.code, repaired: { oldCode: s.code, at: Date.now() }, lastProfile: null });
  return profile;
}

// Findet einen 6-stelligen Code auch in einer ganzen eingefügten Nachricht.
export function extractCode(text) {
  const up = String(text || '').toUpperCase();
  const found = up.match(/[2-9A-F]{6}/g);
  if (found) return found.at(-1);
  const plain = up.replace(/[^0-9A-Z]/g, '');
  return plain.length === 6 ? plain : null;
}

export async function addFriend(input) {
  const code = extractCode(input);
  if (!code) throw new Error('Kein 6-stelliger Code gefunden.');
  await ensureProfile();
  const s = await getState();
  if (code === s.code) throw new Error('Das ist dein eigener Code.');
  try {
    return await rpc('add_friend', { p_code: code });
  } catch (err) {
    if (err.code === '23503') throw new Error('Dein Profil fehlt auf dem Server. Öffne die App neu und versuch es noch einmal.');
    throw err;
  }
}

export async function dismissRepair() {
  const s = await getState();
  if (s) await setState({ ...s, repaired: null });
}
export const removeFriend = (id) => rpc('remove_friend', { p_friend: id });

export const syncState = getState;

// Tageswerte der letzten Wochen hochladen (nur Tage seit dem ersten Eintrag).
export async function pushStats(store) {
  if (!syncConfigured() || !(await getState())?.joined) return;
  await ensureProfile();
  const s = await getState();
  const start = firstActiveDay(store);
  if (!start) return;
  const st = streak(store, store.today);
  const rows = [];
  for (let i = UPLOAD_DAYS - 1; i >= 0; i--) {
    const key = addDays(store.today, -i);
    if (key < start) continue;
    const p = dayProductivity(store, key);
    if (!p.level) continue;
    rows.push({
      user_id: s.userId, date: key, score: Math.round(p.score * 1000) / 1000, gold: p.gold,
      routines_done: p.routinesDone, routines_total: p.routinesTotal,
      work_hours: Math.round(p.workHours * 100) / 100, water_ml: p.water, water_goal_ml: p.goal,
      streak: key === store.today ? st.count : 0, updated_at: new Date().toISOString(),
    });
  }
  if (!rows.length) return;
  await call('/rest/v1/day_stats?on_conflict=user_id,date', {
    method: 'POST', body: rows, token: await token(), prefer: 'resolution=merge-duplicates,return=minimal',
  });
  await setState({ ...(await getState()), lastPush: Date.now() });
}

// Charakter (Level, Titel, Aussehen, Ausrüstungsstufen) für Freunde aktualisieren.
// Wird nur gesendet, wenn sich etwas geändert hat.
export async function pushProfile(look, profile) {
  if (!syncConfigured() || !(await getState())?.joined) return;
  await ensureProfile();
  const s = await getState();
  const body = {
    level: profile.level,
    title: profile.title,
    look: {
      skin: look.skin, hair: look.hair, shirt: look.shirt,
      gear: Object.fromEntries(Object.entries(profile.gear).map(([slot, g]) => [slot, g.index])),
    },
  };
  const key = JSON.stringify(body);
  if (s.lastProfile === key) return;
  await call(`/rest/v1/profiles?id=eq.${s.userId}`, { method: 'PATCH', body, token: await token(), prefer: 'return=minimal' });
  await setState({ ...(await getState()), lastProfile: key });
}

// Freunde mit ihren Tageswerten ab from.
export async function fetchFriends(from) {
  if (!syncConfigured() || !(await getState())?.joined) return [];
  await ensureProfile();
  const t = await token();
  const s = await getState();
  const links = await call(`/rest/v1/friendships?select=friend_id&user_id=eq.${s.userId}`, { token: t });
  if (!links.length) return [];
  const ids = links.map((l) => l.friend_id).join(',');
  const [profiles, stats] = await Promise.all([
    call(`/rest/v1/profiles?select=id,name,level,title,look&id=in.(${ids})`, { token: t }),
    call(`/rest/v1/day_stats?select=*&user_id=in.(${ids})&date=gte.${from}&order=date.asc`, { token: t }),
  ]);
  return profiles.map((p) => ({ ...p, days: stats.filter((d) => d.user_id === p.id) }));
}
