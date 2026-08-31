/**
 * El panel que aparece sobre el formulario.
 *
 * Vive en la pagina y no en el popup por dos razones: el popup se destruye
 * apenas hace foco en otra cosa, y mide 380px, que no alcanza para contestar
 * una pregunta de tres parrafos teniendo el aviso a la vista.
 *
 * Va dentro de un shadow root para que los estilos del portal no lo toquen ni
 * el lo despeine a el.
 */

const HOST_ID = 'autofill-overlay-host';

const STYLES = `
  :host { all: initial; }
  .panel {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 2147483647;
    width: 380px;
    max-height: 70vh;
    overflow-y: auto;
    padding: 16px;
    border: 1px solid #2a3040;
    border-radius: 12px;
    background: #171a23;
    color: #e6e8ee;
    font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    box-shadow: 0 12px 40px rgba(0, 0, 0, .5);
  }
  h2 { margin: 0 0 4px; font-size: 13px; font-weight: 600; }
  p { margin: 0 0 12px; font-size: 12px; color: #9aa3b2; }
  .q { margin-bottom: 14px; }
  .q label { display: block; margin-bottom: 5px; font-size: 12px; color: #e6e8ee; }
  textarea {
    width: 100%;
    min-height: 88px;
    padding: 8px;
    border: 1px solid #2a3040;
    border-radius: 6px;
    background: #0f1117;
    color: #e6e8ee;
    font: inherit;
    resize: vertical;
    box-sizing: border-box;
  }
  textarea:focus { outline: none; border-color: #7c9cff; }
  .row { display: flex; gap: 8px; align-items: center; }
  button {
    flex: 1;
    padding: 9px;
    border: 0;
    border-radius: 8px;
    background: #7c9cff;
    color: #0b0e17;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  button.ghost {
    background: transparent;
    border: 1px solid #2a3040;
    color: #9aa3b2;
  }
  .count { font-size: 26px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .warn { color: #fb923c; }
  .saved { color: #4ade80; font-size: 11px; }
`;

function mount(): ShadowRoot {
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = HOST_ID;
    document.documentElement.append(host);
    host.attachShadow({ mode: 'open' });
  }
  const shadow = host.shadowRoot!;
  shadow.replaceChildren();

  const style = document.createElement('style');
  style.textContent = STYLES;
  shadow.append(style);
  return shadow;
}

export function closeOverlay(): void {
  document.getElementById(HOST_ID)?.remove();
}

export interface PendingQuestion {
  signature: string;
  label: string;
}

/**
 * Muestra las preguntas que no supimos contestar, con su campo para escribir.
 * Cada respuesta se guarda apenas se escribe: si el formulario se pierde, la
 * respuesta no.
 */
export function showQuestions(
  questions: PendingQuestion[],
  onAnswer: (signature: string, label: string, answer: string) => void,
  onFinish: () => void,
): void {
  const shadow = mount();
  const panel = document.createElement('div');
  panel.className = 'panel';

  const heading = document.createElement('h2');
  heading.textContent = `${questions.length} ${questions.length === 1 ? 'pregunta' : 'preguntas'} sin responder`;

  const sub = document.createElement('p');
  sub.textContent = 'Se guardan para la próxima vez que aparezca la misma.';
  panel.append(heading, sub);

  for (const question of questions) {
    const block = document.createElement('div');
    block.className = 'q';

    const label = document.createElement('label');
    label.textContent = question.label;

    const textarea = document.createElement('textarea');
    const saved = document.createElement('span');
    saved.className = 'saved';

    let timer: number | undefined;
    textarea.addEventListener('input', () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!textarea.value.trim()) return;
        onAnswer(question.signature, question.label, textarea.value.trim());
        saved.textContent = 'Guardada';
      }, 600);
    });

    block.append(label, textarea, saved);
    panel.append(block);
  }

  const done = document.createElement('button');
  done.textContent = 'Listo';
  done.addEventListener('click', () => {
    closeOverlay();
    onFinish();
  });

  const row = document.createElement('div');
  row.className = 'row';
  row.append(done);
  panel.append(row);

  shadow.append(panel);
}

/**
 * La cuenta regresiva antes de enviar.
 *
 * Es la unica red que queda: enviar una aplicacion no se puede deshacer, y
 * varios ATS bloquean volver a postularse al mismo puesto.
 */
export function showCountdown(
  seconds: number,
  buttonLabel: string,
  onFire: () => void,
): void {
  const shadow = mount();
  const panel = document.createElement('div');
  panel.className = 'panel';

  const heading = document.createElement('h2');
  heading.textContent = 'Todo completo';

  const sub = document.createElement('p');
  sub.textContent = `Se va a clickear «${buttonLabel}». No se puede deshacer.`;

  const count = document.createElement('div');
  count.className = 'count';

  const cancel = document.createElement('button');
  cancel.className = 'ghost';
  cancel.textContent = 'Cancelar';

  const now = document.createElement('button');
  now.textContent = 'Enviar ya';

  const row = document.createElement('div');
  row.className = 'row';
  row.append(cancel, now);

  panel.append(heading, sub, count, row);
  shadow.append(panel);

  let left = seconds;
  count.textContent = String(left);

  const fire = () => {
    window.clearInterval(timer);
    closeOverlay();
    onFire();
  };

  const timer = window.setInterval(() => {
    left -= 1;
    count.textContent = String(left);
    if (left <= 0) fire();
  }, 1000);

  cancel.addEventListener('click', () => {
    window.clearInterval(timer);
    closeOverlay();
  });
  now.addEventListener('click', fire);
}

/** Un aviso corto cuando el envio automatico no puede seguir. */
export function showNotice(title: string, detail: string): void {
  const shadow = mount();
  const panel = document.createElement('div');
  panel.className = 'panel';

  const heading = document.createElement('h2');
  heading.className = 'warn';
  heading.textContent = title;

  const sub = document.createElement('p');
  sub.textContent = detail;

  const close = document.createElement('button');
  close.className = 'ghost';
  close.textContent = 'Entendido';
  close.addEventListener('click', closeOverlay);

  const row = document.createElement('div');
  row.className = 'row';
  row.append(close);

  panel.append(heading, sub, row);
  shadow.append(panel);
}
