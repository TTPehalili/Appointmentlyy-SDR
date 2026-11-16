/**
 * Server only. Registers the agreement fonts with react-pdf (idempotent).
 *
 * Inter 4.1 (OFL, github.com/rsms/inter) in 400/500/600/700/800 plus 400 italic, and Great Vibes
 * (OFL, github.com/google/fonts) as a script face for typed signatures. Licences sit next to the
 * files in ./fonts. Fonts are read from disk (fontkit), never fetched over the network.
 *
 * Lookup: AGREEMENTS_FONTS_DIR if set, else <cwd>/src/lib/agreements/templates/fonts. A deployment
 * that does not ship src/ (e.g. Next "standalone" output) must copy that folder and set the env var.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Font } from '@react-pdf/renderer';

export const FONT_FAMILY = 'AgrInter';
/** Script face for typed signatures (platform may reuse it on the Execution page). */
export const SCRIPT_FONT_FAMILY = 'AgrGreatVibes';
export const SCRIPT_FONT_FILE = 'GreatVibes-Regular.ttf';

const INTER_FILES: { file: string; fontWeight: number; fontStyle?: 'italic' }[] = [
  { file: 'Inter-Regular.ttf', fontWeight: 400 },
  { file: 'Inter-Italic.ttf', fontWeight: 400, fontStyle: 'italic' },
  { file: 'Inter-Medium.ttf', fontWeight: 500 },
  { file: 'Inter-SemiBold.ttf', fontWeight: 600 },
  { file: 'Inter-Bold.ttf', fontWeight: 700 },
  { file: 'Inter-ExtraBold.ttf', fontWeight: 800 },
];

let registered = false;

/** Absolute path of the folder holding the agreement fonts. Throws a clear error if missing. */
export function agreementFontsDir(): string {
  const candidates = [
    process.env.AGREEMENTS_FONTS_DIR,
    path.join(process.cwd(), 'src', 'lib', 'agreements', 'templates', 'fonts'),
  ];
  for (const dir of candidates) {
    if (dir && fs.existsSync(path.join(dir, 'Inter-Regular.ttf'))) return dir;
  }
  throw new Error(
    'Agreement fonts not found. Expected src/lib/agreements/templates/fonts under the app folder, or set AGREEMENTS_FONTS_DIR.',
  );
}

/** Absolute path of the script (typed-signature) font file. */
export function scriptFontPath(): string {
  return path.join(agreementFontsDir(), SCRIPT_FONT_FILE);
}

export function registerAgreementFonts(): void {
  if (registered) return;
  const dir = agreementFontsDir();
  Font.register({
    family: FONT_FAMILY,
    fonts: INTER_FILES.map((f) => ({ src: path.join(dir, f.file), fontWeight: f.fontWeight, fontStyle: f.fontStyle ?? 'normal' })),
  });
  Font.register({ family: SCRIPT_FONT_FAMILY, src: path.join(dir, SCRIPT_FONT_FILE) });
  registered = true;
}
