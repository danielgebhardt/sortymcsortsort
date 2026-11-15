import Phaser from 'phaser';
import { Dir } from '../core/types';
import { progress, setSetting, totalStars } from '../storage/progress';
import { COLORS, DIR_COLORS, FONT, shade } from '../theme';
import { button, label } from '../ui/button';
import * as draw from '../ui/draw';
import { layout } from '../ui/layout';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    const { W, H, u, safe } = layout(this);
    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.cameras.main.fadeIn(200, 27, 31, 59);

    this.decor(W, H, u);

    const ty = safe.top + H * 0.22;
    const t1 = this.add.text(W / 2, ty, 'Sorty', { fontFamily: FONT, fontSize: `${Math.round(u * 17)}px`, fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
    const t2 = this.add.text(W / 2, ty + u * 16, 'McSort Sort', { fontFamily: FONT, fontSize: `${Math.round(u * 11)}px`, fontStyle: 'bold', color: '#ffbe3d' }).setOrigin(0.5);
    for (const t of [t1, t2]) t.setShadow(0, u * 1.2, '#0d1030', 0, false, true);
    this.tweens.add({ targets: [t1, t2], y: '-=8', duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const p = progress();
    const by = H * 0.6;
    button(this, {
      x: W / 2, y: by, w: u * 60, h: u * 17, color: COLORS.primary, label: `Play  ·  Level ${p.unlocked}`, fontSize: u * 6.5,
      onClick: () => this.scene.start('Play', { level: p.unlocked }),
    });
    button(this, {
      x: W / 2, y: by + u * 22, w: u * 60, h: u * 15, color: COLORS.secondary, label: 'Levels', fontSize: u * 6,
      onClick: () => this.scene.start('Levels'),
    });

    const stars = totalStars();
    if (stars > 0) {
      const sg = this.add.graphics();
      draw.star(sg, W / 2 - u * 10, by + u * 40, u * 6, COLORS.gold);
      label(this, W / 2 + u * 2, by + u * 40, `${stars}`, u * 5.5);
    }

    const sb = H - safe.bottom - u * 12;
    const sound = button(this, {
      x: W / 2, y: sb, w: u * 14, h: u * 12, color: COLORS.secondary,
      icon: (g, s) => draw.soundIcon(g, 0, -s * 0.04, s * 0.75, 0xffffff, p.sound),
      onClick: () => {
        setSetting('sound', !p.sound);
        setSetting('haptics', p.sound);
        sound.destroy();
        this.scene.restart();
      },
    });
  }

  /** Floating blocks in the background. */
  private decor(W: number, H: number, u: number) {
    const dirs: Dir[] = ['up', 'right', 'down', 'left'];
    for (let i = 0; i < 14; i++) {
      const dir = dirs[i % 4];
      const cs = u * Phaser.Math.Between(8, 13);
      const len = Phaser.Math.Between(1, 2);
      const horiz = dir === 'left' || dir === 'right';
      const w = horiz ? cs * len : cs, h = horiz ? cs : cs * len;
      const g = this.add.graphics({ x: Phaser.Math.Between(0, W), y: Phaser.Math.Between(0, H) }).setAlpha(0.12);
      g.fillStyle(shade(DIR_COLORS[dir], -0.3), 1);
      g.fillRoundedRect(-w / 2, -h / 2 + cs * 0.08, w, h, cs * 0.22);
      g.fillStyle(DIR_COLORS[dir], 1);
      g.fillRoundedRect(-w / 2, -h / 2, w, h, cs * 0.22);
      draw.chevron(g, 0, 0, cs * 0.45, dir);
      g.setAngle(Phaser.Math.Between(-12, 12));
      const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
      const dist = u * Phaser.Math.Between(6, 14);
      this.tweens.add({ targets: g, x: g.x + d[0] * dist, y: g.y + d[1] * dist, duration: Phaser.Math.Between(1800, 3200), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  }
}
