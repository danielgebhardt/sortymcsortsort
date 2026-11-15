import Phaser from 'phaser';
import { chapterFor, SHIPPED_LEVELS } from '../levels';
import { progress } from '../storage/progress';
import { COLORS, shade } from '../theme';
import { button, label } from '../ui/button';
import * as draw from '../ui/draw';
import { layout } from '../ui/layout';

const COLS = 5;
const ROWS = 6;
const PER_PAGE = COLS * ROWS;

export class LevelSelectScene extends Phaser.Scene {
  private page = 0;

  constructor() {
    super('Levels');
  }

  init(data: { page?: number }) {
    this.page = data.page ?? Math.floor((progress().unlocked - 1) / PER_PAGE);
  }

  create() {
    const { W, H, u, safe } = layout(this);
    this.cameras.main.setBackgroundColor(COLORS.bg);
    const p = progress();
    const pages = Math.ceil(Math.max(SHIPPED_LEVELS, p.unlocked) / PER_PAGE);
    this.page = Phaser.Math.Clamp(this.page, 0, pages - 1);

    const top = safe.top + u * 9;
    button(this, {
      x: safe.left + u * 9, y: top, w: u * 12, h: u * 11, color: COLORS.secondary,
      icon: (g, s) => draw.backIcon(g, 0, -s * 0.04, s * 0.7, 0xffffff),
      onClick: () => this.scene.start('Menu'),
    });
    const first0 = this.page * PER_PAGE + 1;
    label(this, W / 2, top - u * 2.5, chapterFor(first0).chapter.name, u * 6.5);
    label(this, W / 2, top + u * 4, `Chapter ${this.page + 1}`, u * 3.6, COLORS.sub, false);

    const cell = Math.min(u * 18, (H - top - safe.bottom - u * 40) / ROWS);
    const gx = W / 2 - ((COLS - 1) * cell) / 2;
    const gy = top + u * 17 + cell / 2;
    const first = this.page * PER_PAGE + 1;
    for (let i = 0; i < PER_PAGE; i++) {
      const n = first + i;
      const x = gx + (i % COLS) * cell;
      const y = gy + Math.floor(i / COLS) * cell;
      const open = n <= p.unlocked;
      const stars = p.stars[n] ?? 0;
      const current = n === p.unlocked;
      const color = !open ? COLORS.secondary : current ? COLORS.primary : stars > 0 ? 0x6b5bd6 : COLORS.secondary;
      button(this, {
        x, y: y - u * 1, w: cell * 0.82, h: cell * 0.72, color: open ? color : shade(COLORS.secondary, -0.25),
        label: open ? `${n}` : undefined, fontSize: cell * 0.3,
        icon: open ? undefined : (g, s) => draw.padlock(g, 0, -s * 0.03, s * 0.45, 0x7d83b8),
        disabled: !open,
        onClick: () => this.scene.start('Play', { level: n }),
      });
      if (stars > 0) {
        const sg = this.add.graphics();
        for (let s = 0; s < 3; s++) draw.star(sg, x + (s - 1) * cell * 0.2, y + cell * 0.32, cell * 0.18, s < stars ? COLORS.gold : COLORS.heartEmpty);
      }
    }

    const by = H - safe.bottom - u * 13;
    button(this, {
      x: W / 2 - u * 30, y: by, w: u * 16, h: u * 13, color: COLORS.secondary, disabled: this.page === 0,
      icon: (g, s) => draw.chevron(g, 0, -s * 0.04, s * 0.5, 'left', this.page === 0 ? 0x7d83b8 : 0xffffff),
      onClick: () => this.scene.restart({ page: this.page - 1 }),
    });
    button(this, {
      x: W / 2 + u * 30, y: by, w: u * 16, h: u * 13, color: COLORS.secondary, disabled: this.page >= pages - 1,
      icon: (g, s) => draw.chevron(g, 0, -s * 0.04, s * 0.5, 'right', this.page >= pages - 1 ? 0x7d83b8 : 0xffffff),
      onClick: () => this.scene.restart({ page: this.page + 1 }),
    });
    label(this, W / 2, by - u * 1, `${first}–${first + PER_PAGE - 1}`, u * 5, COLORS.sub);

    // Swipe left/right to change page.
    let sx = 0;
    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => (sx = ptr.x));
    this.input.on('pointerup', (ptr: Phaser.Input.Pointer) => {
      const dx = ptr.x - sx;
      if (Math.abs(dx) < u * 18) return;
      const next = this.page + (dx < 0 ? 1 : -1);
      if (next >= 0 && next < pages) this.scene.restart({ page: next });
    });
  }
}
