// Pomocniczy skrypt przygotowania fontu; aplikacja nie potrzebuje Node ani sieci.
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const response = await fetch('https://fonts.googleapis.com/css2?family=Manrope:wght@400..700&display=swap', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' },
  });
  if (!response.ok) throw Error(`Nie udało się pobrać fontu: ${response.status}`);
  const css = await response.text();
  const faces = [...css.matchAll(/\/\* (latin-ext|latin) \*\/\s*(@font-face\s*\{[^}]+\})/g)];
  if (!faces.length) throw Error('Brak odmian latin i latin-ext.');
  const embedded = [];
  for (const [, subset, face] of faces) {
    const url = face.match(/url\(([^)]+)\)/)?.[1];
    if (!url || new URL(url).hostname !== 'fonts.gstatic.com') throw Error('Niepoprawny adres fontu.');
    const font = await fetch(url);
    if (!font.ok) throw Error('Błąd pobierania pliku fontu.');
    const data = Buffer.from(await font.arrayBuffer());
    embedded.push(`/* ${subset} */\n${face.replace(url, `data:font/woff2;base64,${data.toString('base64')}`)}`);
  }
  const license = await fetch('https://raw.githubusercontent.com/google/fonts/main/ofl/manrope/OFL.txt');
  if (!license.ok) throw Error('Nie udało się pobrać licencji fontu.');
  const licenseText = (await license.text()).replace(/\*\//g, '* /');
  const target = path.resolve(__dirname, '../style.css');
  let content = fs.readFileSync(target, 'utf8').replace(/\/\* BEGIN EMBEDDED MANROPE \*\/[\s\S]*?\/\* END EMBEDDED MANROPE \*\/\s*/, '');
  const header = `/* BEGIN EMBEDDED MANROPE */\n/*\n${licenseText}\n*/\n${embedded.join('\n')}\n/* END EMBEDDED MANROPE */\n\n`;
  fs.writeFileSync(target, header + content);
  console.log(`Osadzono Manrope w style.css: ${faces.length} zakresy znaków, w tym polskie znaki. Licencja zawarta w CSS.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
