import { describe, expect, it } from 'vitest';
import { placerPanneauTooltip } from './InfoTooltip';

describe('placerPanneauTooltip', () => {
  const panel = { width: 280, height: 120 };
  const viewport = { width: 1280, height: 800 };

  it('place le panneau sous le déclencheur quand il y a de la place', () => {
    expect(
      placerPanneauTooltip(
        { left: 100, right: 118, top: 40, bottom: 58, width: 18, height: 18, x: 100, y: 40, toJSON() {} },
        panel,
        viewport,
      ),
    ).toEqual({ top: 64, left: 100 });
  });

  it('aligne à droite si le bouton est collé au bord du ticket POS', () => {
    const pos = placerPanneauTooltip(
      { left: 1156, right: 1174, top: 68, bottom: 86, width: 18, height: 18, x: 1156, y: 68, toJSON() {} },
      panel,
      viewport,
    );
    expect(pos.left + panel.width).toBeLessThanOrEqual(1272);
    expect(pos.left).toBeGreaterThanOrEqual(8);
  });

  it('remonte le panneau s’il dépasse le bas de l’écran', () => {
    const pos = placerPanneauTooltip(
      { left: 200, right: 218, top: 720, bottom: 738, width: 18, height: 18, x: 200, y: 720, toJSON() {} },
      panel,
      viewport,
    );
    expect(pos.top).toBe(720 - 120 - 6);
  });
});
