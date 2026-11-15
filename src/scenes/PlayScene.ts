import Phaser from 'phaser';
import { haptics } from '../audio/haptics';
import { sfx } from '../audio/sfx';
import { Board, BoardState, MoveEffects, headOf } from '../core/board';
import { search } from '../core/solver';
import { Block, DELTA, Gate, Hit, Level, isHorizontal } from '../core/types';
import { chapterFor, getLevel, tipFor } from '../levels';
import { completeLevel } from '../storage/progress';
import { COLORS, DIR_COLORS, KEY_COLORS, TWIN_COLORS, mix, shade } from '../theme';
import { button, label } from '../ui/button';
import * as draw from '../ui/draw';
import { layout, Layout } from '../ui/layout';

const MAX_HEARTS = 3;

interface BlockView {
  id: number;
  c: Phaser.GameObjects.Container;
  g: Phaser.GameObjects.Graphics;
  fuse?: Phaser.GameObjects.Text;
  w: number;
  h: number;
}

const TUTORIAL_TIPS: Record<number, string> = {
  1: 'Tap a block to slide it out\nthe way its arrow points.',
  2: 'Something in the way? The block\nbounces back and you lose a heart.',
  3: 'Find the right order to clear the board!',
};

export class PlayScene extends Phaser.Scene {
  private n = 1;
  private level!: Level;
  private board!: Board;
  private views = new Map<number, BlockView>();
  private gateViews = new Map<string, Phaser.GameObjects.Graphics>();
  private linkG!: Phaser.GameObjects.Graphics;
  private history: BoardState[] = [];
  private animating = 0;
  private hearts = MAX_HEARTS;
  private mistakes = 0;
  /** Undo and hints are unlimited, but each caps the level's stars (once per level). */
  private usedUndo = false;
  private usedHint = false;
  private ended = false;
  private L!: Layout;
  private cs = 0;
  private ox = 0;
  private oy = 0;
  private heartsG!: Phaser.GameObjects.Graphics;
  private keyColor = new Map<number, number>();
  private twinColor = new Map<number, number>();
  private hintG?: Phaser.GameObjects.Graphics;
  private undoBtn!: Phaser.GameObjects.Container;
  private overlay?: Phaser.GameObjects.Container;
  private toastT?: Phaser.GameObjects.Text;

  constructor() {
    super('Play');
  }

  init(data: { level?: number }) {
    this.n = data.level ?? 1;
    this.views.clear();
    this.gateViews.clear();
    this.history = [];
    this.animating = 0;
    this.keyColor.clear();
    this.twinColor.clear();
    this.hearts = MAX_HEARTS;
    this.mistakes = 0;
    this.usedUndo = false;
    this.usedHint = false;
    this.ended = false;
    this.hintG = undefined;
    this.overlay = undefined;
    this.toastT = undefined;
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
      onClick: () => this.scene.start('Levels', { page: Math.floor((this.n - 1) / 30) }),
    });
    label(this, W / 2, top - u * 2.5, `Level ${this.n}`, u * 6.2);
    label(this, W / 2, top + u * 4, chapterFor(this.n).chapter.name, u * 3.6, COLORS.sub, false);
    this.heartsG = this.add.graphics();
    this.drawHearts();

    const tip = TUTORIAL_TIPS[this.n] ?? tipFor(this.n);
    const tipLines = tip ? tip.split('\n').length : 0;

    const bottom = H - safe.bottom - u * 11;
    const bw = u * 20, gap = u * 24;
    this.undoBtn = button(this, {
      x: W / 2 - gap, y: bottom, w: bw, h: u * 13, color: COLORS.secondary,
      icon: (g, s) => draw.undoIcon(g, 0, -s * 0.04, s * 0.75, 0xffffff),
      onClick: () => this.undo(),
    });
    button(this, {
      x: W / 2, y: bottom, w: bw, h: u * 13, color: COLORS.secondary,
      icon: (g, s) => draw.restartIcon(g, 0, -s * 0.04, s * 0.75, 0xffffff),
      onClick: () => this.scene.restart({ level: this.n }),
    });
    const hintBtn = button(this, {
      x: W / 2 + gap, y: bottom, w: bw, h: u * 13, color: 0xe0a526,
      icon: (g, s) => draw.bulbIcon(g, 0, -s * 0.04, s * 0.75, 0xffffff),
      onClick: () => this.hint(),
    });
    // "−★" badges: using these costs a star.
    for (const b of [this.undoBtn, hintBtn]) {
      b.add(label(this, bw * 0.3, -u * 4.6, '−★', u * 3.2, '#ffd84d'));
    }
    this.refreshUndo();

    // ---- board area --------------------------------------------------------------------
    const areaTop = top + u * 10 + (tip ? u * (4 + tipLines * 5.5) : u * 2);
    const areaBottom = bottom - u * 11;
    const areaW = W - safe.left - safe.right - u * 8;
    const areaH = areaBottom - areaTop;
    this.cs = Math.floor(Math.min(areaW / this.level.w, areaH / this.level.h, u * 22));
    this.ox = Math.round((W - this.cs * this.level.w) / 2);
    this.oy = Math.round(areaTop + (areaH - this.cs * this.level.h) / 2);

    if (tip) {
      const t = label(this, W / 2, areaTop - u * (2 + tipLines * 2.75), tip, u * 4.1, COLORS.sub, false);
      t.setLineSpacing(u * 0.7);
      this.tweens.add({ targets: t, alpha: { from: 0, to: 1 }, y: { from: t.y + u * 2, to: t.y }, duration: 400, delay: 200 });
    }

    this.drawBoard();
    this.assignColors();
    this.linkG = this.add.graphics();
    this.buildViews(true);
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

  private assignColors() {
    // One colour per key block; its locks and gates share it.
    const keys = new Set<number>();
    for (const b of this.level.blocks) if (b.lockedBy !== undefined) keys.add(b.lockedBy);
    for (const g of this.level.gates ?? []) keys.add(g.key);
    [...keys].sort((a, b) => a - b).forEach((k, i) => this.keyColor.set(k, KEY_COLORS[i % KEY_COLORS.length]));
    let t = 0;
    for (const b of this.level.blocks) {
      if (b.twin !== undefined && b.id < b.twin) {
        const c = TWIN_COLORS[t++ % TWIN_COLORS.length];
        this.twinColor.set(b.id, c);
        this.twinColor.set(b.twin, c);
      }
    }
  }

  /** (Re)create every block and gate view from the board state. */
  private buildViews(dropIn = false) {
    for (const v of this.views.values()) v.c.destroy();
    this.views.clear();
    for (const g of this.gateViews.values()) g.destroy();
    this.gateViews.clear();
    for (const gate of this.board.gates) this.makeGate(gate);
    const sorted = [...this.board.blocks.values()].sort((a, b) => a.id - b.id);
    for (const b of sorted) this.makeBlock(b);
    this.drawLinks();
    if (dropIn) {
      let i = 0;
      for (const v of this.views.values()) {
        v.c.setScale(0.6).setAlpha(0);
        this.tweens.add({ targets: v.c, scale: 1, alpha: 1, duration: 260, delay: 40 + (i++ % 40) * 12, ease: 'Back.easeOut' });
      }
    }
  }

  private makeGate(gate: Gate) {
    const { cs, ox, oy } = this;
    const color = this.keyColor.get(gate.key) ?? 0xffffff;
    const g = this.add.graphics({ x: ox + (gate.x + 0.5) * cs, y: oy + (gate.y + 0.5) * cs });
    const s = cs * 0.86;
    g.fillStyle(shade(color, -0.55), 1);
    g.fillRoundedRect(-s / 2, -s / 2, s, s, cs * 0.14);
    g.lineStyle(cs * 0.07, color, 1);
    g.strokeRoundedRect(-s / 2, -s / 2, s, s, cs * 0.14);
    for (let i = -1; i <= 1; i++) {
      g.fillStyle(color, 0.85);
      g.fillRect(i * s * 0.28 - cs * 0.04, -s * 0.36, cs * 0.08, s * 0.72);
    }
    g.fillStyle(0x15182e, 1);
    g.fillCircle(0, 0, cs * 0.2);
    draw.key(g, 0, 0, cs * 0.3, color);
    this.gateViews.set(`${gate.x},${gate.y}`, g);
  }

  private makeBlock(b: Block) {
    const { cs, ox, oy } = this;
    const horiz = isHorizontal(b.dir);
    const w = horiz ? b.len * cs : cs;
    const h = horiz ? cs : b.len * cs;
    const c = this.add.container(ox + b.x * cs + w / 2, oy + b.y * cs + h / 2);
    const g = this.add.graphics();
    c.add(g);
    const v: BlockView = { id: b.id, c, g, w, h };
    c.setData('block', { ...b });
    c.setData('locked', this.board.isLocked(b));
    if (b.fuse !== undefined) {
      v.fuse = this.add.text(0, 0, '', { fontFamily: 'system-ui, sans-serif', fontSize: `${Math.round(cs * 0.36)}px`, fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
      c.add(v.fuse);
    }
    this.views.set(b.id, v);
    this.paintBlock(v);
  }

  private paintBlock(v: BlockView) {
    const b = this.board.blocks.get(v.id);
    if (!b) return;
    const { cs } = this;
    const { g, w, h } = v;
    g.clear();
    const locked = this.board.isLocked(b);
    const pad = cs * 0.07;
    const lip = cs * 0.08;
    const r = cs * 0.22;
    const base = locked ? mix(DIR_COLORS[b.dir], 0x5a5f8c, 0.7) : DIR_COLORS[b.dir];
    const x0 = -w / 2 + pad, y0 = -h / 2 + pad, bw = w - pad * 2, bh = h - pad * 2;
    const topY = y0 - lip * 0.5, topH = bh - lip * 0.5;
    if (b.spinner) {
      // Spinners are round.
      const rad = bw / 2;
      g.fillStyle(shade(base, -0.38), 1);
      g.fillCircle(0, lip * 0.5, rad);
      g.fillStyle(base, 1);
      g.fillCircle(0, -lip * 0.4, rad - lip * 0.2);
      g.fillStyle(0xffffff, 0.16);
      g.fillEllipse(0, -lip * 0.4 - rad * 0.55, rad * 1.1, rad * 0.35);
    } else {
      g.fillStyle(shade(base, -0.38), 1);
      g.fillRoundedRect(x0, y0 + lip * 0.5, bw, bh, r);
      g.fillStyle(base, 1);
      g.fillRoundedRect(x0, topY, bw, topH, r);
      g.fillStyle(0xffffff, 0.16);
      g.fillRoundedRect(x0 + cs * 0.08, topY + cs * 0.06, bw - cs * 0.16, Math.min(bh, cs) * 0.22, r * 0.6);
    }

    const horiz = isHorizontal(b.dir);
    const cellCenter = (i: number): [number, number] => [horiz ? -w / 2 + cs * (i + 0.5) : 0, (horiz ? 0 : -h / 2 + cs * (i + 0.5)) - lip * 0.4];
    const arrowAlpha = locked ? 0.3 : 0.95;

    if (b.slider) {
      // Sliders: a dark inner track and double chevrons — "goes until it hits something".
      g.lineStyle(cs * 0.06, shade(base, -0.45), 0.9);
      g.strokeRoundedRect(x0 + cs * 0.1, topY + cs * 0.1, bw - cs * 0.2, topH - cs * 0.2, r * 0.7);
      const { dx, dy } = DELTA[b.dir];
      for (let i = 0; i < b.len; i++) {
        const [cx, cy] = cellCenter(i);
        draw.chevron(g, cx - dx * cs * 0.12, cy - dy * cs * 0.12, cs * 0.34, b.dir, 0xffffff, arrowAlpha);
        draw.chevron(g, cx + dx * cs * 0.12, cy + dy * cs * 0.12, cs * 0.34, b.dir, 0xffffff, arrowAlpha);
      }
    } else if (b.spinner) {
      const [cx, cy] = cellCenter(0);
      draw.spinRing(g, cx, cy, cs * 0.3, 0xffffff, 0.55);
      draw.chevron(g, cx, cy, cs * 0.34, b.dir, 0xffffff, arrowAlpha);
    } else {
      for (let i = 0; i < b.len; i++) {
        const [cx, cy] = cellCenter(i);
        if (b.fuse !== undefined && i === Math.floor((b.len - 1) / 2)) continue; // bomb badge goes here
        draw.chevron(g, cx, cy, cs * (b.len === 1 ? 0.5 : 0.42), b.dir, 0xffffff, arrowAlpha);
      }
    }

    if (b.fuse !== undefined && v.fuse) {
      const [cx, cy] = cellCenter(Math.floor((b.len - 1) / 2));
      draw.bomb(g, cx, cy, cs * 0.78, b.fuse <= 2);
      v.fuse.setText(String(b.fuse)).setPosition(cx, cy + cs * 0.03);
      if (b.len === 1) draw.chevron(g, cx + DELTA[b.dir].dx * cs * 0.36, cy + DELTA[b.dir].dy * cs * 0.36, cs * 0.18, b.dir, 0xffffff, 0.95);
    }

    if (locked) {
      const lockC = this.keyColor.get(b.lockedBy!) ?? 0xffffff;
      g.lineStyle(cs * 0.06, lockC, 1);
      g.strokeRoundedRect(x0, topY, bw, topH, r);
      g.fillStyle(0x1b1f3b, 0.85);
      g.fillCircle(0, -lip * 0.4, cs * 0.3);
      draw.padlock(g, 0, -lip * 0.4, cs * 0.46, lockC);
    }

    // Corner badges: key (for locks/gates) top-right, twin link top-left.
    const keyC = this.keyColor.get(b.id);
    if (keyC !== undefined) {
      const kx = w / 2 - pad - cs * 0.2, ky = -h / 2 + pad + cs * 0.14;
      g.fillStyle(0x1b1f3b, 0.9);
      g.fillCircle(kx, ky, cs * 0.2);
      g.lineStyle(cs * 0.04, keyC, 1);
      g.strokeCircle(kx, ky, cs * 0.2);
      draw.key(g, kx, ky, cs * 0.3, keyC);
    }
    const twinC = this.twinColor.get(b.id);
    if (twinC !== undefined && this.board.blocks.has(b.twin!)) {
      const tx = -w / 2 + pad + cs * 0.2, ty = -h / 2 + pad + cs * 0.14;
      g.fillStyle(0x1b1f3b, 0.9);
      g.fillCircle(tx, ty, cs * 0.2);
      draw.link(g, tx, ty, cs * 0.3, twinC);
    }
  }

  /** Dotted lines joining each twin pair. */
  private drawLinks() {
    const g = this.linkG;
    g.clear();
    for (const b of this.board.blocks.values()) {
      if (b.twin === undefined || b.id > b.twin) continue;
      const a = this.views.get(b.id), c = this.views.get(b.twin);
      if (!a || !c) continue;
      const color = this.twinColor.get(b.id) ?? 0xffffff;
      const dist = Phaser.Math.Distance.Between(a.c.x, a.c.y, c.c.x, c.c.y);
      const steps = Math.floor(dist / (this.cs * 0.28));
      g.fillStyle(color, 0.55);
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        g.fillCircle(a.c.x + (c.c.x - a.c.x) * t, a.c.y + (c.c.y - a.c.y) * t, this.cs * 0.05);
      }
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

  private puff(x: number, y: number, color: number, count = 10, power = 1) {
    const e = this.add.particles(x, y, 'dot', {
      speed: { min: this.cs * 0.8 * power, max: this.cs * 2.6 * power },
      lifespan: 420 * power,
      scale: { start: (this.cs / 50) * power, end: 0 },
      tint: [color, 0xffffff],
      emitting: false,
    });
    e.setDepth(50);
    e.explode(count);
    this.time.delayedCall(700 * power, () => e.destroy());
  }

  private toast(text: string) {
    const { W, H, u, safe } = this.L;
    this.toastT?.destroy();
    // Just above the buttons, so it never covers the block a hint is pointing at.
    const t = label(this, W / 2, H - safe.bottom - u * 30, text, u * 4.6, '#ffffff').setDepth(80);
    t.setBackgroundColor('#0d1030cc').setPadding(u * 3, u * 2, u * 3, u * 2);
    this.toastT = t;
    this.tweens.add({ targets: t, alpha: { from: 0, to: 1 }, duration: 150, yoyo: true, hold: 1600, onComplete: () => t.destroy() });
  }

  // ---- input & rules ---------------------------------------------------------------------

  private cellAt(p: Phaser.Input.Pointer): [number, number] | null {
    const x = Math.floor((p.x - this.ox) / this.cs);
    const y = Math.floor((p.y - this.oy) / this.cs);
    return this.board.inBounds(x, y) ? [x, y] : null;
  }

  private onTap(p: Phaser.Input.Pointer) {
    if (this.ended || this.overlay || this.animating > 0) return;
    const cell = this.cellAt(p);
    if (!cell) return;
    const id = this.board.at(cell[0], cell[1]);
    if (id === null || id === 'wall') return;
    sfx.unlock();
    this.clearHint();
    const before = this.board.snapshot();
    const res = this.board.tap(id);
    if (res.kind === 'exit' || res.kind === 'slide') {
      this.history.push(before);
      this.refreshUndo();
    }
    if (res.kind === 'exit') {
      this.animateExit(res.id, res.distance);
      if (res.partner) this.animateExit(res.partner.id, res.partner.distance);
      this.afterMove(res.effects!);
    } else if (res.kind === 'slide') {
      this.animateSlide(res.id, res.distance);
      this.afterMove(res.effects!);
    } else if (res.kind === 'blocked') {
      this.animateBump(res.id, res.distance, res.hitId);
      if (res.tapped !== res.id) this.nudge(res.tapped);
    } else if (res.kind === 'locked') {
      this.animateLocked(res.id);
    }
  }

  /** Track running animations so input waits for the board to settle. */
  private busy(ms: number, then?: () => void) {
    this.animating++;
    this.time.delayedCall(ms, () => {
      this.animating--;
      then?.();
    });
  }

  private animateExit(id: number, distance: number) {
    const v = this.views.get(id);
    if (!v) return;
    const { cs } = this;
    // The block is already gone from the board; use the view's last known geometry.
    const b = this.blockOf(v);
    const { dx, dy } = DELTA[b.dir];
    const travel = (distance + b.len + 1.2) * cs;
    const dur = 160 + (distance + b.len) * 28;
    sfx.whoosh();
    haptics.light();
    this.views.delete(id);
    this.tweens.add({ targets: v.c, x: v.c.x + dx * travel, y: v.c.y + dy * travel, duration: dur, ease: 'Cubic.easeIn' });
    this.tweens.add({ targets: v.c, alpha: 0, scale: 0.85, duration: dur * 0.4, delay: dur * 0.6 });
    const [hx, hy] = headOf(b);
    const ex = this.ox + (hx + 0.5 + dx * (distance + 0.9)) * cs;
    const ey = this.oy + (hy + 0.5 + dy * (distance + 0.9)) * cs;
    this.time.delayedCall(dur * 0.55, () => this.puff(ex, ey, DIR_COLORS[b.dir], 8));
    this.busy(dur, () => v.c.destroy());
    this.drawLinks();
  }

  /** Geometry snapshot kept on each view (block may already be off the board). */
  private blockOf(v: BlockView): Block {
    const live = this.board.blocks.get(v.id);
    if (live) return live;
    const last = (v.c.getData('block') as Block | undefined) ?? this.level.blocks.find((x) => x.id === v.id)!;
    return last;
  }

  private animateSlide(id: number, distance: number) {
    const v = this.views.get(id)!;
    const b = this.board.blocks.get(id)!;
    const { dx, dy } = DELTA[b.dir];
    const dur = 110 + distance * 50;
    sfx.whoosh();
    this.tweens.add({
      targets: v.c, x: v.c.x + dx * distance * this.cs, y: v.c.y + dy * distance * this.cs, duration: dur, ease: 'Quad.easeIn',
      onComplete: () => {
        sfx.bump();
        haptics.light();
        this.tweens.add({ targets: v.c, scaleX: horizontalSquash(b.dir, 0.9), scaleY: horizontalSquash(b.dir, 0.9, true), duration: 60, yoyo: true });
      },
    });
    this.busy(dur + 60);
  }

  /** After a successful move: spinners turn, gates open, bombs tick, then check win/stuck/boom. */
  private afterMove(fx: MoveEffects) {
    // remember geometry for views of blocks that just left (used by exit animation)
    for (const v of this.views.values()) {
      const b = this.board.blocks.get(v.id);
      if (b) v.c.setData('block', { ...b });
    }
    for (const gate of fx.opened) {
      const g = this.gateViews.get(`${gate.x},${gate.y}`);
      if (!g) continue;
      this.gateViews.delete(`${gate.x},${gate.y}`);
      sfx.unlockChime();
      this.puff(g.x, g.y, this.keyColor.get(gate.key) ?? 0xffffff, 12);
      this.tweens.add({ targets: g, scale: 0, alpha: 0, angle: 90, duration: 280, delay: 120, ease: 'Back.easeIn', onComplete: () => g.destroy() });
    }
    for (const v of this.views.values()) {
      const b = this.board.blocks.get(v.id);
      if (!b) continue;
      const wasLocked = b.lockedBy !== undefined && !this.board.blocks.has(b.lockedBy) && v.c.getData('locked');
      v.c.setData('locked', this.board.isLocked(b));
      this.paintBlock(v);
      if (wasLocked) this.animateUnlock(v);
      if (b.spinner && fx.spun) {
        v.c.angle = -90;
        this.tweens.add({ targets: v.c, angle: 0, duration: 260, delay: 120, ease: 'Back.easeOut' });
      }
      if (b.fuse !== undefined && b.fuse <= 2 && v.fuse) {
        this.tweens.add({ targets: v.c, scale: 1.12, duration: 120, yoyo: true });
      }
    }
    this.drawLinks();
    this.time.delayedCall(320, () => this.checkEnd());
  }

  private animateUnlock(v: BlockView) {
    sfx.unlockChime();
    const b = this.board.blocks.get(v.id);
    const color = b?.lockedBy !== undefined ? (this.keyColor.get(b.lockedBy) ?? 0xffffff) : 0xffffff;
    this.puff(v.c.x, v.c.y, color, 14);
    this.tweens.add({ targets: v.c, scale: { from: 1.18, to: 1 }, duration: 300, ease: 'Back.easeOut' });
  }

  private animateBump(id: number, distance: number, hitId: Hit) {
    const v = this.views.get(id);
    if (!v) return;
    const { cs } = this;
    const b = this.board.blocks.get(id)!;
    const { dx, dy } = DELTA[b.dir];
    const fwd = distance * cs + cs * 0.16;
    const x0 = v.c.x, y0 = v.c.y;
    this.hearts = Math.max(0, this.hearts - 1);
    this.mistakes++;
    const out = 70 + distance * 45;
    const back = 160 + distance * 30;
    this.busy(out + back);
    this.tweens.add({
      targets: v.c, x: x0 + dx * fwd, y: y0 + dy * fwd, duration: out, ease: 'Quad.easeIn',
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
          targets: v.c, x: x0, y: y0, duration: back, ease: 'Back.easeOut',
          onComplete: () => {
            if (this.hearts <= 0) this.lose('hearts');
          },
        });
      },
    });
  }

  /** The tapped twin twitches while its blocked partner bounces. */
  private nudge(id: number) {
    const v = this.views.get(id);
    if (!v) return;
    this.tweens.add({ targets: v.c, scale: 1.08, duration: 80, yoyo: true });
  }

  private animateLocked(id: number) {
    const v = this.views.get(id);
    if (!v) return;
    sfx.locked();
    haptics.light();
    this.busy(320);
    this.tweens.add({
      targets: v.c, angle: { from: -6, to: 6 }, duration: 50, yoyo: true, repeat: 2,
      onComplete: () => { v.c.angle = 0; },
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

  // ---- undo & hints ----------------------------------------------------------------------

  private refreshUndo() {
    this.undoBtn?.setAlpha(this.history.length ? 1 : 0.45);
  }

  private undo() {
    if (this.animating > 0 || !this.history.length) return;
    if (this.ended && !this.overlay) return;
    this.closeOverlay();
    this.ended = false;
    this.clearHint();
    this.board.restore(this.history.pop()!);
    this.refreshUndo();
    this.buildViews();
    for (const v of this.views.values()) {
      v.c.setAlpha(0.4);
      this.tweens.add({ targets: v.c, alpha: 1, duration: 160 });
    }
    if (!this.usedUndo) {
      this.usedUndo = true;
      this.toast(`Undo used — this level now\ngives at most ${this.maxStars()} ★`);
    }
  }

  /** Best possible stars from here: bounces, Undo and hints each cost one. */
  private maxStars() {
    return Math.max(1, 3 - this.mistakes - (this.usedUndo ? 1 : 0) - (this.usedHint ? 1 : 0));
  }

  private spendHint(): string {
    if (this.usedHint) return '';
    this.usedHint = true;
    return `\nHint used — at most ${this.maxStars()} ★`;
  }

  private hint() {
    if (this.ended || this.animating > 0) return;
    this.clearHint();
    const r = search(this.board, 30_000);
    let id: number | undefined;
    if (r.solvable === false) {
      this.toast((this.history.length ? 'No way out from here —\ntry Undo!' : 'Hmm, try Restart.') + this.spendHint());
      this.tweens.add({ targets: this.undoBtn, scale: 1.15, duration: 160, yoyo: true, repeat: 2 });
      return;
    }
    if (r.solvable && r.moves.length) id = r.moves[0];
    if (id === undefined) {
      const free = [...this.board.blocks.values()].filter((b) => this.board.canProgress(b));
      id = free[0]?.id;
    }
    const v = id !== undefined ? this.views.get(id) : undefined;
    if (!v) return;
    const cost = this.spendHint();
    if (cost) this.toast(cost.trim());
    const g = this.add.graphics({ x: v.c.x, y: v.c.y }).setDepth(40);
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

  private checkEnd() {
    if (this.ended) return;
    if (this.board.exploded !== null) return this.explode(this.board.exploded);
    if (this.board.cleared) {
      if (this.animating > 0) return void this.time.delayedCall(150, () => this.checkEnd());
      this.ended = true;
      const stars = this.maxStars();
      completeLevel(this.n, stars);
      sfx.win();
      haptics.success();
      this.time.delayedCall(200, () => this.showResult('won', stars));
      return;
    }
    if (!this.board.hasMove()) {
      this.ended = true;
      sfx.lose();
      haptics.error();
      this.time.delayedCall(300, () => this.showResult('stuck', 0));
    }
  }

  private explode(id: number) {
    this.ended = true;
    const v = this.views.get(id);
    sfx.lose();
    haptics.error();
    this.cameras.main.shake(350, 0.012);
    this.cameras.main.flash(200, 255, 120, 80);
    if (v) {
      this.puff(v.c.x, v.c.y, 0xff7a3d, 30, 1.8);
      this.tweens.add({ targets: v.c, scale: 1.6, alpha: 0, duration: 250 });
    }
    for (const o of this.views.values()) if (o !== v) this.tweens.add({ targets: o.c, alpha: 0.45, duration: 300 });
    this.time.delayedCall(650, () => this.showResult('boom', 0));
  }

  private lose(_why: 'hearts') {
    if (this.ended) return;
    this.ended = true;
    sfx.lose();
    haptics.error();
    for (const v of this.views.values()) this.tweens.add({ targets: v.c, alpha: 0.45, duration: 300 });
    this.time.delayedCall(350, () => this.showResult('hearts', 0));
  }

  private closeOverlay() {
    this.overlay?.destroy();
    this.overlay = undefined;
  }

  private showResult(kind: 'won' | 'hearts' | 'stuck' | 'boom', stars: number) {
    const { W, H, u } = this.L;
    const layer = this.add.container(0, 0).setDepth(100);
    this.overlay = layer;
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x0d1030, 0.7).setInteractive();
    layer.add(dim);
    const pw = u * 84, ph = u * 78;
    const panel = this.add.container(W / 2, H / 2);
    layer.add(panel);
    const g = this.add.graphics();
    g.fillStyle(shade(COLORS.board, -0.3), 1);
    g.fillRoundedRect(-pw / 2, -ph / 2 + u * 1.5, pw, ph, u * 6);
    g.fillStyle(COLORS.board, 1);
    g.fillRoundedRect(-pw / 2, -ph / 2, pw, ph, u * 6);
    panel.add(g);
    const titles = { won: 'Sorted!', hearts: 'Out of hearts', stuck: 'Stuck!', boom: 'Boom!' };
    panel.add(label(this, 0, -ph / 2 + u * 13, titles[kind], u * 9));
    const by = ph / 2 - u * 16;
    const levelsBtn = () => button(this, { x: -u * 20, y: by, w: u * 32, h: u * 14, color: COLORS.secondary, label: 'Levels', fontSize: u * 5.5, onClick: () => this.scene.start('Levels', { page: Math.floor((this.n - 1) / 30) }) });

    if (kind === 'won') {
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
      const costs = [
        this.mistakes ? `${this.mistakes} bounce${this.mistakes === 1 ? '' : 's'}` : '',
        this.usedUndo ? 'used Undo' : '',
        this.usedHint ? 'used a hint' : '',
      ].filter(Boolean);
      panel.add(label(this, 0, u * 9, costs.length ? costs.join(' · ') : 'Perfect — planned it all!', u * 4.6, COLORS.sub, false));
      panel.add(levelsBtn());
      panel.add(button(this, { x: u * 20, y: by, w: u * 32, h: u * 14, color: COLORS.primary, label: 'Next', fontSize: u * 6, onClick: () => this.scene.restart({ level: this.n + 1 }) }));
    } else {
      const ig = this.add.graphics({ y: -u * 8 });
      if (kind === 'hearts') draw.heart(ig, 0, 0, u * 22, COLORS.heartEmpty);
      else if (kind === 'boom') draw.bomb(ig, 0, 0, u * 24, true);
      else draw.padlock(ig, 0, 0, u * 20, COLORS.heartEmpty);
      panel.add(ig);
      const msg = { hearts: 'Bounced too many times. Try again!', stuck: 'Nothing can move. Undo a few moves\nor start over.', boom: 'A bomb ran out of moves.\nUndo, or dig it out sooner!' }[kind];
      panel.add(label(this, 0, u * 10, msg, u * 4.2, COLORS.sub, false).setLineSpacing(u * 0.6));
      const canUndo = kind !== 'hearts' && this.history.length > 0;
      if (canUndo) {
        panel.add(button(this, { x: -u * 20, y: by, w: u * 32, h: u * 14, color: COLORS.secondary, label: 'Undo', fontSize: u * 5.5, onClick: () => this.undo() }));
      } else {
        panel.add(levelsBtn());
      }
      panel.add(button(this, { x: u * 20, y: by, w: u * 32, h: u * 14, color: COLORS.danger, label: 'Retry', fontSize: u * 6, onClick: () => this.scene.restart({ level: this.n }) }));
    }

    dim.setAlpha(0);
    this.tweens.add({ targets: dim, alpha: 1, duration: 200 });
    panel.setScale(0.7).setAlpha(0);
    this.tweens.add({ targets: panel, scale: 1, alpha: 1, duration: 320, ease: 'Back.easeOut' });
  }
}

/** Squash along the direction of travel when a slider thuds into something. */
function horizontalSquash(dir: Block['dir'], amount: number, yAxis = false) {
  const horiz = isHorizontal(dir);
  return horiz !== yAxis ? amount : 1 / amount;
}
