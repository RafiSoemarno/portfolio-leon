import type { LoadProgress } from './loadModel';

/**
 * Overlay that owns the viewer's non-visual 3D states: loading progress, the
 * failed/offline fallback (poster + retry) and the no-WebGL fallback.
 *
 * The canvas is never left blank: every state renders something on top of it,
 * and `showReady()` clears the overlay so OrbitControls stays unobstructed.
 * Like the other viewer modules this owns its own DOM and removes it in
 * `dispose()`.
 */

export type StatusState = 'idle' | 'loading' | 'ready' | 'error' | 'unsupported';

export interface StatusUi {
  readonly state: StatusState;
  /** Switches to the indeterminate loading state. */
  showLoading(): void;
  /** Updates the loading state; ignored unless currently loading. */
  setProgress(progress: LoadProgress): void;
  /** Clears the overlay and hands the canvas back to the controls. */
  showReady(): void;
  /** Poster + message + retry affordance for a failed or offline load. */
  showError(message: string): void;
  /** Static fallback (poster + message) when WebGL is unavailable. */
  showUnsupported(message: string): void;
  dispose(): void;
}

export interface StatusUiOptions {
  container: HTMLElement;
  /** Shown in the error/unsupported states. Real per-model renders are LEON-18. */
  posterUrl: string;
  onRetry?: () => void;
}

function tag<K extends keyof HTMLElementTagNameMap>(
  name: K,
  className: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(name);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

const PANEL = 'rounded-2xl bg-neutral-900/85 p-6 shadow-2xl ring-1 ring-white/10 backdrop-blur';

export function createStatusUi(options: StatusUiOptions): StatusUi {
  let state: StatusState = 'idle';
  let lastPercent = -1;

  // Root overlay. `pointer-events-none` keeps the canvas orbitable behind the
  // loading state; interactive panels opt back in.
  const root = tag('div', 'pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-4');
  root.style.display = 'none';
  root.dataset.viewerStatus = '';

  // --- Loading ------------------------------------------------------------
  const loadingTitle = tag('p', 'text-sm font-medium text-neutral-100', 'Loading model…');
  const track = tag('div', 'h-1.5 w-full overflow-hidden rounded-full bg-white/15');
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-label', 'Model loading progress');
  const bar = tag('div', 'h-1.5 rounded-full bg-sky-400');
  track.append(bar);
  const percent = tag('p', 'text-xs tabular-nums text-neutral-400', '0%');
  const loadingPanel = tag('div', `${PANEL} flex w-64 flex-col items-center gap-3`);
  loadingPanel.setAttribute('role', 'status');
  loadingPanel.append(loadingTitle, track, percent);

  // --- Message (error / no WebGL) ----------------------------------------
  const poster = tag('img', 'h-40 w-full rounded-xl object-cover opacity-95');
  poster.src = options.posterUrl;
  poster.alt = 'Placeholder preview image';
  poster.decoding = 'async';
  const messageTitle = tag('h2', 'text-base font-semibold text-neutral-100');
  const messageBody = tag('p', 'text-sm text-neutral-400');
  const retry = tag(
    'button',
    'pointer-events-auto rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400',
    'Retry'
  );
  retry.type = 'button';
  const onRetry = (): void => options.onRetry?.();
  retry.addEventListener('click', onRetry);

  const messagePanel = tag(
    'div',
    'pointer-events-auto absolute inset-0 flex items-center justify-center bg-neutral-950/70 p-4'
  );
  const messageCard = tag('div', `${PANEL} flex max-w-md flex-col items-center gap-4 text-center`);
  messageCard.append(poster, messageTitle, messageBody, retry);
  messagePanel.append(messageCard);

  root.append(loadingPanel, messagePanel);
  options.container.append(root);

  function show(visible: boolean): void {
    root.style.display = visible ? 'flex' : 'none';
    root.dataset.state = state;
  }

  function setIndeterminate(): void {
    bar.className = 'h-1.5 w-1/3 rounded-full bg-sky-400 animate-status-sweep';
    bar.style.width = '';
    track.removeAttribute('aria-valuenow');
    track.setAttribute('aria-valuetext', 'Loading');
  }

  function setDeterminate(ratio: number): void {
    bar.className = 'h-1.5 rounded-full bg-sky-400 transition-[width] duration-200';
    bar.style.width = `${Math.round(ratio * 100)}%`;
    track.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
    track.removeAttribute('aria-valuetext');
  }

  function showLoading(): void {
    state = 'loading';
    lastPercent = -1;
    loadingPanel.style.display = 'flex';
    messagePanel.style.display = 'none';
    loadingTitle.textContent = 'Loading model…';
    percent.textContent = '0%';
    setIndeterminate();
    show(true);
  }

  function setProgress(progress: LoadProgress): void {
    if (state !== 'loading') return;

    const { ratio, loaded } = progress;

    if (ratio === null) {
      setIndeterminate();
      percent.textContent = formatBytes(loaded);
      return;
    }

    const pct = Math.round(ratio * 100);
    // Chunked reads fire far more often than the bar can visibly move.
    if (pct === lastPercent) return;
    lastPercent = pct;
    setDeterminate(ratio);
    loadingTitle.textContent = 'Loading model…';
    percent.textContent = `${pct}%`;
  }

  function showReady(): void {
    state = 'ready';
    show(false);
  }

  function showMessage(kind: 'error' | 'unsupported', title: string, message: string, canRetry: boolean): void {
    state = kind;
    loadingPanel.style.display = 'none';
    messagePanel.style.display = 'flex';
    messageTitle.textContent = title;
    messageBody.textContent = message;
    retry.style.display = canRetry ? '' : 'none';
    root.setAttribute('aria-live', kind === 'error' ? 'assertive' : 'polite');
    show(true);
  }

  return {
    get state(): StatusState {
      return state;
    },
    showLoading,
    setProgress,
    showReady,
    showError(message: string): void {
      showMessage('error', 'Couldn’t load the 3D model', message, true);
    },
    showUnsupported(message: string): void {
      showMessage('unsupported', '3D preview unavailable', message, false);
    },
    dispose(): void {
      retry.removeEventListener('click', onRetry);
      root.remove();
      state = 'idle';
    }
  };
}
