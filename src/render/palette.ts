/** Canvas colours, read from CSS custom properties so the canvas follows the theme. */
export interface Palette {
  board: string;
  hexLine: string;
  hexFill: string;
  number: string;
  pegLight: string;
  peg: string;
  pegDark: string;
  ballLight: string;
  ball: string;
  ballDark: string;
  trail: string;
  binLine: string;
  curve: string;
  binomial: string;
  bar: string;
  grid: string;
  text: string;
  muted: string;
}

const KEYS: Record<keyof Palette, string> = {
  board: '--board',
  hexLine: '--hex-line',
  hexFill: '--hex-fill',
  number: '--hex-number',
  pegLight: '--peg-light',
  peg: '--peg',
  pegDark: '--peg-dark',
  ballLight: '--ball-light',
  ball: '--ball',
  ballDark: '--ball-dark',
  trail: '--ball-trail',
  binLine: '--bin-line',
  curve: '--curve',
  binomial: '--curve-binomial',
  bar: '--bar',
  grid: '--grid',
  text: '--text',
  muted: '--text-muted',
};

export function readPalette(el: Element = document.documentElement): Palette {
  const style = getComputedStyle(el);
  const out = {} as Palette;
  for (const key of Object.keys(KEYS) as (keyof Palette)[]) {
    out[key] = style.getPropertyValue(KEYS[key]).trim() || '#888';
  }
  return out;
}
