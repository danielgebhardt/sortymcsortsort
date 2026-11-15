import Phaser from 'phaser';
import { sfx } from '../audio/sfx';
import { FONT, shade } from '../theme';

export interface ButtonOpts {
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;
  label?: string;
  fontSize?: number;
  /** Draw an icon centred at (0,0) of size s. */
  icon?: (g: Phaser.GameObjects.Graphics, s: number) => void;
  disabled?: boolean;
  onClick: () => void;
}

/** A chunky rounded button with a pressed-down effect. */
export function button(scene: Phaser.Scene, o: ButtonOpts): Phaser.GameObjects.Container {
  const c = scene.add.container(o.x, o.y);
  const g = scene.add.graphics();
  const r = Math.min(o.h * 0.3, o.w / 2);
  const lip = o.h * 0.09;
  const base = o.disabled ? 0x3a4072 : o.color;
  g.fillStyle(shade(base, -0.35), 1);
  g.fillRoundedRect(-o.w / 2, -o.h / 2 + lip, o.w, o.h, r);
  g.fillStyle(base, 1);
  g.fillRoundedRect(-o.w / 2, -o.h / 2, o.w, o.h, r);
  g.fillStyle(0xffffff, 0.12);
  g.fillRoundedRect(-o.w / 2 + o.h * 0.08, -o.h / 2 + o.h * 0.06, o.w - o.h * 0.16, o.h * 0.32, r * 0.7);
  c.add(g);

  if (o.icon) {
    const ig = scene.add.graphics();
    o.icon(ig, Math.min(o.w, o.h) * 0.8);
    c.add(ig);
  }
  if (o.label) {
    const t = scene.add
      .text(0, 0, o.label, { fontFamily: FONT, fontSize: `${Math.round(o.fontSize ?? o.h * 0.42)}px`, fontStyle: 'bold', color: o.disabled ? '#7d83b8' : '#ffffff' })
      .setOrigin(0.5);
    c.add(t);
  }

  const zone = scene.add.zone(0, 0, o.w, o.h + lip).setOrigin(0.5).setInteractive({ useHandCursor: !o.disabled });
  c.add(zone);
  if (!o.disabled) {
    zone.on('pointerdown', () => scene.tweens.add({ targets: c, scale: 0.94, duration: 60 }));
    zone.on('pointerout', () => scene.tweens.add({ targets: c, scale: 1, duration: 80 }));
    zone.on('pointerup', () => {
      scene.tweens.add({ targets: c, scale: 1, duration: 80 });
      sfx.unlock();
      sfx.click();
      o.onClick();
    });
  }
  return c;
}

export function label(scene: Phaser.Scene, x: number, y: number, text: string, size: number, color = '#ffffff', bold = true) {
  return scene.add
    .text(x, y, text, { fontFamily: FONT, fontSize: `${Math.round(size)}px`, fontStyle: bold ? 'bold' : 'normal', color, align: 'center' })
    .setOrigin(0.5);
}
