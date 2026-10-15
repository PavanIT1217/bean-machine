import { BALL_STEPS, type Settings } from '../core/config';
import { byId } from './dom';

type SliderKey = 'rows' | 'dropRate' | 'bounciness' | 'bias' | 'gravity';

const FORMAT: Record<SliderKey, (v: number) => string> = {
  rows: (v) => String(v),
  dropRate: (v) => `${v} balls/s`,
  bounciness: (v) => v.toFixed(2),
  bias: (v) => `${Math.round(v * 100)}% right`,
  gravity: (v) => `${v.toFixed(1)}×`,
};

export type PlayState = 'start' | 'pause' | 'resume' | 'again';

const PLAY_UI: Record<PlayState, { label: string; icon: string }> = {
  start: { label: 'Start simulation', icon: '#i-play' },
  pause: { label: 'Pause', icon: '#i-pause' },
  resume: { label: 'Resume', icon: '#i-play' },
  again: { label: 'Drop again', icon: '#i-play' },
};

export interface ControlHandlers {
  /** Fires continuously while dragging (`live`) and once on release (`!live`). */
  onSetting(key: keyof Settings, value: number, live: boolean): void;
  onPlayPause(): void;
  onReset(): void;
  onFastDrop(count: number): void;
  onToggleNumbers(show: boolean): void;
  onToggleCurve(show: boolean): void;
}

/** Binds the static control markup in index.html to typed callbacks. */
export class Controls {
  private readonly playBtn = byId<HTMLButtonElement>('btn-play');
  private readonly playLabel = byId<HTMLSpanElement>('play-label');
  private readonly playIcon = document.getElementById('play-icon') as unknown as SVGUseElement;
  private readonly ballsValue = byId<HTMLOutputElement>('balls-value');
  private readonly ballsDec = byId<HTMLButtonElement>('balls-dec');
  private readonly ballsInc = byId<HTMLButtonElement>('balls-inc');
  private ballIndex: number;

  constructor(settings: Settings, handlers: ControlHandlers) {
    // Sliders in the settings sheet.
    document.querySelectorAll<HTMLInputElement>('input[data-setting]').forEach((input) => {
      const key = input.dataset.setting as SliderKey;
      const out = document.querySelector<HTMLOutputElement>(`output[for="${input.id}"]`);
      const show = (v: number) => out && (out.value = FORMAT[key](v));
      input.value = String(settings[key]);
      show(settings[key]);
      input.addEventListener('input', () => {
        show(Number(input.value));
        handlers.onSetting(key, Number(input.value), true);
      });
      input.addEventListener('change', () => handlers.onSetting(key, Number(input.value), false));
    });

    // Ball-count stepper.
    this.ballIndex = nearestStep(settings.ballCount);
    const step = (d: number) => {
      this.ballIndex = Math.max(0, Math.min(BALL_STEPS.length - 1, this.ballIndex + d));
      this.renderBalls();
      handlers.onSetting('ballCount', BALL_STEPS[this.ballIndex], false);
    };
    this.ballsDec.addEventListener('click', () => step(-1));
    this.ballsInc.addEventListener('click', () => step(1));
    this.renderBalls();

    // Speed segmented control.
    document.querySelectorAll<HTMLInputElement>('input[name="speed"]').forEach((r) => {
      r.checked = Number(r.value) === settings.speed;
      r.addEventListener('change', () => r.checked && handlers.onSetting('speed', Number(r.value), false));
    });

    const numbers = byId<HTMLInputElement>('toggle-numbers');
    numbers.addEventListener('change', () => handlers.onToggleNumbers(numbers.checked));
    const curve = byId<HTMLInputElement>('toggle-curve');
    curve.addEventListener('change', () => handlers.onToggleCurve(curve.checked));

    this.playBtn.addEventListener('click', () => handlers.onPlayPause());
    byId<HTMLButtonElement>('btn-reset').addEventListener('click', () => handlers.onReset());
    document.querySelectorAll<HTMLButtonElement>('[data-fast]').forEach((b) =>
      b.addEventListener('click', () => handlers.onFastDrop(Number(b.dataset.fast))),
    );

    // Settings sheet.
    const dialog = byId<HTMLDialogElement>('settings');
    byId<HTMLButtonElement>('btn-settings').addEventListener('click', () => dialog.showModal());
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close(); // tap on the backdrop
    });
  }

  setPlayState(state: PlayState): void {
    if (this.playBtn.dataset.state === state) return;
    this.playBtn.dataset.state = state;
    this.playLabel.textContent = PLAY_UI[state].label;
    this.playIcon.setAttribute('href', PLAY_UI[state].icon);
  }

  private renderBalls(): void {
    this.ballsValue.value = BALL_STEPS[this.ballIndex].toLocaleString();
    this.ballsDec.disabled = this.ballIndex === 0;
    this.ballsInc.disabled = this.ballIndex === BALL_STEPS.length - 1;
  }
}

function nearestStep(v: number): number {
  let best = 0;
  BALL_STEPS.forEach((s, i) => {
    if (Math.abs(s - v) < Math.abs(BALL_STEPS[best] - v)) best = i;
  });
  return best;
}
