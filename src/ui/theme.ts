export type ThemeMode = 'system' | 'light' | 'dark';
const STORAGE_KEY = 'galton:theme';

function load(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* storage unavailable */
  }
  return 'system';
}

/** Auto / light / dark theme, driven by the radio group in the settings sheet. */
export function initTheme(onChange: () => void): void {
  let mode = load();
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const radios = document.querySelectorAll<HTMLInputElement>('input[name="theme"]');
  const apply = () => {
    if (mode === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = mode;
    const dark = mode === 'dark' || (mode === 'system' && media.matches);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#14120e' : '#fbf8f1');
    radios.forEach((r) => (r.checked = r.value === mode));
    onChange();
  };
  radios.forEach((r) =>
    r.addEventListener('change', () => {
      if (!r.checked) return;
      mode = r.value as ThemeMode;
      try {
        localStorage.setItem(STORAGE_KEY, mode);
      } catch {
        /* ignore */
      }
      apply();
    }),
  );
  media.addEventListener('change', () => mode === 'system' && apply());
  apply();
}
