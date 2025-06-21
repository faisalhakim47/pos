// @ts-check

import FontSourceSans3ItalicUrl from '@/src/vendor/Source_Sans_3/SourceSans3-Italic-VariableFont_wght.ttf?url';
import FontSourceSans3Url from '@/src/vendor/Source_Sans_3/SourceSans3-VariableFont_wght.ttf?url';

async function fetchFonts() {
  const fonts = /** @type {Array<FontFace>} */ ([]);
  const fontStyles = [
    { style: 'normal', fontBufferPromise: fetch(FontSourceSans3Url).then((r) => r.arrayBuffer()) },
    { style: 'italic', fontBufferPromise: fetch(FontSourceSans3ItalicUrl).then((r) => r.arrayBuffer()) },
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
      const fontFileBuffer = await fontStyle.fontBufferPromise;
      const font = new FontFace('SourceSans3', fontFileBuffer, {
        display: 'swap',
        style: fontStyle.style,
        weight: fontWeight,
      });
      fonts.push(font);
    }
  }
  return fonts;
}


export async function loadFonts() {
  try {
    const fonts = await fetchFonts();
    for (const font of fonts) {
      document.fonts.add(font);
      await font.load();
    }
    await document.fonts.ready;
  }
  catch (error) {
    console.error('Error loading fonts:', error);
  }
  return true;
}
