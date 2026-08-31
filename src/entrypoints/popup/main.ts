/**
 * El popup: el boton, el resultado y el editor del perfil.
 *
 * Tambien es quien inyecta el motor en la pagina. `activeTab` concede el
 * permiso sobre la pestana en el momento en que se abre este popup, asi que la
 * inyeccion tiene que salir de aca y no del service worker.
 */

import { browser } from 'wxt/browser';
import { FIELDS, FIELD_BY_KEY, kindOf, type FieldKey } from '../../core/fields';
import {
  clearAll, deleteQuestion, exportJson, forgetMapping, getMappings, getStore,
  importJson, learnMapping, saveProfile, saveSettings,
} from '../../core/storage';
import { deleteCv, listCvs, pickCv, readCv, renameCv, saveCv } from '../../core/cvs';
import type {
  Currency, CustomQuestion, CvMeta, CvRole, FilledField, FillReport, Lang,
  Period, Profile, ProfileValue, RegionCode, SalaryEntry, Settings, SkillEntry,
  SkippedField,
} from '../../types';
import {
  CURRENCY_LABELS, FIELD_HINTS, FIELD_LABELS, GROUPS, LANG_LABELS,
  PERIOD_LABELS, REGION_LABELS, SKIP_REASON_LABELS,
} from './labels';

/** El motor compilado. WXT lo publica en la raiz del paquete. */
const ENGINE = '/autofill.js';

const CURRENCIES: Currency[] = ['USD', 'ARS', 'EUR'];
const PERIODS: Period[] = ['hour', 'month', 'year'];
const REGIONS: RegionCode[] = ['AR', 'ES', 'EU', 'US', 'UK', 'CA', 'MX', 'BR'];
/** Cuantas monedas se pueden cargar para un mismo sueldo. */
const SALARY_ROWS = 2;

interface FrameReport {
  frameId: number;
  report: FillReport;
}

const $ = <T extends HTMLElement>(selector: string): T => {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Falta ${selector} en el popup`);
  return el;
};

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

const runButton = $<HTMLButtonElement>('#run');
const resultBox = $<HTMLDivElement>('#result');
const siteLine = $<HTMLParagraphElement>('#site');
const profileForm = $<HTMLFormElement>('#profile-form');
const profileStatus = $<HTMLParagraphElement>('#profile-status');

let profile: Profile = {};
let settings: Settings;
let questions: CustomQuestion[] = [];
let cvs: CvMeta[] = [];
/** El CV que se va a adjuntar, ya elegido para la pestana actual. */
let chosenCv: CvMeta | null = null;

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

/* ---------------------------- editor del perfil ---------------------------- */

function fieldWrapper(key: FieldKey, ...controls: Node[]): HTMLElement {
  const def = FIELD_BY_KEY.get(key);
  const wrapper = el('div', { className: def?.sensitive ? 'field sensitive' : 'field' });
  wrapper.append(el('span', { className: 'field-name' }, FIELD_LABELS[key]));

  const hint = FIELD_HINTS[key];
  if (hint) wrapper.append(el('span', { className: 'field-hint' }, hint));

  wrapper.append(...controls);
  return wrapper;
}

function textControls(key: FieldKey, value: ProfileValue | undefined): Node[] {
  const def = FIELD_BY_KEY.get(key);
  const current = value?.kind === 'text' ? value : undefined;
  const make = (lang: Lang) => {
    const input = def?.multiline
      ? el('textarea', { name: `${key}.${lang}` })
      : el('input', { type: 'text', name: `${key}.${lang}` });
    input.value = current?.[lang] ?? '';
    return input;
  };

  if (!def?.localized) return [make('es')];

  // Dos idiomas al lado: la pagina decide cual se usa. Si falta el ingles, se
  // cae al castellano, asi que dejarlo vacio no rompe nada.
  return [
    el('div', { className: 'bilingual' },
      el('label', { className: 'lang-slot' }, el('span', {}, 'ES'), make('es')),
      el('label', { className: 'lang-slot' }, el('span', {}, 'EN'), make('en')),
    ),
  ];
}

function choiceControl(key: FieldKey, value: ProfileValue | undefined): Node {
  const select = el('select', { name: key });
  select.append(new Option('—', ''));
  for (const option of FIELD_BY_KEY.get(key)?.options ?? []) {
    select.append(new Option(option.es, option.code));
  }
  if (value?.kind === 'choice') select.value = value.code;
  return select;
}

function salaryControls(key: FieldKey, value: ProfileValue | undefined): Node[] {
  const current = value?.kind === 'salary' ? value : undefined;
  const rows: Node[] = [];

  for (let i = 0; i < SALARY_ROWS; i++) {
    const entry: SalaryEntry | undefined = current?.entries[i];

    const amount = el('input', {
      type: 'text',
      inputMode: 'numeric',
      name: `${key}.${i}.amount`,
      placeholder: i === 0 ? 'Monto' : 'Otra moneda (opcional)',
    });
    amount.value = entry ? String(entry.amount) : '';

    const currency = el('select', { name: `${key}.${i}.currency` });
    for (const code of CURRENCIES) currency.append(new Option(CURRENCY_LABELS[code], code));
    currency.value = entry?.currency ?? (i === 0 ? 'USD' : 'ARS');

    const period = el('select', { name: `${key}.${i}.period` });
    for (const code of PERIODS) period.append(new Option(PERIOD_LABELS[code], code));
    period.value = entry?.period ?? 'month';

    rows.push(el('div', { className: 'salary-row' }, amount, currency, period));
  }

  const hours = el('input', { type: 'text', inputMode: 'numeric', name: `${key}.hours` });
  hours.value = String(current?.hoursPerMonth ?? 160);
  rows.push(
    el('label', { className: 'hours' },
      el('span', {}, 'Horas por mes, para calcular la tarifa horaria'),
      hours,
    ),
  );

  return rows;
}

/**
 * La matriz de tecnologias.
 *
 * Un total general arriba, y debajo una fila por tecnologia. Es lo que evita
 * que "¿cuantos anios con Kubernetes?" se conteste con tu total.
 */
function skillsControls(key: FieldKey, value: ProfileValue | undefined): Node[] {
  const current = value?.kind === 'skills' ? value : undefined;

  const total = el('input', {
    type: 'text', inputMode: 'numeric', name: `${key}.total`, placeholder: '5',
  });
  total.value = current?.totalYears ? String(current.totalYears) : '';

  const rows = el('div', { className: 'skill-rows' });

  const addRow = (entry?: SkillEntry) => {
    const row = el('div', { className: 'skill-row' });
    row.dataset.skillRow = key;

    const name = el('input', { type: 'text', className: 'skill-name', placeholder: 'React' });
    name.value = entry?.name ?? '';

    const years = el('input', {
      type: 'text', className: 'skill-years', inputMode: 'numeric', placeholder: 'años',
    });
    years.value = entry ? String(entry.years) : '';

    const remove = el('button', { className: 'link', type: 'button', textContent: '×' });
    remove.addEventListener('click', () => row.remove());

    row.append(name, years, remove);
    rows.append(row);
  };

  for (const entry of current?.entries ?? []) addRow(entry);
  // Un par de filas vacias, para que se pueda empezar a escribir sin clickear.
  addRow();
  addRow();

  const add = el('button', { className: 'link', type: 'button', textContent: '+ otra tecnología' });
  add.addEventListener('click', () => addRow());

  return [
    el('label', { className: 'hours' }, el('span', {}, 'Años de experiencia en total'), total),
    el('span', { className: 'field-hint' },
      'Por tecnología, para que cada pregunta reciba su número:'),
    rows,
    add,
  ];
}

function regionsControl(key: FieldKey, value: ProfileValue | undefined): Node {
  const selected = new Set(value?.kind === 'regions' ? value.codes : []);
  const box = el('div', { className: 'regions' });

  for (const code of REGIONS) {
    const input = el('input', { type: 'checkbox', name: `${key}.region`, value: code });
    input.checked = selected.has(code);
    box.append(el('label', { className: 'region' }, input, el('span', {}, REGION_LABELS[code])));
  }

  return box;
}

function renderProfileForm(values: Profile): void {
  profileForm.replaceChildren(
    ...GROUPS.map((group) => {
      const fieldset = el('fieldset', {}, el('legend', {}, group.title));
      if (group.note) fieldset.append(el('p', { className: 'group-note' }, group.note));

      for (const key of group.keys) {
        const value = values[key];
        switch (kindOf(key)) {
          case 'choice':
            fieldset.append(fieldWrapper(key, choiceControl(key, value)));
            break;
          case 'salary':
            fieldset.append(fieldWrapper(key, ...salaryControls(key, value)));
            break;
          case 'regions':
            fieldset.append(fieldWrapper(key, regionsControl(key, value)));
            break;
          case 'skills':
            fieldset.append(fieldWrapper(key, ...skillsControls(key, value)));
            break;
          default:
            fieldset.append(fieldWrapper(key, ...textControls(key, value)));
        }
      }
      return fieldset;
    }),
  );
}

function readProfileForm(): Profile {
  const data = new FormData(profileForm);
  const next: Profile = {};
  const str = (name: string) => {
    const value = data.get(name);
    return typeof value === 'string' ? value.trim() : '';
  };

  for (const field of FIELDS) {
    const key = field.key;
    switch (kindOf(key)) {
      case 'choice': {
        const code = str(key);
        if (code) next[key] = { kind: 'choice', code };
        break;
      }
      case 'salary': {
        const entries: SalaryEntry[] = [];
        for (let i = 0; i < SALARY_ROWS; i++) {
          // Se aceptan `3.500.000` y `3 500 000`: separar miles es lo natural
          // al escribir un sueldo, y guardarlo asi rompe la conversion.
          const amount = Number(str(`${key}.${i}.amount`).replace(/[.,\s]/g, ''));
          if (!Number.isFinite(amount) || amount <= 0) continue;
          entries.push({
            amount,
            currency: (str(`${key}.${i}.currency`) || 'USD') as Currency,
            period: (str(`${key}.${i}.period`) || 'month') as Period,
          });
        }
        if (entries.length > 0) {
          const hours = Number(str(`${key}.hours`));
          next[key] = {
            kind: 'salary',
            entries,
            hoursPerMonth: Number.isFinite(hours) && hours > 0 ? hours : 160,
          };
        }
        break;
      }
      case 'regions': {
        const codes = data.getAll(`${key}.region`).filter(
          (v): v is string => typeof v === 'string',
        ) as RegionCode[];
        if (codes.length > 0) next[key] = { kind: 'regions', codes };
        break;
      }
      case 'skills': {
        // Las filas se leen del DOM y no del FormData: se agregan y se quitan
        // sobre la marcha, asi que no hay indices fijos.
        const entries: SkillEntry[] = [];
        for (const row of profileForm.querySelectorAll<HTMLElement>(`[data-skill-row="${key}"]`)) {
          const name = row.querySelector<HTMLInputElement>('.skill-name')?.value.trim() ?? '';
          const years = Number(row.querySelector<HTMLInputElement>('.skill-years')?.value);
          if (name && Number.isFinite(years) && years >= 0) entries.push({ name, years });
        }
        const total = Number(str(`${key}.total`));
        if (entries.length > 0 || (Number.isFinite(total) && total > 0)) {
          next[key] = {
            kind: 'skills',
            totalYears: Number.isFinite(total) ? total : 0,
            entries,
          };
        }
        break;
      }
      default: {
        const es = str(`${key}.es`);
        const en = str(`${key}.en`);
        if (es || en) next[key] = { kind: 'text', ...(es ? { es } : {}), ...(en ? { en } : {}) };
      }
    }
  }

  return next;
}

function setStatus(text: string, kind: 'ok' | 'error' = 'ok'): void {
  say(profileStatus, text, kind);
}

/** Exportar, importar y borrar viven en Ajustes, con su propio aviso. */
function setSettingsStatus(text: string, kind: 'ok' | 'error' = 'ok'): void {
  say($<HTMLParagraphElement>('#settings-status'), text, kind);
}

function say(node: HTMLElement, text: string, kind: 'ok' | 'error'): void {
  node.textContent = text;
  node.dataset.kind = kind;
  if (text) window.setTimeout(() => (node.textContent = ''), 2600);
}

/* ------------------------------- ajustes -------------------------------- */

$<HTMLButtonElement>('#save').addEventListener('click', async () => {
  profile = readProfileForm();
  await saveProfile(profile);
  setStatus('Perfil guardado.');
});

$<HTMLInputElement>('#fill-sensitive').addEventListener('change', (event) => {
  settings.fillSensitive = (event.target as HTMLInputElement).checked;
  void saveSettings({ fillSensitive: settings.fillSensitive });
});

$<HTMLInputElement>('#overwrite-filled').addEventListener('change', (event) => {
  settings.overwriteFilled = (event.target as HTMLInputElement).checked;
  void saveSettings({ overwriteFilled: settings.overwriteFilled });
});

$<HTMLInputElement>('#auto-apply').addEventListener('change', (event) => {
  settings.autoApply = (event.target as HTMLInputElement).checked;
  void saveSettings({ autoApply: settings.autoApply });
});

$<HTMLInputElement>('#attach-cv').addEventListener('change', (event) => {
  settings.attachCv = (event.target as HTMLInputElement).checked;
  void saveSettings({ attachCv: settings.attachCv });
});

$<HTMLSelectElement>('#language').addEventListener('change', (event) => {
  settings.language = (event.target as HTMLSelectElement).value as Settings['language'];
  void saveSettings({ language: settings.language });
});

/* --------------------------- exportar / importar --------------------------- */

$<HTMLButtonElement>('#export').addEventListener('click', async () => {
  const json = await exportJson();
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  try {
    // `saveAs: true` abre el dialogo nativo, que le saca el foco al popup; al
    // cerrarse el popup se destruye su documento y con el muere el blob, asi
    // que la descarga se cancela sola. Sin dialogo, el popup sigue vivo.
    await browser.downloads.download({ url, filename: 'autofill-perfil.json' });
    setSettingsStatus('Exportado a Descargas.');
  } catch {
    setSettingsStatus('No se pudo exportar.', 'error');
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
  questions = [];
  renderProfileForm(profile);
  renderQuestions();
  clearButton.dataset.armed = 'false';
  clearButton.textContent = 'Borrar todo';
  setSettingsStatus('Se borró el perfil y todo lo aprendido.');
});

const importInput = $<HTMLInputElement>('#import-file');

$<HTMLButtonElement>('#import').addEventListener('click', () => importInput.click());

importInput.addEventListener('change', async () => {
  const file = importInput.files?.[0];
  if (!file) return;
  try {
    const store = await importJson(await file.text());
    profile = store.profile;
    settings = store.settings;
    renderProfileForm(profile);
    reflectSettings();
    setSettingsStatus('Perfil importado.');
  } catch (error) {
    setSettingsStatus(error instanceof Error ? error.message : 'No se pudo leer el archivo.', 'error');
  } finally {
    importInput.value = '';
  }
});

/* ---------------------------------- CVs ---------------------------------- */

function renderCvs(): void {
  const list = $<HTMLUListElement>('#cv-list');

  if (cvs.length === 0) {
    list.replaceChildren(el('p', { className: 'empty' }, 'Todavía no cargaste ninguno.'));
    return;
  }

  list.replaceChildren(
    ...cvs.map((cv) => {
      const body = el('div', { className: 'cv-body' },
        el('span', { className: 'label' }, cv.label || cv.filename),
        el('span', { className: 'meta' },
          `${cv.lang.toUpperCase()} · ${roleLabel(cv.role)} · ${Math.round(cv.size / 1024)} kB`),
      );

      // El nombre con el que se sube es lo unico de esta tarjeta que ve otra
      // persona, asi que se muestra aparte y se puede corregir en el momento.
      const filename = el('button', {
        className: 'filename',
        title: 'Renombrar. Es el nombre que ve quien abre tu aplicación.',
        textContent: cv.filename,
      });

      filename.addEventListener('click', () => {
        const input = el('input', { type: 'text', className: 'rename', value: cv.filename });
        const commit = async () => {
          cvs = await renameCv(cv.id, input.value);
          renderCvs();
        };
        input.addEventListener('blur', () => void commit());
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') input.blur();
          if (event.key === 'Escape') renderCvs();
        });
        filename.replaceWith(input);
        input.focus();
        input.select();
      });

      body.append(filename);

      const li = el('li', {}, body);
      if (chosenCv?.id === cv.id) li.dataset.picked = 'true';

      const remove = el('button', { className: 'link', textContent: 'Borrar' });
      remove.addEventListener('click', async () => {
        await deleteCv(cv.id);
        cvs = await listCvs();
        renderCvs();
      });

      li.append(remove);
      return li;
    }),
  );
}

const roleLabel = (role: CvRole) =>
  role === 'ai' ? 'AI Engineer' : role === 'lead' ? 'Team Leader' : 'Cualquiera';

/**
 * La zona de arrastre.
 *
 * El input nativo sigue ahi, invisible y encima del label: es lo que mantiene
 * el click y el teclado funcionando. Lo unico que agrega esto es el arrastre y
 * mostrar que archivo quedo elegido.
 */
const cvDrop = $<HTMLLabelElement>('#cv-drop');
const cvFile = $<HTMLInputElement>('#cv-file');
const cvFilename = $<HTMLSpanElement>('#cv-filename');

function showChosenFile(): void {
  const file = cvFile.files?.[0];
  cvDrop.dataset.hasFile = String(Boolean(file));
  cvFilename.textContent = file
    ? `${file.name} · ${Math.round(file.size / 1024)} kB`
    : 'Arrastrá el archivo o hacé click';

  if (!file) return;

  // Se proponen los dos, pero son cosas distintas: la etiqueta es para esta
  // lista, y el nombre de subida es lo que ve quien abre la aplicacion.
  const label = $<HTMLInputElement>('#cv-label');
  if (!label.value.trim()) label.value = file.name.replace(/\.[^.]+$/, '');

  const filename = $<HTMLInputElement>('#cv-filename-input');
  if (!filename.value.trim()) filename.value = file.name;
}

cvFile.addEventListener('change', showChosenFile);

for (const event of ['dragenter', 'dragover'] as const) {
  cvDrop.addEventListener(event, (e) => {
    e.preventDefault();
    cvDrop.dataset.dragging = 'true';
  });
}

for (const event of ['dragleave', 'drop'] as const) {
  cvDrop.addEventListener(event, () => (cvDrop.dataset.dragging = 'false'));
}

cvDrop.addEventListener('drop', (event) => {
  event.preventDefault();
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;

  // Se le pasa al input real para que el resto del flujo no cambie.
  const transfer = new DataTransfer();
  transfer.items.add(file);
  cvFile.files = transfer.files;
  showChosenFile();
});

$<HTMLButtonElement>('#cv-save').addEventListener('click', async () => {
  const file = cvFile.files?.[0];
  const status = $<HTMLParagraphElement>('#cv-status');
  if (!file) {
    status.textContent = 'Elegí un archivo primero.';
    status.dataset.kind = 'error';
    return;
  }

  try {
    const label = $<HTMLInputElement>('#cv-label').value.trim() || file.name;
    await saveCv(
      file,
      label,
      $<HTMLSelectElement>('#cv-lang').value as Lang,
      $<HTMLSelectElement>('#cv-role').value as CvRole,
      $<HTMLInputElement>('#cv-filename-input').value,
    );
    cvs = await listCvs();
    renderCvs();
    cvFile.value = '';
    $<HTMLInputElement>('#cv-label').value = '';
    $<HTMLInputElement>('#cv-filename-input').value = '';
    showChosenFile();
    status.textContent = 'CV guardado.';
    status.dataset.kind = 'ok';
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'No se pudo guardar.';
    status.dataset.kind = 'error';
  }
});

function renderQuestions(): void {
  const list = $<HTMLUListElement>('#question-list');

  if (questions.length === 0) {
    list.replaceChildren(el('p', { className: 'empty' }, 'Ninguna todavía.'));
    return;
  }

  list.replaceChildren(
    ...questions.map((q) => {
      const li = el('li', {},
        el('div', {},
          el('span', { className: 'label' }, q.question),
          el('span', { className: 'meta' }, q.answer.slice(0, 90) + (q.answer.length > 90 ? '…' : '')),
        ),
      );

      const remove = el('button', { className: 'link', textContent: 'Borrar' });
      remove.addEventListener('click', async () => {
        await deleteQuestion(q.id);
        questions = (await getStore()).questions;
        renderQuestions();
      });

      li.append(remove);
      return li;
    }),
  );
}

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
  if (!tab?.id) throw new Error('No hay una pestaña activa.');

  // allFrames porque casi todos los ATS embebidos viven en un iframe: el
  // formulario de Greenhouse dentro de la web de la empresa es el caso tipico.
  const injections = await browser.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true },
    files: [ENGINE],
  });

  const store = await getStore();
  profile = store.profile;
  settings = store.settings;
  questions = store.questions;

  // El CV se elige una vez por corrida: idioma del formulario y puesto de la
  // pagina. El titulo de la pestana es la mejor pista del puesto que hay.
  cvs = await listCvs();
  chosenCv = store.settings.attachCv
    ? pickCv(cvs, store.settings.language === 'auto' ? 'en' : store.settings.language, tab.title ?? '')
    : null;
  const cv = chosenCv ? await readCv(chosenCv.id) : null;

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
            settings: store.settings,
            questions: store.questions,
            cv,
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

type LocatedFill = FilledField & { hostname: string };
type LocatedSkip = SkippedField & { frameId: number; hostname: string };

function renderReports(frames: FrameReport[]): void {
  if (frames.length === 0) {
    resultBox.append(
      el('p', { className: 'empty' },
        'No se pudo leer esta página. Chrome bloquea sus páginas internas y la Chrome Web Store.'),
    );
    return;
  }

  const filled = frames.flatMap((f) =>
    f.report.filled.map((item) => ({ ...item, hostname: f.report.hostname })),
  );
  const skipped = frames.flatMap((f) =>
    f.report.skipped.map((s) => ({ ...s, frameId: f.frameId, hostname: f.report.hostname })),
  );

  const summary = el('p', { className: 'summary' });
  summary.append(
    el('strong', {}, String(filled.length)),
    ` ${filled.length === 1 ? 'campo completado' : 'campos completados'}`,
    el('span', { className: 'lang-badge' },
      frames[0]!.report.lang === 'es' ? 'formulario en español' : 'formulario en inglés'),
  );
  resultBox.append(summary);

  const top = frames[0]!.report;
  if (top.cvAttached) {
    resultBox.append(el('p', { className: 'apply-line' }, `CV adjuntado: ${top.cvAttached}`));
  }
  resultBox.append(applyLine(top.apply));

  if (filled.length > 0) {
    resultBox.append(section('ok', 'Completados', filled.map(filledItem)));
  }

  const needsAnswer = skipped.filter((s) => s.reason === 'needs-answer');
  if (needsAnswer.length > 0) {
    resultBox.append(section('warn', 'Preguntas abiertas', needsAnswer.map(
      (s) => item(s.label, 'Contestala en el panel sobre la página'),
    )));
  }

  // Los sensibles traen la sugerencia ya resuelta al periodo y la moneda que
  // pide este formulario: es lo que hay que copiar, no lo que esta guardado.
  const sensitive = skipped.filter((s) => s.reason === 'sensitive');
  if (sensitive.length > 0) {
    resultBox.append(section('warn', 'Sensibles, sin tocar', sensitive.map(suggestionItem)));
  }

  const unlisted = skipped.filter((s) => s.reason === 'unlisted-skill');
  if (unlisted.length > 0) {
    resultBox.append(section('warn', 'Tecnologías sin cargar', unlisted.map(
      (s) => item(s.skill ?? s.label, 'Agregala en Perfil → Años de experiencia'),
    )));
  }

  const noCurrency = skipped.filter((s) => s.reason === 'no-currency');
  if (noCurrency.length > 0) {
    resultBox.append(section('warn', 'Falta esa moneda', noCurrency.map(
      (s) => item(s.label, 'Pide una moneda que no tenés cargada en el perfil'),
    )));
  }

  const noOption = skipped.filter((s) => s.reason === 'no-option');
  if (noOption.length > 0) {
    resultBox.append(section('warn', 'Sin opción parecida', noOption.map(
      (s) => item(s.label, (s.options ?? []).slice(0, 6).join(' · ')),
    )));
  }

  const unmapped = skipped.filter((s) => s.reason === 'unmapped');
  if (unmapped.length > 0) {
    resultBox.append(section('idle', 'Sin reconocer', unmapped.map(unmappedItem)));
  }

  const other = skipped.filter((s) => s.reason === 'no-value' || s.reason === 'already-filled');
  if (other.length > 0) {
    resultBox.append(section('idle', 'Salteados', other.map(
      (s) => item(s.label || FIELD_LABELS[s.key!], SKIP_REASON_LABELS[s.reason]),
    )));
  }
}

/** El estado del envio automatico, en una linea. */
function applyLine(outcome: FillReport['apply']): HTMLElement {
  const line = el('p', { className: 'apply-line' });
  line.dataset.status = outcome.status;

  switch (outcome.status) {
    case 'off':
      line.textContent = 'Envío automático apagado. Revisá y enviá vos.';
      break;
    case 'armed':
      line.textContent = `Enviando con «${outcome.label}» — cancelable desde la página.`;
      break;
    case 'no-button':
      line.textContent = 'Todo completo, pero no se identificó el botón de enviar.';
      break;
    case 'incomplete':
      line.textContent = `Sin enviar, falta: ${outcome.missing.slice(0, 3).join(', ')}.`;
      break;
  }
  return line;
}

/**
 * Un campo completado. Si vino de un mapping aprendido lleva un boton para
 * desaprenderlo: es la unica forma de corregir una asignacion equivocada, que
 * si no queda pegada para siempre en ese sitio.
 */
function filledItem(field: LocatedFill): HTMLLIElement {
  // Con la tecnologia a la vista se ve de un golpe que cada pregunta recibio
  // su propio numero y no el total repetido.
  const name = field.skill
    ? `${FIELD_LABELS[field.key]} · ${field.skill}`
    : FIELD_LABELS[field.key];
  const li = item(name, field.value);
  if (field.via !== 'learned') return li;

  const forget = el('button', { className: 'link', textContent: 'Aprendido acá · olvidar' });
  forget.addEventListener('click', async () => {
    await forgetMapping(field.hostname, field.signature);
    forget.textContent = 'Olvidado. Se vuelve a adivinar la próxima.';
    forget.disabled = true;
  });

  li.append(forget);
  return li;
}

/** Un sensible, con el valor que corresponde y un boton para copiarlo. */
function suggestionItem(skip: LocatedSkip): HTMLLIElement {
  const li = item(skip.label || FIELD_LABELS[skip.key!], skip.suggestion ?? 'Resaltado en naranja');
  if (!skip.suggestion) return li;

  const copy = el('button', { className: 'link', textContent: 'Copiar' });
  copy.addEventListener('click', async () => {
    await navigator.clipboard.writeText(skip.suggestion!);
    copy.textContent = 'Copiado';
    window.setTimeout(() => (copy.textContent = 'Copiar'), 1600);
  });

  li.append(copy);
  return li;
}

/**
 * Un campo sin reconocer, con un desplegable para asignarlo.
 *
 * Al elegir se guarda el mapping para ese hostname y se rellena en el momento.
 * La proxima vez en ese sitio ya lo sabe.
 */
function unmappedItem(skip: LocatedSkip): HTMLLIElement {
  const li = item(skip.label || skip.signature, skip.signature);

  const select = el('select', {});
  select.append(new Option('Asignar a…', ''));
  for (const field of FIELDS) select.append(new Option(FIELD_LABELS[field.key], field.key));

  select.addEventListener('change', async () => {
    const key = select.value as FieldKey | '';
    if (!key) return;

    await learnMapping(skip.hostname, skip.signature, key);
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await browser.tabs
        .sendMessage(
          tab.id,
          { type: 'AUTOFILL_APPLY_LEARNED', signature: skip.signature, key, profile, settings },
          { frameId: skip.frameId },
        )
        .catch(() => undefined);
    }

    li.querySelector('.meta')!.textContent = `Aprendido: ${FIELD_LABELS[key]}`;
    select.disabled = true;
  });

  li.append(select);
  return li;
}

function section(dot: 'ok' | 'warn' | 'idle', title: string, items: HTMLLIElement[]): HTMLDivElement {
  const heading = el('h2', {},
    el('span', { className: `dot ${dot}` }),
    `${title} (${items.length})`,
  );
  const list = el('ul', {});
  list.append(...items);
  return el('div', { className: 'group' }, heading, list);
}

function item(label: string, meta: string): HTMLLIElement {
  return el('li', {},
    el('span', { className: 'label' }, label || '(sin etiqueta)'),
    el('span', { className: 'meta' }, meta),
  );
}

function renderError(error: unknown): void {
  const message =
    error instanceof Error && /cannot access|Extension manifest|chrome:\/\//i.test(error.message)
      ? 'Chrome no deja actuar en esta página. Probá en el formulario de la aplicación.'
      : error instanceof Error
        ? error.message
        : 'Algo salió mal.';
  resultBox.append(el('p', { className: 'error' }, message));
}

/* --------------------------------- arranque --------------------------------- */

function reflectSettings(): void {
  $<HTMLInputElement>('#fill-sensitive').checked = settings.fillSensitive;
  $<HTMLInputElement>('#overwrite-filled').checked = settings.overwriteFilled;
  $<HTMLInputElement>('#auto-apply').checked = settings.autoApply;
  $<HTMLInputElement>('#attach-cv').checked = settings.attachCv;
  $<HTMLSelectElement>('#language').value = settings.language;
}

async function init(): Promise<void> {
  // Sirve para saber de un vistazo si Chrome recargo el build nuevo.
  $('#version').textContent = browser.runtime.getManifest().version;

  if (new URLSearchParams(location.search).has('onboarding')) {
    document.body.classList.add('as-tab');
  }

  const languageSelect = $<HTMLSelectElement>('#language');
  for (const value of ['auto', 'es', 'en'] as const) {
    languageSelect.append(new Option(LANG_LABELS[value], value));
  }

  const store = await getStore();
  profile = store.profile;
  settings = store.settings;
  questions = store.questions;
  cvs = await listCvs();
  renderProfileForm(profile);
  renderCvs();
  renderQuestions();
  reflectSettings();

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
