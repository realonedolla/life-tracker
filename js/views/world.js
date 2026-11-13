// Startscreen: oben der heutige Tag am Himmel, darunter Wiese und Untergrund mit den Tunneln.

import { html, useEffect, useMemo, useRef, useState } from '../vendor/preact-htm.js';
import { P, PixelCanvas } from '../pixel.js';
import {
  JUG, LAYER_GEO, REF_W, SHAFT, drawBedrock, drawJug, drawLayer, drawMeadow, drawSky,
  layerHeight, meadowLayout, meadowSkyH, rowTop,
} from '../scene.js';
import { skyState, sunTimes } from '../sun.js';
import {
  PHOTO_SLOTS, activeSession, addWater, routineOnDay, sessionGoalId, setEntryDone, setWaterGoal, streak,
  tunnelProgress, undoWater, waterGoal, waterTotal,
} from '../model.js';
import { deletePhoto, savePhoto } from '../photos.js';
import { appMinutes, formatDate, hhmm, slotMinutes as toMin } from '../time.js';
import { BlobImage, Icon, Sheet, formatNumber } from '../ui.js';
import { SessionCard, StartSheet, StopSheet, startFromEntry } from './session.js';
import { NewGoalSheet, openGoal } from './goal.js';
import { decayLabel, gardenState, greySky } from '../garden.js';
import { ReminderBar } from './reminders.js';
import { computeProfile } from '../profile.js';
import { smallPalette } from '../character.js';

// Scrollposition der Welt, damit „Zurück“ aus der Detailansicht an derselben Stelle landet.
let savedScroll = null;

const liters = (ml) => (ml / 1000).toLocaleString('de-DE', { maximumFractionDigits: 2 });
const LONG_PRESS = 450;

function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

// Breite eines Elements in Kunst-Pixeln, für Knöpfe über dem Canvas.
function useArtWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const ro = new ResizeObserver(() => setW(Math.ceil(ref.current.clientWidth / P)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// Wo der Gräber steht: im Tunnel der letzten Session, sonst auf der Wiese.
// Läuft eine Session (nicht pausiert), gräbt er.
function diggerSpot(store) {
  const last = store.sessions.reduce((a, s) => (!a || s.startAt > a.startAt ? s : a), null);
  if (!last) return null;
  const goalId = sessionGoalId(last, store.areas);
  const digging = !last.endAt && !last.pauses.some((p) => p.to == null);
  return goalId ? { goalId, digging } : null;
}

function lanternList(store) {
  return store.routines
    .filter((r) => r.active)
    .sort((a, b) => a.order - b.order)
    .map((routine) => {
      const entry = store.entries.find((e) => e.date === store.today && e.routineId === routine.id);
      const due = Boolean(entry) || Boolean(routineOnDay(routine, store.today));
      return { routine, entry, due, lit: Boolean(entry?.doneAt), bonus: Boolean(entry?.bonusDoneAt) };
    });
}

export function World({ store, reload, notify }) {
  const now = useNow();
  const { location } = store.settings;
  const times = useMemo(() => sunTimes(now, location.lat, location.lon), [store.today, location.lat, location.lon]);
  const garden = useMemo(() => gardenState(store), [store]);
  const gear = useMemo(() => computeProfile(store).gear, [store]);
  const diggerPal = smallPalette(store.look, gear);
  const sky = greySky(skyState(now, times), garden.grey);
  const body = sky.sun || sky.moon;
  const skyH = meadowSkyH(garden);
  const skyKey = `${sky.top}|${sky.bottom}|${sky.stars.toFixed(2)}|${sky.sun ? 's' : 'm'}${Math.round(body.f * 300)}|${skyH}`;
  const st = streak(store, store.today);
  const digger = diggerSpot(store);
  const [sheet, setSheet] = useState(null);

  const areas = [...store.areas].sort((a, b) => a.order - b.order);
  const ctx = { store, reload, notify };
  const onGoal = (goal, element) => {
    savedScroll = scrollY;
    openGoal(goal.id, element);
  };
  useEffect(() => {
    if (savedScroll == null) return;
    const y = savedScroll;
    savedScroll = null;
    requestAnimationFrame(() => scrollTo(0, y));
  }, []);
  const close = () => setSheet(null);

  return html`
    <div class="world">
      <section class="sky">
        <${PixelCanvas} draw=${(ctx, w, h) => drawSky(ctx, w, h, sky, h + skyH)} deps=${[skyKey]} />
        <header class="world-top">
          <span class="label outlined">${formatDate(store.today)}</span>
          <div class="right">
            <span class="streak ${st.todayKept ? 'on' : ''}"
              aria-label="${st.count} Tage am Stück${st.todayKept ? ', heute geschafft' : ''}">
              <${Icon} name="flamme" scale=${3} />
              <span class="label outlined num">${st.count}</span>
            </span>
            <a class="btn secondary icon" href="#/daten" aria-label="Daten und Einstellungen"><${Icon} name="daten" /></a>
          </div>
        </header>
        <${ReminderBar} store=${store} onChange=${reload} />
        <${NowCard} store=${store} now=${now} reload=${reload} notify=${notify}
          onStartFree=${() => setSheet({ type: 'start' })}
          onStop=${(session) => setSheet({ type: 'stop', session })} />
        <${Shelf} store=${store} reload=${reload} notify=${notify} onPhoto=${(photo) => setSheet({ type: 'photo', photo })} />
      </section>

      <${Meadow} store=${store} sky=${sky} skyKey=${skyKey} diggerOnSurface=${!digger} garden=${garden}
        diggerPal=${diggerPal} gear=${gear}
        onLantern=${(item) => setSheet({ type: 'lantern', item })}
        onStructure=${(st) => setSheet({ type: 'structure', st })}
        onGarden=${() => setSheet({ type: 'garden' })} />

      ${areas.length === 0 && html`
        <section class="empty-world">
          <p>Noch keine Bereiche. Unter dem Zahnrad oben rechts legst du deine Bereiche und Routinen an; danach erscheinen hier die Schichten für deine Ziele.</p>
          <a class="btn" href="#/daten">Einrichten</a>
        </section>`}
      ${areas.map((area, i) => html`
        <${Layer} key=${area.id} area=${area} index=${i} prevLayer=${i ? areas[i - 1].layer : 'dirt'}
          store=${store} digger=${digger} onGoal=${onGoal} diggerPal=${diggerPal} gear=${gear}
          onNewGoal=${() => setSheet({ type: 'newGoal', areaId: area.id })} />`)}

      <section class="bedrock">
        <${PixelCanvas} draw=${(ctx, w, h) => drawBedrock(ctx, w, h, { prevLayer: areas.at(-1)?.layer })} deps=${[areas.at(-1)?.layer]} />
      </section>

      ${sheet?.type === 'lantern' && html`<${LanternSheet} item=${sheet.item} reload=${reload} onClose=${() => setSheet(null)} />`}
      ${sheet?.type === 'photo' && html`<${PhotoSheet} photo=${sheet.photo} reload=${reload} notify=${notify} onClose=${close} />`}
      ${sheet?.type === 'start' && html`<${StartSheet} ...${ctx} onClose=${close} />`}
      ${sheet?.type === 'structure' && html`<${StructureSheet} st=${sheet.st} onClose=${close} />`}
      ${sheet?.type === 'garden' && html`<${GardenSheet} garden=${garden} onClose=${close} />`}
      ${sheet?.type === 'newGoal' && html`<${NewGoalSheet} ...${ctx} areaId=${sheet.areaId} onClose=${close} />`}
      ${sheet?.type === 'stop' && html`<${StopSheet} ...${ctx} session=${sheet.session} onClose=${close} />`}
    </div>`;
}

// ---------- Jetzt-Karte ----------

function NowCard({ store, now, reload, notify, onStartFree, onStop }) {
  const mins = appMinutes(now);
  const session = activeSession(store.sessions);
  const blocks = store.entries
    .filter((e) => e.date === store.today && e.slot?.start && !e.doneAt && !e.movedTo)
    .map((e) => ({ e, start: toMin(e.slot.start), end: e.slot.end ? toMin(e.slot.end) : toMin(e.slot.start) + 60 }))
    .map((b) => (b.end <= b.start ? { ...b, end: b.end + 1440 } : b));
  const current = blocks.find((b) => b.start <= mins && mins < b.end);
  const next = blocks.filter((b) => b.start > mins).sort((a, b) => a.start - b.start)[0];
  const block = current || next;
  const area = block && store.areas.find((a) => a.id === block.e.areaId);
  const swipe = useRef(null);

  const start = (event) => {
    event.stopPropagation();
    if (block && area) startFromEntry(store, block.e, { reload, notify });
    else onStartFree();
  };

  // Wisch nach oben öffnet den Tagesplan.
  const onDown = (e) => { swipe.current = e.clientY; };
  const onUp = (e) => {
    if (swipe.current != null && swipe.current - e.clientY > 40) location.hash = '#/heute';
    swipe.current = null;
  };
  const stopBubble = (e) => e.stopPropagation();

  return html`
    <div class="now-card" onPointerDown=${onDown} onPointerUp=${onUp} onPointerCancel=${() => { swipe.current = null; }}>
      <span class="grabber" aria-hidden="true"></span>
      ${session
        ? html`<div onPointerDown=${stopBubble}><${SessionCard} store=${store} session=${session} reload=${reload} onStop=${() => onStop(session)} compact /></div>`
        : html`
          <div class="now-body">
            <div>
              <div class="label now-kicker">${current ? 'Jetzt' : next ? 'Als Nächstes' : 'Frei'}</div>
              ${block
                ? html`
                  <div class="now-title">${area && area.name !== block.e.title ? `${area.name}: ` : ''}${block.e.title}</div>
                  <div class="muted small num">${block.e.slot.end ? `${block.e.slot.start}–${block.e.slot.end} Uhr` : `ab ${block.e.slot.start} Uhr`}</div>`
                : html`<div class="now-title">Kein Block geplant</div>`}
            </div>
            <button class="btn" onPointerDown=${stopBubble} onClick=${start}>
              ${block && area ? 'Start' : 'Session starten'}
            </button>
          </div>`}
      <a class="now-plan small" href="#/heute">Tagesplan ▴</a>
    </div>`;
}

// ---------- Regal: Krug und Foto-Slots ----------

function Shelf({ store, reload, notify, onPhoto }) {
  const day = store.days.find((d) => d.date === store.today);
  const total = waterTotal(day);
  const goal = waterGoal(day, store.settings);
  const [overflow, setOverflow] = useState(false);

  useEffect(() => {
    if (!overflow) return undefined;
    const t = setTimeout(() => setOverflow(false), 1600);
    return () => clearTimeout(t);
  }, [overflow]);

  async function add(ml) {
    await addWater(store.today, ml);
    if (total < goal && total + ml >= goal) {
      setOverflow(true);
      notify('Krug voll – der Garten wird gewässert.');
    }
    reload();
  }

  async function undo() {
    const removed = await undoWater(store.today);
    if (removed) notify(`${liters(removed.ml)} l zurückgenommen.`);
    reload();
  }

  async function changeGoal() {
    const answer = prompt('Wasserziel für heute in Litern', liters(goal));
    if (answer == null) return;
    const l = parseFloat(answer.replace(',', '.'));
    if (!(l > 0 && l < 20)) return;
    await setWaterGoal(store.today, Math.round(l * 1000));
    reload();
  }

  async function save(slot, file) {
    try {
      await savePhoto(file, { date: store.today, slot });
      reload();
    } catch (err) {
      notify(err.message, 'error');
    }
  }

  const photos = store.photos.filter((p) => p.date === store.today && p.slot);

  return html`
    <div class="shelf">
      <div class="shelf-row">
        <div class="jug-col">
          <${Jug} total=${total} goal=${goal} onAdd=${add} onUndo=${undo} overflow=${overflow} />
        </div>
        <div class="slots">
          ${PHOTO_SLOTS.map((slot) => html`
            <${PhotoSlot} key=${slot.key} slot=${slot} photo=${photos.find((p) => p.slot === slot.key)}
              onSave=${save} onOpen=${onPhoto} />`)}
        </div>
      </div>
      <div class="water-row">
        <button class="water-amount num" onClick=${changeGoal} aria-label="Wasserziel ändern">
          ${liters(total)} <span class="muted">/ ${liters(goal)} l</span>
        </button>
        ${store.settings.waterQuick.map((ml) => html`
          <button key=${ml} class="btn secondary small-btn" onClick=${() => add(ml)}>+${liters(ml)} l</button>`)}
      </div>
    </div>`;
}

// Krug: nach oben ziehen füllt, nach unten wischen nimmt den letzten Eintrag zurück.
function Jug({ total, goal, onAdd, onUndo, overflow }) {
  const canvas = useRef(null);
  const drag = useRef(null);
  const [preview, setPreview] = useState(0);

  useEffect(() => {
    drawJug(canvas.current.getContext('2d'), (total + preview) / goal, goal / 1000);
  }, [total, preview, goal]);

  const amount = (dy) => (dy > 0 ? Math.round(((dy / (JUG.h * P)) * goal) / 50) * 50 : 0);
  const onDown = (e) => {
    drag.current = { y: e.clientY };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  };
  const onMove = (e) => {
    if (drag.current) setPreview(amount(drag.current.y - e.clientY));
  };
  const onUp = (e) => {
    const d = drag.current;
    drag.current = null;
    setPreview(0);
    if (!d) return;
    const dy = d.y - e.clientY;
    if (dy < -30) onUndo();
    else if (amount(dy) > 0) onAdd(amount(dy));
  };

  return html`
    <div class="jug" onPointerDown=${onDown} onPointerMove=${onMove} onPointerUp=${onUp}
      onPointerCancel=${() => { drag.current = null; setPreview(0); }}
      role="img" aria-label="Wasser ${liters(total)} von ${liters(goal)} Litern">
      <canvas ref=${canvas} width=${JUG.w} height=${JUG.h} style="width:${JUG.w * P}px;height:${JUG.h * P}px"></canvas>
      ${preview > 0 && html`<span class="jug-preview label">+${liters(preview)}</span>`}
      ${overflow && html`<span class="drops" aria-hidden="true"><i></i><i></i><i></i><i></i></span>`}
    </div>`;
}

// Tipp: Kamera (bei Foto: ansehen). Langes Drücken: Galerie.
function PhotoSlot({ slot, photo, onSave, onOpen }) {
  const cam = useRef(null);
  const gallery = useRef(null);
  const press = useRef(null);
  const skipClick = useRef(false);
  const [long, setLong] = useState(false);

  const cancel = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
    setLong(false);
  };
  const onDown = () => {
    skipClick.current = false;
    press.current = { at: Date.now(), timer: setTimeout(() => setLong(true), LONG_PRESS) };
  };
  const onUp = () => {
    const p = press.current;
    cancel();
    if (p && Date.now() - p.at >= LONG_PRESS) {
      skipClick.current = true;
      gallery.current.click();
    }
  };
  const onClick = () => {
    if (skipClick.current) { skipClick.current = false; return; }
    if (photo) onOpen(photo);
    else cam.current.click();
  };
  const onFile = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) onSave(slot.key, file);
  };

  return html`
    <div class="slot-wrap">
      <button class="slot ${long ? 'long' : ''} ${photo ? 'filled' : ''}"
        onPointerDown=${onDown} onPointerUp=${onUp} onPointerLeave=${cancel} onPointerCancel=${cancel}
        onClick=${onClick} onContextMenu=${(e) => e.preventDefault()}
        aria-label="${slot.label}: ${photo ? 'Foto ansehen' : 'Foto aufnehmen, lang drücken für Galerie'}">
        ${photo
          ? html`<${BlobImage} blob=${photo.thumb} alt="" /><span class="check" aria-hidden="true"></span>`
          : html`<span class="label slot-plus" aria-hidden="true">${long ? '▤' : '+'}</span>`}
      </button>
      <input ref=${cam} class="visually-hidden" type="file" accept="image/*" tabindex="-1"
        capture=${slot.key === 'selfie' ? 'user' : 'environment'} onChange=${onFile} />
      <input ref=${gallery} class="visually-hidden" type="file" accept="image/*" tabindex="-1" onChange=${onFile} />
      <div class="slot-caption">${slot.short || slot.label}</div>
    </div>`;
}

// ---------- Wiese ----------

function Meadow({ store, sky, skyKey, diggerOnSurface, garden, diggerPal, gear, onLantern, onStructure, onGarden }) {
  const [ref, measured] = useArtWidth();
  const w = measured || REF_W;
  const lanterns = lanternList(store);
  const layout = meadowLayout(w, lanterns.length, garden);
  const gardenKey = `${garden.plants.length}:${garden.wilted}:${garden.weeds}:${garden.fountainDry}:${garden.watered}:${garden.structures.map((s) => s.id).join()}`;
  const deps = [skyKey, w, diggerOnSurface, gardenKey, JSON.stringify(diggerPal), gear.pet.index, lanterns.map((l) => `${l.lit}${l.bonus}${l.due}`).join()];
  const g = layout.skyH;

  return html`
    <section class="meadow" ref=${ref} style="height:${layout.h * P}px">
      <${PixelCanvas} deps=${deps}
        draw=${(ctx, cw, ch) => drawMeadow(ctx, cw, ch, { sky, lanterns, digger: diggerOnSurface, garden, diggerPal, gear })} />
      ${layout.structures.map((s) => html`
        <button key=${s.st.id} class="hit structure-hit"
          style="left:${(s.x - 1) * P}px;top:${(s.y - 1) * P}px;width:${(s.w + 2) * P}px;height:${Math.min(s.h + 2, s.baseY - s.y) * P}px"
          onClick=${() => onStructure(s.st)} aria-label=${s.st.name}></button>`)}
      <button class="hit garden-hit" style="left:${(SHAFT.x + SHAFT.w + 2) * P}px;right:0;top:${(g + 2) * P}px;height:${(layout.h - g - 10) * P}px"
        onClick=${onGarden} aria-label="Garten: ${garden.plants.length} Pflanzen. ${decayLabel(garden.decay)}"></button>
      ${lanterns.map((l, i) => html`
        <button key=${l.routine.id} class="hit lantern-hit"
          style="left:${(layout.lanterns[i] - 3) * P}px;top:${layout.lanternY * P}px;width:${13 * P}px;height:${15 * P}px"
          onClick=${() => onLantern(l)}
          aria-label="${l.routine.title}: ${!l.due ? 'heute nicht fällig' : l.lit ? 'erledigt' : 'offen'}"></button>`)}
    </section>`;
}

const dateOf = (ms) => new Date(ms).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
const hoursText = (h) => `${h.toLocaleString('de-DE', { maximumFractionDigits: 1 })} h`;

function StructureSheet({ st, onClose }) {
  return html`
    <${Sheet} title=${st.kind === 'monument' ? 'Monument' : st.name} onClose=${onClose}>
      ${st.kind === 'monument'
        ? html`<p><b>${st.goal.title}</b>${st.area ? ` · ${st.area.name}` : ''}</p>
          <p class="muted">Ziel geschafft am ${dateOf(st.builtAt)}.</p>
          <a class="btn secondary" href="#/ziel/${st.goal.id}" onClick=${onClose}>Zum Ziel</a>`
        : html`<p>Steht für ${st.hours} Stunden Arbeit in Sessions.</p>
          <p class="muted">Entstanden am ${dateOf(st.builtAt)}.</p>`}
    <//>`;
}

function GardenSheet({ garden, onClose }) {
  const next = garden.nextStructure;
  return html`
    <${Sheet} title="Garten" onClose=${onClose}>
      <p class=${garden.decay ? 'warn' : 'ok-text'}>${decayLabel(garden.decay)}</p>
      <dl class="kv">
        <dt>Pflanzen</dt><dd>${garden.plants.length}${garden.wilted ? ` (${garden.wilted} welk)` : ''}</dd>
        ${garden.weeds > 0 && html`<dt>Unkraut</dt><dd>${garden.weeds}</dd>`}
        <dt>Bauwerke</dt><dd>${garden.structures.length}</dd>
        <dt>Session-Stunden gesamt</dt><dd>${hoursText(garden.totalHours)}</dd>
        ${next && html`<dt>Nächstes Bauwerk</dt><dd>${next.name} bei ${next.hours} h</dd>`}
      </dl>
      ${next && html`<div class="bar garden-bar"><span style="width:${Math.min(100, (garden.totalHours / next.hours) * 100)}%"></span></div>
        <p class="muted small">Noch ${hoursText(Math.max(0, next.hours - garden.totalHours))} bis zum ${garden.structures.some((s) => s.kind === 'hours') ? 'nächsten' : 'ersten'} Bauwerk.</p>`}
      <p class="muted small">Jeder Tag mit erfülltem Plan pflanzt etwas. Ein unerfüllter Tag lässt welken, ein erfüllter Tag heilt sofort einen Teil. Bauwerke und Monumente bleiben immer.</p>
    <//>`;
}

function LanternSheet({ item, reload, onClose }) {
  const { routine, entry, due } = item;
  const toggle = async (bonus) => {
    await setEntryDone(entry.id, bonus ? !entry.bonusDoneAt : !entry.doneAt, { bonus });
    await reload();
    onClose();
  };
  return html`
    <${Sheet} title=${routine.title} onClose=${onClose}>
      <p>Mindestens: ${routine.minVersion}</p>
      ${routine.fixed && entry?.slot && html`<p class="muted small">Heute um ${entry.slot.start} Uhr</p>`}
      ${!due || !entry
        ? html`<p class="muted">Heute nicht fällig.</p>`
        : html`
          <div class="row">
            <button class="btn" onClick=${() => toggle(false)}>${entry.doneAt ? 'Doch nicht erledigt' : 'Erledigt'}</button>
            ${routine.bonus && html`
              <button class="btn secondary" onClick=${() => toggle(true)}>
                ${entry.bonusDoneAt ? 'Bonus zurücknehmen' : `Bonus: ${routine.bonus}`}
              </button>`}
          </div>`}
    <//>`;
}

function PhotoSheet({ photo, reload, notify, onClose }) {
  const cam = useRef(null);
  const gallery = useRef(null);
  const label = PHOTO_SLOTS.find((s) => s.key === photo.slot)?.label || 'Foto';

  const replace = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    await savePhoto(file, { date: photo.date, slot: photo.slot });
    await reload();
    onClose();
  };
  const remove = async () => {
    if (!confirm(`${label}-Foto von heute löschen?`)) return;
    await deletePhoto(photo.id);
    await reload();
    notify('Foto gelöscht.');
    onClose();
  };

  return html`
    <${Sheet} title=${label} onClose=${onClose}>
      <div class="photo-full"><${BlobImage} blob=${photo.blob} alt=${label} /></div>
      <p class="muted small">${hhmm(photo.createdAt)} Uhr · ${photo.w}×${photo.h}</p>
      <div class="row">
        <button class="btn secondary" onClick=${() => cam.current.click()}>Neu aufnehmen</button>
        <button class="btn secondary" onClick=${() => gallery.current.click()}>Aus Galerie</button>
        <button class="btn secondary danger" onClick=${remove}>Löschen</button>
      </div>
      <input ref=${cam} class="visually-hidden" type="file" accept="image/*" tabindex="-1"
        capture=${photo.slot === 'selfie' ? 'user' : 'environment'} onChange=${replace} />
      <input ref=${gallery} class="visually-hidden" type="file" accept="image/*" tabindex="-1" onChange=${replace} />
    <//>`;
}

// ---------- Schicht ----------

function Layer({ area, index, prevLayer, store, digger, onGoal, onNewGoal, diggerPal, gear }) {
  const [open, setOpen] = useState(false);
  const [frame, setFrame] = useState(0);
  const goals = store.goals
    .filter((g) => g.areaId === area.id && g.status !== 'archived')
    .sort((a, b) => a.order - b.order);
  const pinned = goals.find((g) => g.id === area.pinnedGoalId) || goals[0];
  const shownGoals = !pinned ? [] : open ? [pinned, ...goals.filter((g) => g !== pinned)] : [pinned];
  // Arbeitet der Gräber an einem eingeklappten Ziel dieser Schicht, steht er im sichtbaren Tunnel.
  const diggerHere = digger && goals.some((g) => g.id === digger.goalId);
  const diggerHidden = diggerHere && !shownGoals.some((g) => g.id === digger.goalId);
  const rows = shownGoals.map((goal, i) => {
    const progress = tunnelProgress(goal, store);
    return {
      goal,
      progress,
      valueFrac: goal.kind === 'number' && goal.target ? progress.value / goal.target : null,
      digger: diggerHere && (goal.id === digger.goalId || (diggerHidden && i === 0)),
      digging: diggerHere && digger.digging,
      frame,
    };
  });
  const digging = Boolean(diggerHere && digger.digging);
  useEffect(() => {
    if (!digging) return undefined;
    const t = setInterval(() => setFrame((f) => f + 1), 420);
    return () => clearInterval(t);
  }, [digging]);
  // Aufgeklappt (oder ohne Ziel) gibt es unten eine Zeile für „Neues Ziel“.
  const showNew = open || goals.length === 0;
  const NEW_ROW = 14;
  const h = layerHeight(rows.length) + (showNew ? NEW_ROW : 0);
  const deps = [rows.map((r) => `${r.goal.id}:${r.progress.dug}:${r.progress.finds.map((f) => +f.reached).join('')}:${r.valueFrac}:${r.digger}`).join('|'), digging ? frame : -1, diggerPal && JSON.stringify(diggerPal), gear?.pet.index];
  const head = rows[0]?.progress;
  const x0 = (SHAFT.x + SHAFT.w) * P;

  return html`
    <section class="layer" style="height:${h * P}px">
      <${PixelCanvas} deps=${deps}
        draw=${(ctx, w, ch) => drawLayer(ctx, w, ch, { layer: area.layer, prevLayer, rows, seed: 11 + index * 97, diggerPal, gear })} />
      <button class="sign" style="left:${x0 + 2 * P}px;top:${LAYER_GEO.padTop * P}px"
        onClick=${() => setOpen(!open)} aria-expanded=${open}>
        <span class="label">${area.name}${head ? ` ${head.done}/${head.total}` : ''}</span>
        <span class="sign-more label">${open ? '–' : goals.length > 1 ? `+${goals.length - 1}` : '+'}</span>
      </button>
      ${rows.map((r, i) => html`
        <button key=${r.goal.id} class="tunnel-hit"
          style="left:${x0}px;top:${rowTop(i) * P}px;height:${LAYER_GEO.rowH * P}px"
          onClick=${(e) => onGoal(r.goal, e.currentTarget)}>
          <span class="tunnel-label">
            <span class="tunnel-name">${r.goal.title}</span>
            <span class="num">${r.goal.kind === 'number'
              ? `${formatNumber(r.progress.value)}/${formatNumber(r.goal.target)}`
              : `${r.progress.done}/${r.progress.total}`}</span>
          </span>
        </button>`)}
      ${showNew && html`
        <button class="new-goal" style="left:${x0 + 2 * P}px;top:${(layerHeight(rows.length) - LAYER_GEO.padBottom) * P}px"
          onClick=${onNewGoal}>+ Neues Ziel in ${area.name}</button>`}
    </section>`;
}
