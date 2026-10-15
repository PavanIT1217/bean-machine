import { DEFAULT_SETTINGS, MAX_ROWS, MIN_ROWS, type Settings } from './core/config';
import { mulberry32 } from './core/rng';
import { World } from './physics/world';
import { BoardRenderer } from './render/boardRenderer';
import { HistogramRenderer } from './render/histogramRenderer';
import { readPalette } from './render/palette';
import { binomialDistribution, sampleBinomialCounts } from './stats/binomial';
import { Controls, type PlayState } from './ui/controls';
import { byId } from './ui/dom';
import { StatsPanel } from './ui/statsPanel';
import { initTabs } from './ui/tabs';
import { initTheme } from './ui/theme';

const UI_INTERVAL = 1 / 10; // stats/histogram refresh, seconds
const MAX_FRAME = 1 / 20;
/** If smoothed frame time stays above this, render at a lower pixel ratio. */
const SLOW_FRAME = 1 / 50;
const MIN_PIXEL_RATIO = 1;

/** Wires physics, rendering and UI together and owns the animation loop. */
export class App {
  private readonly settings: Settings = { ...DEFAULT_SETTINGS };
  private readonly rng = mulberry32((Math.random() * 2 ** 32) >>> 0);
  private readonly world: World;
  private readonly board: BoardRenderer;
  private readonly histogram: HistogramRenderer;
  private readonly controls: Controls;
  private readonly stats = new StatsPanel();
  private pmf = new Float64Array(MAX_ROWS + 1);
  private fastScratch = new Float64Array(MAX_ROWS + 1);
  private cdfScratch = new Float64Array(MAX_ROWS + 1);

  private running = false;
  /** True once the user (or autoplay) has started a run since the last reset. */
  private started = false;
  /** Total balls the current run should drop through the board. */
  private target = this.settings.ballCount;
  private spawnAcc = 0;
  private lastTime = 0;
  private uiAcc = UI_INTERVAL;
  private uiTallyVersion = -1;
  private frameEma = 1 / 60;
  private slowFrames = 0;

  constructor() {
    const boardCanvas = byId<HTMLCanvasElement>('board');
    const histCanvas = byId<HTMLCanvasElement>('histogram');
    const palette = readPalette();
    this.board = new BoardRenderer(boardCanvas, palette);
    this.histogram = new HistogramRenderer(histCanvas, palette);
    this.applyUrlParams();
    this.world = new World({
      rows: this.settings.rows,
      bias: this.settings.bias,
      restitution: this.settings.bounciness,
      gravity: this.settings.gravity,
      binHeight: 8,
      rng: this.rng,
    });
    this.updatePmf();

    this.controls = new Controls(this.settings, {
      onSetting: (key, value, live) => this.onSetting(key, value, live),
      onPlayPause: () => this.togglePlay(),
      onReset: () => this.reset(),
      onFastDrop: (count) => this.fastDrop(count),
      onToggleNumbers: (show) => this.board.setOptions({ showNumbers: show }),
      onToggleCurve: (show) => this.board.setOptions({ showCurve: show }),
    });

    initTabs(() => {
      // The board panel may have been hidden; re-measure once it is visible again.
      requestAnimationFrame(() => this.resizeBoard(byId('board-wrap')));
      this.uiTallyVersion = -1;
    });

    initTheme(() => {
      const p = readPalette();
      this.board.setPalette(p);
      this.histogram.setPalette(p);
      this.uiTallyVersion = -1;
    });

    const boardWrap = byId('board-wrap');
    new ResizeObserver(() => this.resizeBoard(boardWrap)).observe(boardWrap);
    new ResizeObserver(() => {
      this.histogram.resize(histCanvas.clientWidth, histCanvas.clientHeight);
      this.uiTallyVersion = -1;
    }).observe(histCanvas);
    this.resizeBoard(boardWrap);

    // Tap/click the board to start or pause; keyboard shortcuts for desktop.
    boardCanvas.addEventListener('click', () => this.togglePlay());
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        this.togglePlay();
      } else if (e.key === 'r') this.reset();
    });
    document.addEventListener('visibilitychange', () => {
      this.lastTime = 0;
    });
  }

  start(autoplay = false): void {
    this.running = autoplay;
    this.started = autoplay;
    this.syncPlayButton();
    requestAnimationFrame(this.frame);
  }

  /** Allows sharing/deep-linking a configuration, e.g. ?rows=20&bias=0.6. */
  private applyUrlParams(): void {
    const params = new URLSearchParams(location.search);
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    const num = (k: string) => (params.has(k) ? Number(params.get(k)) : NaN);
    const rows = num('rows');
    if (Number.isFinite(rows)) this.settings.rows = clamp(Math.round(rows), MIN_ROWS, MAX_ROWS);
    const bias = num('bias');
    if (Number.isFinite(bias)) this.settings.bias = clamp(bias, 0.3, 0.7);
    const balls = num('balls');
    if (Number.isFinite(balls)) this.settings.ballCount = clamp(Math.round(balls), 10, 10000);
    this.target = this.settings.ballCount;
  }

  private resizeBoard(wrap: HTMLElement): void {
    if (wrap.clientWidth === 0 || wrap.clientHeight === 0) return; // hidden tab
    const layout = this.board.resize(wrap.clientWidth, wrap.clientHeight, this.settings.rows);
    this.world.configure(this.settings.rows, layout.binHeight);
  }

  private onSetting(key: keyof Settings, value: number, live: boolean): void {
    // Row count changes the geometry, so it is only applied when the slider is released.
    if (key === 'rows' && live) return;
    this.settings[key] = value;
    switch (key) {
      case 'rows':
        this.reset();
        break;
      case 'bias':
        this.world.bias = value;
        this.updatePmf();
        if (!live) this.reset();
        break;
      case 'bounciness':
        this.world.restitution = value;
        break;
      case 'gravity':
        this.world.gravityScale = value;
        break;
      case 'ballCount':
        this.target = Math.max(this.world.spawned, value);
        break;
      case 'dropRate':
      case 'speed':
        break;
    }
    this.syncPlayButton();
  }

  private updatePmf(): void {
    binomialDistribution(this.settings.rows, this.settings.bias, this.pmf);
  }

  private reset(): void {
    this.world.bias = this.settings.bias;
    this.updatePmf();
    this.resizeBoard(byId('board-wrap'));
    this.world.reset();
    this.board.invalidate();
    this.target = this.settings.ballCount;
    this.spawnAcc = 0;
    this.uiTallyVersion = -1;
    this.running = false;
    this.started = false;
    this.syncPlayButton();
  }

  private togglePlay(): void {
    if (this.runComplete()) {
      this.target = this.world.spawned + this.settings.ballCount;
      this.running = true;
    } else {
      this.running = !this.running;
    }
    this.started = true;
    this.syncPlayButton();
  }

  private runComplete(): boolean {
    return this.world.spawned >= this.target && this.world.inFlight === 0;
  }

  private syncPlayButton(): void {
    let state: PlayState;
    if (this.running) state = 'pause';
    else if (this.started && this.runComplete()) state = 'again';
    else if (this.world.spawned > 0) state = 'resume';
    else state = 'start';
    this.controls.setPlayState(state);
  }

  /** Statistical drop: sample outcomes directly from Binomial(n, p) — instant even for 1M balls. */
  private fastDrop(count: number): void {
    const n = this.settings.rows;
    this.fastScratch.fill(0);
    sampleBinomialCounts(n, this.settings.bias, count, this.rng, this.fastScratch, this.cdfScratch);
    this.world.tally.addCounts(this.fastScratch.subarray(0, n + 1));
    this.world.pile.fit(this.world.tally.maxCount());
    this.uiTallyVersion = -1;
  }

  /**
   * Adaptive resolution: when frames are consistently slow (busy board on a weak phone),
   * step the canvas pixel ratio down so the simulation stays smooth.
   */
  private governQuality(dt: number): void {
    this.frameEma += (dt - this.frameEma) * 0.05;
    if (this.frameEma > SLOW_FRAME && this.board.maxPixelRatio > MIN_PIXEL_RATIO) {
      if (++this.slowFrames > 120) {
        this.board.maxPixelRatio = Math.max(MIN_PIXEL_RATIO, this.board.maxPixelRatio - 0.5);
        this.resizeBoard(byId('board-wrap'));
        this.slowFrames = 0;
        this.frameEma = 1 / 60;
      }
    } else {
      this.slowFrames = 0;
    }
  }

  private readonly frame = (now: number): void => {
    const t = now / 1000;
    const frameDt = this.lastTime ? Math.min(t - this.lastTime, MAX_FRAME) : 0;
    this.lastTime = t;
    if (frameDt > 0) this.governQuality(frameDt);
    const dt = frameDt * this.settings.speed;

    if (this.running) {
      this.spawnAcc += dt * this.settings.dropRate;
      while (this.spawnAcc >= 1 && this.world.spawned < this.target) {
        if (!this.world.spawn()) break;
        this.spawnAcc -= 1;
      }
      if (this.world.spawned >= this.target) this.spawnAcc = 0;
      this.world.step(dt);
      if (this.runComplete()) {
        this.running = false;
        this.syncPlayButton();
      }
    }

    this.board.draw(this.world, this.settings.bias);

    this.uiAcc += frameDt;
    if (this.uiAcc >= UI_INTERVAL || this.uiTallyVersion === -1) {
      this.uiAcc = 0;
      const tally = this.world.tally;
      this.stats.update(tally, this.pmf, this.settings.rows, this.settings.bias, this.world.inFlight, this.world.pile.ballsPerDot);
      if (tally.version !== this.uiTallyVersion) {
        this.histogram.draw(tally, this.pmf, this.settings.rows, this.settings.bias);
        this.uiTallyVersion = tally.version;
      }
    }
    requestAnimationFrame(this.frame);
  };
}
