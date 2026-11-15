import Phaser from 'phaser';
import { haptics } from '../audio/haptics';
import { sfx } from '../audio/sfx';
import { Board, headOf } from '../core/board';
import { Block, DELTA, Level, isHorizontal } from '../core/types';
import { FIRST_LOCK_LEVEL, FIRST_WALL_LEVEL, getLevel } from '../levels';
import { completeLevel } from '../storage/progress';
import { COLORS, DIR_COLORS, LOCK_COLORS, mix, shade } from '../theme';
import { button, label } from '../ui/button';
import * as draw from '../ui/draw';
import { layout, Layout } from '../ui/layout';

const MAX_HEARTS = 3;

interface BlockView {
  block: Block;
  c: Phaser.GameObjects.Container;
  g: Phaser.GameObjects.Graphics;
  w: number;
  h: number;
}

const TIPS: Record<number, string> = {
  1: 'Tap a block to slide it out\nthe way its arrow points.',
  2: 'Something in the way? The block\nbounces back and you lose a heart.',
  3: 'Find the right order to clear the board!',
};

export class PlayScene extends Phaser.Scene {
  private n = 1;
  private level!: Level;
  private board!: Board;
  private views = new Map<number, BlockView>();
  private busy = new Set<number>();
  private hearts = MAX_HEARTS;
  private mistakes = 0;
  private ended = false;
  private L!: Layout;
  private cs = 0;
  private ox = 0;
  private oy = 0;
  private heartsG!: Phaser.GameObjects.Graphics;
  private lockColor = new Map<number, number>();
  private keyColor = new Map<number, number>();
  private hintG?: Phaser.GameObjects.Graphics;

  constructor() {
    super('Play');
  }

  init(data: { level?: number }) {
    this.n = data.level ?? 1;
    this.views.clear();
    this.busy.clear();
    this.lockColor.clear();
    this.keyColor.clear();
    this.hearts = MAX_HEARTS;
    this.mistakes = 0;
    this.ended = false;
    this.hintG = undefined;
  }

  create() {
    this.L = layout(this);
    const { W, H, u, safe } = this.L;
    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.cameras.main.fadeIn(180, 27, 31, 59);

    this.level = getLevel(this.n);
    this.board = new Board(this.level);

    // ---- HUD ---------------------------------------------------------------------------
    const top = safe.top + u * 9;
    button(this, {
      x: safe.left + u * 9, y: top, w: u * 12, h: u * 11, color: COLORS.secondary,
      icon: (g, s) => draw.backIcon(g, 0, -s * 0.04, s * 0.7, 0xffffff),
      onClick: () => this.scene.start('Levels'),
    });
    label(this, W / 2, top - u * 1.5, `Level ${this.n}`, u * 6.5);
    this.heartsG = this.add.graphics();
    this.drawHearts();

    const tip = TIPS[this.n] ?? (this.n === FIRST_WALL_LEVEL ? 'Stone walls never move —\nplan around them.' : this.n === FIRST_LOCK_LEVEL ? 'Locked blocks open once their\nmatching key block slides out.' : '');

    const bottom = H - safe.bottom - u * 11;
    button(this, {
      x: W / 2 - u * 14, y: bottom, w: u * 22, h: u * 13, color: COLORS.secondary,
      icon: (g, s) => draw.restartIcon(g, 0, -s * 0.04, s * 0.75, 0xffffff),
      onClick: () => this.scene.restart({ level: this.n }),
    });
    button(this, {
      x: W / 2 + u * 14, y: bottom, w: u * 22, h: u * 13, color: 0xe0a526,
      icon: (g, s) => draw.bulbIcon(g, 0, -s * 0.04, s * 0.75, 0xffffff),
      onClick: () => this.hint(),
    });

    // ---- board area --------------------------------------------------------------------
    const areaTop = top + u * 9 + (tip ? u * 15 : u * 2);
    const areaBottom = bottom - u * 11;
    const areaW = W - safe.left - safe.right - u * 8;
    const areaH = areaBottom - areaTop;
    this.cs = Math.floor(Math.min(areaW / this.level.w, areaH / this.level.h, u * 22));
    const bw = this.cs * this.level.w;
    const bh = this.cs * this.level.h;
    this.ox = Math.round((W - bw) / 2);
    this.oy = Math.round(areaTop + (areaH - bh) / 2);

    if (tip) {
      const t = label(this, W / 2, areaTop - u * 8, tip, u * 4.4, COLORS.sub, false);
      t.setLineSpacing(u * 0.8);
      this.tweens.add({ targets: t, alpha: { from: 0, to: 1 }, y: { from: t.y + u * 2, to: t.y }, duration: 400, delay: 200 });
    }

    this.drawBoard();
    this.assignLockColors();
    for (const b of this.level.blocks) this.makeBlock(this.board.blocks.get(b.id)!);

    // Blocks drop in for a little life.
    let i = 0;
    for (const v of this.views.values()) {
      v.c.setScale(0.6).setAlpha(0);
      this.tweens.add({ targets: v.c, scale: 1, alpha: 1, duration: 260, delay: 40 + (i++ % 40) * 12, ease: 'Back.easeOut' });
    }

    this.makeDotTexture();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onTap(p));
  }

  // ---- drawing ---------------------------------------------------------------------------

  private drawBoard() {
    const { cs, ox, oy } = this;
    const { w, h } = this.level;
    const g = this.add.graphics();
    const pad = cs * 0.18;
    g.fillStyle(shade(COLORS.board, -0.3), 1);
    g.fillRoundedRect(ox - pad, oy - pad + cs * 0.08, w * cs + pad * 2, h * cs + pad * 2, cs * 0.35);
    g.fillStyle(COLORS.board, 1);
    g.fillRoundedRect(ox - pad, oy - pad, w * cs + pad * 2, h * cs + pad * 2, cs * 0.35);
    g.fillStyle(COLORS.gridDot, 1);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g.fillCircle(ox + (x + 0.5) * cs, oy + (y + 0.5) * cs, cs * 0.06);
    for (const [x, y] of this.level.walls) {
      const p = cs * 0.05;
      g.fillStyle(shade(COLORS.wall, -0.35), 1);
      g.fillRoundedRect(ox + x * cs + p, oy + y * cs + p + cs * 0.06, cs - p * 2, cs - p * 2, cs * 0.14);
      g.fillStyle(COLORS.wall, 1);
      g.fillRoundedRect(ox + x * cs + p, oy + y * cs + p, cs - p * 2, cs - p * 2 - cs * 0.06, cs * 0.14);
      g.fillStyle(COLORS.wallTop, 1);
      g.fillRoundedRect(ox + x * cs + cs * 0.22, oy + y * cs + cs * 0.2, cs * 0.25, cs * 0.16, cs * 0.06);
      g.fillRoundedRect(ox + x * cs + cs * 0.5, oy + y * cs + cs * 0.52, cs * 0.28, cs * 0.16, cs * 0.06);
    }
  }

  private assignLockColors() {
    let k = 0;
    for (const b of this.level.blocks) {
      if (b.lockedBy === undefined) continue;
      const color = LOCK_COLORS[k++ % LOCK_COLORS.length];
      this.lockColor.set(b.id, color);
      this.keyColor.set(b.lockedBy, color);
    }
  }

  private makeBlock(b: Block) {
    const { cs, ox, oy } = this;
    const horiz = isHorizontal(b.dir);
    const w = horiz ? b.len * cs : cs;
    const h = horiz ? cs : b.len * cs;
    const c = this.add.container(ox + b.x * cs + w / 2, oy + b.y * cs + h / 2);
    const g = this.add.graphics();
    c.add(g);
    const v: BlockView = { block: b, c, g, w, h };
    this.views.set(b.id, v);
    this.paintBlock(v);
  }

  private paintBlock(v: BlockView) {
    const { cs } = this;
    const { block: b, g, w, h } = v;
    g.clear();
    const locked = this.board.isLocked(b);
    const pad = cs * 0.07;
    const lip = cs * 0.08;
    const r = cs * 0.22;
    const base = locked ? mix(DIR_COLORS[b.dir], 0x5a5f8c, 0.7) : DIR_COLORS[b.dir];
    const x0 = -w / 2 + pad, y0 = -h / 2 + pad, bw = w - pad * 2, bh = h - pad * 2;
    g.fillStyle(shade(base, -0.38), 1);
    g.fillRoundedRect(x0, y0 + lip * 0.5, bw, bh, r);
    g.fillStyle(base, 1);
    g.fillRoundedRect(x0, y0 - lip * 0.5, bw, bh - lip * 0.5, r);
    g.fillStyle(0xffffff, 0.16);
    g.fillRoundedRect(x0 + cs * 0.08, y0 - lip * 0.5 + cs * 0.06, bw - cs * 0.16, Math.min(bh, cs) * 0.22, r * 0.6);

    const horiz = isHorizontal(b.dir);
    for (let i = 0; i < b.len; i++) {
      const cx = horiz ? -w / 2 + cs * (i + 0.5) : 0;
      const cy = (horiz ? 0 : -h / 2 + cs * (i + 0.5)) - lip * 0.4;
      draw.chevron(g, cx, cy, cs * (b.len === 1 ? 0.5 : 0.42), b.dir, 0xffffff, locked ? 0.3 : 0.95);
    }

    const lockC = this.lockColor.get(b.id);
    if (locked && lockC !== undefined) {
      g.lineStyle(cs * 0.06, lockC, 1);
      g.strokeRoundedRect(x0, y0 - lip * 0.5, bw, bh - lip * 0.5, r);
      g.fillStyle(0x1b1f3b, 0.85);
      g.fillCircle(0, -lip * 0.4, cs * 0.3);
      draw.padlock(g, 0, -lip * 0.4, cs * 0.46, lockC);
    }
    const keyC = this.keyColor.get(b.id);
    if (keyC !== undefined) {
      const kx = w / 2 - pad - cs * 0.2, ky = -h / 2 + pad + cs * 0.14;
      g.fillStyle(0x1b1f3b, 0.9);
      g.fillCircle(kx, ky, cs * 0.2);
      g.lineStyle(cs * 0.04, keyC, 1);
      g.strokeCircle(kx, ky, cs * 0.2);
      draw.key(g, kx, ky, cs * 0.3, keyC);
    }
  }

  private drawHearts() {
    const { W, u, safe } = this.L;
    const g = this.heartsG;
    g.clear();
    const y = safe.top + u * 9;
    for (let i = 0; i < MAX_HEARTS; i++) {
      const x = W - safe.right - u * 7 - (MAX_HEARTS - 1 - i) * u * 8;
      draw.heart(g, x, y, u * 7, i < this.hearts ? COLORS.heart : COLORS.heartEmpty);
    }
  }

  private makeDotTexture() {
    if (this.textures.exists('dot')) return;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(8, 8, 8);
    g.generateTexture('dot', 16, 16);
    g.destroy();
  }

  private puff(x: number, y: number, color: number, count = 10) {
    const e = this.add.particles(x, y, 'dot', {
      speed: { min: this.cs * 0.8, max: this.cs * 2.6 },
      lifespan: 420,
      scale: { start: this.cs / 50, end: 0 },
      tint: [color, 0xffffff],
      emitting: false,
    });
    e.explode(count);
    this.time.delayedCall(600, () => e.destroy());
  }

  // ---- input & rules ---------------------------------------------------------------------

  private cellAt(p: Phaser.Input.Pointer): [number, number] | null {
    const x = Math.floor((p.x - this.ox) / this.cs);
    const y = Math.floor((p.y - this.oy) / this.cs);
    return this.board.inBounds(x, y) ? [x, y] : null;
  }

  private onTap(p: Phaser.Input.Pointer) {
    if (this.ended) return;
    const cell = this.cellAt(p);
    if (!cell) return;
    const id = this.board.at(cell[0], cell[1]);
    if (id === null || id === 'wall' || this.busy.has(id)) return;
    sfx.unlock();
    this.clearHint();
    const v = this.views.get(id)!;
    const res = this.board.tap(id);
    if (res.kind === 'exit') this.animateExit(v, res.distance);
    else if (res.kind === 'blocked') this.animateBump(v, res.distance, res.hitId);
    else if (res.kind === 'locked') this.animateLocked(v);
  }

  private animateExit(v: BlockView, distance: number) {
    const { cs } = this;
    const b = v.block;
    const { dx, dy } = DELTA[b.dir];
    const travel = (distance + b.len + 1.2) * cs;
    const dur = 160 + (distance + b.len) * 28;
    this.busy.add(b.id);
    sfx.whoosh();
    haptics.light();
    this.tweens.add({ targets: v.c, x: v.c.x + dx * travel, y: v.c.y + dy * travel, duration: dur, ease: 'Cubic.easeIn' });
    this.tweens.add({ targets: v.c, alpha: 0, scale: 0.85, duration: dur * 0.4, delay: dur * 0.6 });
    const [hx, hy] = headOf(b);
    const ex = this.ox + (hx + 0.5 + dx * (distance + 0.9)) * cs;
    const ey = this.oy + (hy + 0.5 + dy * (distance + 0.9)) * cs;
    this.time.delayedCall(dur * 0.55, () => this.puff(ex, ey, DIR_COLORS[b.dir], 8));
    this.time.delayedCall(dur, () => {
      v.c.destroy();
      this.views.delete(b.id);
      this.busy.delete(b.id);
      this.checkWin();
    });
    // Anything this block was the key for opens now.
    for (const other of this.views.values()) {
      if (other.block.lockedBy === b.id) this.time.delayedCall(dur * 0.5, () => this.animateUnlock(other));
    }
  }

  private animateUnlock(v: BlockView) {
    if (!v.c.active) return;
    sfx.unlockChime();
    const color = this.lockColor.get(v.block.id) ?? 0xffffff;
    this.puff(v.c.x, v.c.y, color, 14);
    this.paintBlock(v);
    this.tweens.add({ targets: v.c, scale: { from: 1.18, to: 1 }, duration: 300, ease: 'Back.easeOut' });
  }

  private animateBump(v: BlockView, distance: number, hitId: number | 'wall') {
    const { cs } = this;
    const b = v.block;
    const { dx, dy } = DELTA[b.dir];
    const fwd = distance * cs + cs * 0.16;
    const x0 = v.c.x, y0 = v.c.y;
    this.busy.add(b.id);
    this.hearts = Math.max(0, this.hearts - 1);
    this.mistakes++;
    const out = 70 + distance * 45;
    this.tweens.add({
      targets: v.c,
      x: x0 + dx * fwd,
      y: y0 + dy * fwd,
      duration: out,
      ease: 'Quad.easeIn',
      onComplete: () => {
        sfx.bump();
        haptics.heavy();
        this.cameras.main.shake(120, 0.004);
        if (hitId !== 'wall') {
          const hv = this.views.get(hitId);
          if (hv) this.tweens.add({ targets: hv.c, x: hv.c.x + dx * cs * 0.08, y: hv.c.y + dy * cs * 0.08, duration: 60, yoyo: true });
        }
        this.flashHeart();
        this.tweens.add({
          targets: v.c, x: x0, y: y0, duration: 160 + distance * 30, ease: 'Back.easeOut',
          onComplete: () => {
            this.busy.delete(b.id);
            if (this.hearts <= 0) this.lose();
          },
        });
      },
    });
  }

  private animateLocked(v: BlockView) {
    this.busy.add(v.block.id);
    sfx.locked();
    haptics.light();
    this.tweens.add({
      targets: v.c, angle: { from: -6, to: 6 }, duration: 50, yoyo: true, repeat: 2,
      onComplete: () => { v.c.angle = 0; this.busy.delete(v.block.id); },
    });
  }

  private flashHeart() {
    this.drawHearts();
    const { W, u, safe } = this.L;
    const x = W - safe.right - u * 7 - (MAX_HEARTS - 1 - this.hearts) * u * 8;
    const g = this.add.graphics({ x, y: safe.top + u * 9 });
    draw.heart(g, 0, 0, u * 7, COLORS.heart);
    this.tweens.add({ targets: g, scale: 2, alpha: 0, duration: 380, onComplete: () => g.destroy() });
  }

  private hint() {
    if (this.ended) return;
    this.clearHint();
    const free = this.board.freeBlocks().filter((b) => !this.busy.has(b.id));
    if (free.length === 0) return;
    // Prefer the free block that the most other blocks are stuck behind.
    const stuckBehind = (id: number) => [...this.board.blocks.values()].filter((o) => this.board.probe(o).hit === id).length;
    const best = free.reduce((a, b) => (stuckBehind(b.id) > stuckBehind(a.id) ? b : a));
    const v = this.views.get(best.id)!;
    const g = this.add.graphics({ x: v.c.x, y: v.c.y });
    g.lineStyle(this.cs * 0.09, 0xffffff, 1);
    g.strokeRoundedRect(-v.w / 2, -v.h / 2, v.w, v.h, this.cs * 0.26);
    this.hintG = g;
    this.tweens.add({ targets: g, alpha: { from: 1, to: 0.2 }, duration: 380, yoyo: true, repeat: 3, onComplete: () => this.clearHint() });
    this.tweens.add({ targets: v.c, scale: 1.08, duration: 180, yoyo: true, repeat: 1 });
  }

  private clearHint() {
    if (this.hintG) {
      this.tweens.killTweensOf(this.hintG);
      this.hintG.destroy();
      this.hintG = undefined;
    }
  }

  // ---- end of level ----------------------------------------------------------------------

  private checkWin() {
    if (this.ended || !this.board.cleared) return;
    this.ended = true;
    const stars = Math.max(1, 3 - this.mistakes);
    completeLevel(this.n, stars);
    sfx.win();
    haptics.success();
    this.time.delayedCall(250, () => this.showResult(true, stars));
  }

  private lose() {
    if (this.ended) return;
    this.ended = true;
    sfx.lose();
    haptics.error();
    for (const v of this.views.values()) this.tweens.add({ targets: v.c, alpha: 0.45, duration: 300 });
    this.time.delayedCall(350, () => this.showResult(false, 0));
  }

  private showResult(won: boolean, stars: number) {
    const { W, H, u } = this.L;
    const layer = this.add.container(0, 0).setDepth(100);
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x0d1030, 0.7).setInteractive();
    layer.add(dim);
    const pw = u * 82, ph = u * 78;
    const panel = this.add.container(W / 2, H / 2);
    layer.add(panel);
    const g = this.add.graphics();
    g.fillStyle(shade(COLORS.board, -0.3), 1);
    g.fillRoundedRect(-pw / 2, -ph / 2 + u * 1.5, pw, ph, u * 6);
    g.fillStyle(COLORS.board, 1);
    g.fillRoundedRect(-pw / 2, -ph / 2, pw, ph, u * 6);
    panel.add(g);
    panel.add(label(this, 0, -ph / 2 + u * 13, won ? 'Sorted!' : 'Out of hearts', u * 9));

    if (won) {
      for (let i = 0; i < 3; i++) {
        const sg = this.add.graphics({ x: (i - 1) * u * 20, y: -u * 8 - (i === 1 ? u * 3 : 0) });
        draw.star(sg, 0, 0, u * 17, COLORS.heartEmpty);
        panel.add(sg);
        if (i < stars) {
          const fg = this.add.graphics({ x: sg.x, y: sg.y });
          draw.star(fg, 0, 0, u * 17, COLORS.gold);
          fg.setScale(0);
          panel.add(fg);
          this.tweens.add({ targets: fg, scale: 1, duration: 320, delay: 250 + i * 220, ease: 'Back.easeOut', onStart: () => sfx.star(i) });
        }
      }
      panel.add(label(this, 0, u * 9, stars === 3 ? 'Perfect — no mistakes!' : `${this.mistakes} mistake${this.mistakes === 1 ? '' : 's'}`, u * 4.6, COLORS.sub, false));
      panel.add(button(this, { x: -u * 18, y: ph / 2 - u * 16, w: u * 30, h: u * 14, color: COLORS.secondary, label: 'Levels', fontSize: u * 5.5, onClick: () => this.scene.start('Levels') }));
      panel.add(button(this, { x: u * 18, y: ph / 2 - u * 16, w: u * 30, h: u * 14, color: COLORS.primary, label: 'Next', fontSize: u * 6, onClick: () => this.scene.restart({ level: this.n + 1 }) }));
    } else {
      const hg = this.add.graphics({ y: -u * 8 });
      draw.heart(hg, 0, 0, u * 22, COLORS.heartEmpty);
      panel.add(hg);
      panel.add(label(this, 0, u * 9, 'Bounced too many times. Try again!', u * 4.4, COLORS.sub, false));
      panel.add(button(this, { x: -u * 18, y: ph / 2 - u * 16, w: u * 30, h: u * 14, color: COLORS.secondary, label: 'Levels', fontSize: u * 5.5, onClick: () => this.scene.start('Levels') }));
      panel.add(button(this, { x: u * 18, y: ph / 2 - u * 16, w: u * 30, h: u * 14, color: COLORS.danger, label: 'Retry', fontSize: u * 6, onClick: () => this.scene.restart({ level: this.n }) }));
    }

    dim.setAlpha(0);
    this.tweens.add({ targets: dim, alpha: 1, duration: 200 });
    panel.setScale(0.7).setAlpha(0);
    this.tweens.add({ targets: panel, scale: 1, alpha: 1, duration: 320, ease: 'Back.easeOut' });
  }
}
