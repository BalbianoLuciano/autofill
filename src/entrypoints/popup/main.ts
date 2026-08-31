/**
 * El popup: el boton, el resultado y el editor del perfil.
 *
 * Tambien es quien inyecta el motor en la pagina. `activeTab` concede el
 * permiso sobre la pestana en el momento en que se abre este popup, asi que la
 * inyeccion tiene que salir de aca y no del service worker.
 */

import { browser } from 'wxt/browser';
import { FIELDS, FIELD_BY_KEY, type FieldKey } from '../../core/fields';
import {
  clearAll,
  exportJson,
  forgetMapping,
  getMappings,
  getStore,
  importJson,
  learnMapping,
  saveProfile,
  saveSettings,
} from '../../core/storage';
import type { FilledField, FillReport, Profile, SkippedField } from '../../types';
import { FIELD_LABELS, GROUPS, SKIP_REASON_LABELS } from './labels';

/** El motor compilado. WXT lo publica en la raiz del paquete. */
const ENGINE = '/autofill.js';

interface FrameReport {
  frameId: number;
  report: FillReport;
}

const $ = <T extends HTMLElement>(selector: string): T => {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Falta ${selector} en el popup`);
  return el;
};

const runButton = $<HTMLButtonElement>('#run');
const resultBox = $<HTMLDivElement>('#result');
const siteLine = $<HTMLParagraphElement>('#site');
const profileForm = $<HTMLFormElement>('#profile-form');
const profileStatus = $<HTMLParagraphElement>('#profile-status');

let profile: Profile = {};

/* ---------------------------------- tabs ---------------------------------- */

for (const tab of document.querySelectorAll<HTMLButtonElement>('nav button')) {
  tab.addEventListener('click', () => {
    for (const other of document.querySelectorAll<HTMLButtonElement>('nav button')) {
      const selected = other === tab;
      other.setAttribute('aria-selected', String(selected));
      $(`#panel-${other.dataset.tab}`).hidden = !selected;
    }
  });
}

/* --------------------------------- perfil --------------------------------- */

function renderProfileForm(values: Profile): void {
  profileForm.replaceChildren(
    ...GROUPS.map((group) => {
      const fieldset = document.createElement('fieldset');
      const legend = document.createElement('legend');
      legend.textContent = group.title;
      fieldset.append(legend);

      for (const key of group.keys) {
        const def = FIELD_BY_KEY.get(key);
        const wrapper = document.createElement('label');
        wrapper.className = def?.sensitive ? 'field sensitive' : 'field';

        const caption = document.createElement('span');
        caption.textContent = FIELD_LABELS[key];

        const input = def?.multiline
          ? document.createElement('textarea')
          : Object.assign(document.createElement('input'), { type: 'text' });
        input.name = key;
        input.value = values[key] ?? '';

        wrapper.append(caption, input);
        fieldset.append(wrapper);
      }
      return fieldset;
    }),
  );
}

function readProfileForm(): Profile {
  const data = new FormData(profileForm);
  const next: Profile = {};
  for (const field of FIELDS) {
    const value = data.get(field.key);
    if (typeof value === 'string' && value.trim()) next[field.key] = value.trim();
  }
  return next;
}

function setStatus(text: string, kind: 'ok' | 'error' = 'ok'): void {
  profileStatus.textContent = text;
  profileStatus.dataset.kind = kind;
  if (text) window.setTimeout(() => (profileStatus.textContent = ''), 2600);
}

$<HTMLButtonElement>('#save').addEventListener('click', async () => {
  profile = readProfileForm();
  await saveProfile(profile);
  setStatus('Perfil guardado.');
});

$<HTMLInputElement>('#fill-sensitive').addEventListener('change', (event) => {
  void saveSettings({ fillSensitive: (event.target as HTMLInputElement).checked });
});

$<HTMLInputElement>('#overwrite-filled').addEventListener('change', (event) => {
  void saveSettings({ overwriteFilled: (event.target as HTMLInputElement).checked });
});

$<HTMLButtonElement>('#export').addEventListener('click', async () => {
  const json = await exportJson();
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  try {
    // `saveAs: true` abre el dialogo nativo, que le saca el foco al popup; al
    // cerrarse el popup se destruye su documento y con el muere el blob, asi
    // que la descarga se cancela sola. Sin dialogo, el popup sigue vivo.
    await browser.downloads.download({ url, filename: 'autofill-perfil.json' });
    setStatus('Exportado a Descargas.');
  } catch {
    setStatus('No se pudo exportar.', 'error');
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
});

const clearButton = $<HTMLButtonElement>('#clear');

clearButton.addEventListener('click', async () => {
  // Dos pasos en vez de un confirm(): el dialogo nativo le saca el foco al
  // popup y lo cierra, asi que la confirmacion nunca se llegaria a ver.
  if (clearButton.dataset.armed !== 'true') {
    clearButton.dataset.armed = 'true';
    clearButton.textContent = 'Borrar todo, en serio';
    window.setTimeout(() => {
      clearButton.dataset.armed = 'false';
      clearButton.textContent = 'Borrar todo';
    }, 4000);
    return;
  }

  await clearAll();
  profile = {};
  renderProfileForm(profile);
  $<HTMLInputElement>('#fill-sensitive').checked = false;
  $<HTMLInputElement>('#overwrite-filled').checked = false;
  clearButton.dataset.armed = 'false';
  clearButton.textContent = 'Borrar todo';
  setStatus('Se borro el perfil y todo lo aprendido.');
});

const importInput = $<HTMLInputElement>('#import-file');

$<HTMLButtonElement>('#import').addEventListener('click', () => importInput.click());

importInput.addEventListener('change', async () => {
  const file = importInput.files?.[0];
  if (!file) return;
  try {
    const store = await importJson(await file.text());
    profile = store.profile;
    renderProfileForm(profile);
    $<HTMLInputElement>('#fill-sensitive').checked = store.settings.fillSensitive;
    $<HTMLInputElement>('#overwrite-filled').checked = store.settings.overwriteFilled;
    setStatus('Perfil importado.');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'No se pudo leer el archivo.', 'error');
  } finally {
    importInput.value = '';
  }
});

/* -------------------------------- rellenar -------------------------------- */

runButton.addEventListener('click', async () => {
  runButton.disabled = true;
  runButton.textContent = 'Rellenando…';
  resultBox.replaceChildren();

  try {
    renderReports(await runOnActiveTab());
  } catch (error) {
    renderError(error);
  } finally {
    runButton.disabled = false;
    runButton.textContent = 'Rellenar';
  }
});

async function runOnActiveTab(): Promise<FrameReport[]> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No hay una pestana activa.');

  // allFrames porque casi todos los ATS embebidos viven en un iframe: el
  // formulario de Greenhouse dentro de la web de la empresa es el caso tipico.
  const injections = await browser.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true },
    files: [ENGINE],
  });

  const store = await getStore();
  profile = store.profile;

  const reports = await Promise.all(
    injections.map(async ({ frameId }): Promise<FrameReport | null> => {
      try {
        const ping = await browser.tabs.sendMessage(tab.id!, { type: 'AUTOFILL_PING' }, { frameId });
        const hostname = (ping as { hostname?: string } | undefined)?.hostname;
        if (!hostname) return null;

        const report = (await browser.tabs.sendMessage(
          tab.id!,
          {
            type: 'AUTOFILL_RUN',
            profile: store.profile,
            mappings: await getMappings(hostname),
            fillSensitive: store.settings.fillSensitive,
            overwriteFilled: store.settings.overwriteFilled,
          },
          { frameId },
        )) as FillReport;

        return { frameId, report };
      } catch {
        // Un frame puede no responder (about:blank, sandbox, cross-origin sin
        // acceso). No es un error del que haya que avisar.
        return null;
      }
    }),
  );

  return reports.filter((r): r is FrameReport => r !== null);
}

/* -------------------------------- resultado -------------------------------- */

function renderReports(frames: FrameReport[]): void {
  const filled = frames.flatMap((f) =>
    f.report.filled.map((item) => ({ ...item, hostname: f.report.hostname })),
  );
  const skipped = frames.flatMap((f) =>
    f.report.skipped.map((s) => ({ ...s, frameId: f.frameId, hostname: f.report.hostname })),
  );

  if (frames.length === 0) {
    resultBox.append(
      paragraph(
        'empty',
        'No se pudo leer esta pagina. Chrome bloquea las paginas internas del navegador y la Chrome Web Store.',
      ),
    );
    return;
  }

  const summary = document.createElement('p');
  summary.className = 'summary';
  summary.append(strongCount(filled.length), document.createTextNode(plural(filled.length)));
  resultBox.append(summary);

  if (filled.length > 0) {
    resultBox.append(section('ok', 'Completados', filled.map(filledItem)));
  }

  const sensitive = skipped.filter((s) => s.reason === 'sensitive');
  if (sensitive.length > 0) {
    resultBox.append(
      section(
        'warn',
        'Sensibles, sin tocar',
        sensitive.map((s) => item(s.label || FIELD_LABELS[s.key!], 'Resaltado en naranja')),
      ),
    );
  }

  const noOption = skipped.filter((s) => s.reason === 'no-option');
  if (noOption.length > 0) {
    resultBox.append(
      section(
        'warn',
        'Sin opcion parecida',
        noOption.map((s) => item(s.label, (s.options ?? []).slice(0, 6).join(' · '))),
      ),
    );
  }

  const unmapped = skipped.filter((s) => s.reason === 'unmapped');
  if (unmapped.length > 0) {
    resultBox.append(
      section('idle', 'Sin reconocer', unmapped.map(unmappedItem)),
    );
  }

  const other = skipped.filter(
    (s) => s.reason === 'no-value' || s.reason === 'already-filled',
  );
  if (other.length > 0) {
    resultBox.append(
      section(
        'idle',
        'Salteados',
        other.map((s) => item(s.label || FIELD_LABELS[s.key!], SKIP_REASON_LABELS[s.reason])),
      ),
    );
  }
}

type LocatedFill = FilledField & { hostname: string };
type LocatedSkip = SkippedField & { frameId: number; hostname: string };

/**
 * Un campo completado. Si vino de un mapping aprendido lleva un boton para
 * desaprenderlo: es la unica forma de corregir una asignacion equivocada, que
 * si no queda pegada para siempre en ese sitio.
 */
function filledItem(field: LocatedFill): HTMLLIElement {
  const li = item(FIELD_LABELS[field.key], field.value);
  if (field.via !== 'learned') return li;

  const forget = document.createElement('button');
  forget.className = 'link';
  forget.textContent = 'Aprendido acá · olvidar';
  forget.addEventListener('click', async () => {
    await forgetMapping(field.hostname, field.signature);
    forget.textContent = 'Olvidado. Se vuelve a adivinar la próxima.';
    forget.disabled = true;
  });

  li.append(forget);
  return li;
}

/**
 * Un campo sin reconocer, con un desplegable para asignarlo.
 *
 * Esto es el aprendizaje: al elegir se guarda el mapping para ese hostname y se
 * rellena en el momento. La proxima vez en ese sitio ya lo sabe.
 */
function unmappedItem(skip: LocatedSkip): HTMLLIElement {
  const li = item(skip.label || skip.signature, skip.signature);

  const select = document.createElement('select');
  select.append(new Option('Asignar a…', ''));
  for (const field of FIELDS) select.append(new Option(FIELD_LABELS[field.key], field.key));

  select.addEventListener('change', async () => {
    const key = select.value as FieldKey | '';
    if (!key) return;

    await learnMapping(skip.hostname, skip.signature, key);
    const value = profile[key];

    if (!value) {
      li.querySelector('.meta')!.textContent = `Aprendido. Falta el dato en el perfil.`;
      select.disabled = true;
      return;
    }

    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await browser.tabs
        .sendMessage(
          tab.id,
          { type: 'AUTOFILL_APPLY_LEARNED', signature: skip.signature, key, value },
          { frameId: skip.frameId },
        )
        .catch(() => undefined);
    }

    li.querySelector('.meta')!.textContent = `Aprendido: ${FIELD_LABELS[key]} · ${value}`;
    select.disabled = true;
  });

  li.append(select);
  return li;
}

function section(dot: 'ok' | 'warn' | 'idle', title: string, items: HTMLLIElement[]): HTMLDivElement {
  const group = document.createElement('div');
  group.className = 'group';

  const heading = document.createElement('h2');
  const marker = document.createElement('span');
  marker.className = `dot ${dot}`;
  heading.append(marker, document.createTextNode(`${title} (${items.length})`));

  const list = document.createElement('ul');
  list.append(...items);

  group.append(heading, list);
  return group;
}

function item(label: string, meta: string): HTMLLIElement {
  const li = document.createElement('li');
  const name = document.createElement('span');
  name.className = 'label';
  name.textContent = label || '(sin etiqueta)';
  const detail = document.createElement('span');
  detail.className = 'meta';
  detail.textContent = meta;
  li.append(name, detail);
  return li;
}

function paragraph(className: string, text: string): HTMLParagraphElement {
  const p = document.createElement('p');
  p.className = className;
  p.textContent = text;
  return p;
}

function strongCount(count: number): HTMLElement {
  const strong = document.createElement('strong');
  strong.textContent = String(count);
  return strong;
}

function plural(count: number): string {
  return count === 1 ? ' campo completado' : ' campos completados';
}

function renderError(error: unknown): void {
  const message =
    error instanceof Error && /cannot access|Extension manifest|chrome:\/\//i.test(error.message)
      ? 'Chrome no deja actuar en esta pagina. Proba en el formulario de la aplicacion.'
      : error instanceof Error
        ? error.message
        : 'Algo salio mal.';
  resultBox.append(paragraph('error', message));
}

/* --------------------------------- arranque --------------------------------- */

async function init(): Promise<void> {
  if (new URLSearchParams(location.search).has('onboarding')) {
    document.body.classList.add('as-tab');
  }

  const store = await getStore();
  profile = store.profile;
  renderProfileForm(profile);
  $<HTMLInputElement>('#fill-sensitive').checked = store.settings.fillSensitive;
  $<HTMLInputElement>('#overwrite-filled').checked = store.settings.overwriteFilled;

  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  try {
    siteLine.textContent = tab?.url ? new URL(tab.url).hostname : '';
  } catch {
    siteLine.textContent = '';
  }

  // Sin perfil no hay nada que rellenar: se abre directo en el editor.
  if (Object.keys(profile).length === 0) {
    document.querySelector<HTMLButtonElement>('nav button[data-tab="profile"]')?.click();
  }
}

void init();
