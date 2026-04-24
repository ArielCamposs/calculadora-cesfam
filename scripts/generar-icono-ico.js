const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const pngToIcoModule = require('png-to-ico');
const pngToIco = pngToIcoModule.default || pngToIcoModule;

async function generar() {
  const root = path.resolve(__dirname, '..');
  const sourcePng = path.join(root, 'assets', 'logo-insulina1.png');
  const iconIco = path.join(root, 'assets', 'iconocalculadora.ico');
  const tmpDir = path.join(root, 'assets', '.tmp-icon');

  await fs.mkdir(tmpDir, { recursive: true });

  const baseBuffer = await sharp(sourcePng)
    .trim()
    .toBuffer();

  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngFiles = [];

  for (const size of sizes) {
    const out = path.join(tmpDir, `icon-${size}.png`);
    await sharp(baseBuffer)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .sharpen()
      .toFile(out);
    pngFiles.push(out);
  }

  const icoBuffer = await pngToIco(pngFiles);
  await fs.writeFile(iconIco, icoBuffer);

  await fs.rm(tmpDir, { recursive: true, force: true });
  console.log(`Icono generado: ${iconIco}`);
}

generar().catch((error) => {
  console.error('No se pudo generar icon.ico:', error);
  process.exit(1);
});
