/**
 * App icons for iOS and the web app, derived from the same sources as the Android launcher icon
 * (assets/, which `npx @capacitor/assets generate --android` turned into android/.../res):
 *
 *   assets/icon-only.png        full icon, opaque, artwork filling most of the square
 *   assets/icon-foreground.png  artwork only, transparent, inside the adaptive-icon safe zone
 *
 * Nothing here touches android/. Used by scripts/icon.ts (iOS) and scripts/lib/webapp.ts (web app).
 */
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

export const BG = '#1b1f3b';

const asset = (name: string) => fileURLToPath(new URL(`../../assets/${name}`, import.meta.url));

/** Opaque square icon (no alpha channel — iOS app icons must not have one). */
export const squareIcon = (size: number): Promise<Buffer> =>
  sharp(asset('icon-only.png')).resize(size, size).flatten({ background: BG }).removeAlpha().png().toBuffer();

/**
 * "Maskable" web icon: the adaptive-icon artwork on the background colour. The artwork already sits
 * inside the central safe zone, so Android's circle/squircle masks never clip it.
 */
export const maskableIcon = (size: number): Promise<Buffer> =>
  sharp(asset('icon-foreground.png')).resize(size, size).flatten({ background: BG }).removeAlpha().png().toBuffer();

/** Transparent logo for the iOS launch screen (same artwork as the Android adaptive icon). */
export const launchLogo = (size: number): Promise<Buffer> =>
  sharp(asset('icon-foreground.png')).resize(size, size).png().toBuffer();
