// Sicherungsdatei: eine ZIP mit data.json und allen Fotos.
//
//   data.json                 alle Datensätze, Fotos ohne Bilddaten
//   photos/<id>.jpg           Foto
//   photos/<id>-thumb.jpg     Vorschaubild

import * as db from './db.js';
import { createZip, readZip } from './zip.js';
import { dayKey } from './time.js';

const APP = 'life-tracker';
const FORMAT = 1;

const photoPath = (id) => `photos/${id}.jpg`;
const thumbPath = (id) => `photos/${id}-thumb.jpg`;

export async function buildBackup() {
  const data = await db.dumpAll();
  const files = [];
  data.photos = data.photos.map(({ blob, thumb, ...rest }) => {
    files.push({ name: photoPath(rest.id), data: blob }, { name: thumbPath(rest.id), data: thumb });
    return rest;
  });
  const json = JSON.stringify({ app: APP, format: FORMAT, schema: db.DB_VERSION, exportedAt: Date.now(), data });
  const zip = await createZip([{ name: 'data.json', data: json }, ...files]);
  return new File([zip], `life-tracker-${dayKey()}.zip`, { type: 'application/zip' });
}

// Am iPhone über das Teilen-Menü (→ „In Dateien sichern“), sonst als Download.
// Gibt false zurück, wenn das Teilen abgebrochen wurde.
export async function exportBackup() {
  const file = await buildBackup();
  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
    } catch (err) {
      if (err.name === 'AbortError') return false;
      throw err;
    }
  } else {
    const url = URL.createObjectURL(file);
    const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  await db.setMeta('lastExportAt', Date.now());
  return { name: file.name, size: file.size };
}

// Liest eine Sicherungsdatei und prüft sie, ohne etwas zu verändern.
export async function readBackup(file) {
  const entries = await readZip(file);
  const manifest = entries.get('data.json');
  if (!manifest) throw new Error('In der Datei fehlt data.json – keine Life-Tracker-Sicherung.');
  const parsed = JSON.parse(await manifest.text());
  if (parsed.app !== APP) throw new Error('Diese Datei stammt nicht aus dem Life-Tracker.');
  if (parsed.format > FORMAT) throw new Error('Die Sicherung ist neuer als diese App-Version.');

  const data = parsed.data;
  for (const name of db.STORE_NAMES) data[name] ||= [];
  for (const photo of data.photos) {
    const full = entries.get(photoPath(photo.id));
    const thumb = entries.get(thumbPath(photo.id));
    if (!full || !thumb) throw new Error(`Foto ${photo.id} fehlt in der Sicherung.`);
    photo.blob = await full.blob('image/jpeg');
    photo.thumb = await thumb.blob('image/jpeg');
  }
  const counts = Object.fromEntries(db.STORE_NAMES.map((n) => [n, data[n].length]));
  return { exportedAt: parsed.exportedAt, counts, data };
}

// Ersetzt alle Daten auf dem Gerät durch die gelesene Sicherung.
export async function applyBackup(backup) {
  await db.replaceAll(backup.data);
}
