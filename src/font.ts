const fonts: Array<FontFace> = [];
const fontStyles = [
  { style: 'normal', url: 'url("/vendor/Source_Sans_3/SourceSans3-VariableFont_wght.ttf")' },
  { style: 'italic', url: 'url("/vendor/Source_Sans_3/SourceSans3-Italic-VariableFont_wght.ttf")' },
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
    font.load();
  }
  await document.fonts.ready;
  return true;
}
