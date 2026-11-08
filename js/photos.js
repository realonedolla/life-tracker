// Fotos werden beim Speichern verkleinert: ein Bild zum Ansehen und ein Vorschaubild.

import * as db from './db.js';
import { dayKey } from './time.js';

const FULL = { size: 1280, quality: 0.8 };
const THUMB = { size: 256, quality: 0.75 };

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bild konnte nicht gelesen werden')); };
    img.src = url;
  });
}

// Skaliert auf die längste Seite size (nie vergrößern) und kodiert als JPEG.
function encode(img, { size, quality }) {
  const scale = Math.min(1, size / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve({ blob: b, w, h }) : reject(new Error('Bild konnte nicht kodiert werden'))), 'image/jpeg', quality));
}

// Speichert ein Foto. Bei einem Tagesslot ersetzt es das bisherige Foto im Slot.
export async function savePhoto(file, { date = dayKey(), slot = null, goalId = null } = {}) {
  const img = await loadImage(file);
  const [full, thumb] = await Promise.all([encode(img, FULL), encode(img, THUMB)]);
  const photo = {
    id: db.uid(), date, slot, goalId,
    blob: full.blob, thumb: thumb.blob, w: full.w, h: full.h,
    takenAt: file.lastModified || Date.now(), createdAt: Date.now(),
  };
  const sameSlot = slot ? (await db.getAllBy('photos', 'date', date)).filter((p) => p.slot === slot) : [];
  await db.tx('photos', 'readwrite', (s) => {
    for (const old of sameSlot) s.photos.delete(old.id);
    s.photos.put(photo);
  });
  return photo;
}

export const deletePhoto = (id) => db.del('photos', id);
