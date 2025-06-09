// @ts-check

import FontSourceSans3ItalicUrl from '@/src/vendor/Source_Sans_3/SourceSans3-Italic-VariableFont_wght.ttf?url';
import FontSourceSans3Url from '@/src/vendor/Source_Sans_3/SourceSans3-VariableFont_wght.ttf?url';

const fonts = /** @type {Array<FontFace>} */ ([]);
const fontStyles = [
  { style: 'normal', url: `url("${FontSourceSans3Url}") format("truetype")` },
  { style: 'italic', url: `url("${FontSourceSans3ItalicUrl}") format("truetype")` },
];
const fontWeights = [
  '300',
  '400',
  '500',
  '600',
  '700',
];
for (const fontStyle of fontStyles) {
  for (const fontWeight of fontWeights) {
    const font = new FontFace('Source Sans 3', fontStyle.url, {
      display: 'swap',
      style: fontStyle.style,
      weight: fontWeight,
    });
    fonts.push(font);
  }
}

export async function loadFonts() {
  for (const font of fonts) {
    document.fonts.add(font);
    await font.load();
  }
  await document.fonts.ready;
  return true;
}
