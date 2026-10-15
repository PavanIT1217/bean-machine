import { byId } from './dom';

/** Accessible two-tab switcher (Simulate / Learn) with arrow-key support. */
export function initTabs(onChange: (tab: 'simulate' | 'learn') => void): void {
  const tabs = [byId<HTMLButtonElement>('tab-simulate'), byId<HTMLButtonElement>('tab-learn')];
  const select = (idx: number, focus = false) => {
    tabs.forEach((t, i) => {
      const on = i === idx;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      byId(t.getAttribute('aria-controls')!).hidden = !on;
    });
    if (focus) tabs[idx].focus();
    onChange(idx === 0 ? 'simulate' : 'learn');
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(i));
    t.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        select((i + 1) % tabs.length, true);
      }
    });
  });
}
