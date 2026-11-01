// Pomocniczy test; nie jest częścią aplikacji ani jej zależnością.
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
    const image = name => ({
      name,
      mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1200"><rect width="2400" height="1200" fill="green"/></svg>'),
    });
    const input = page.locator('#image-files');
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Dodaj obrazy' }).click();
    await (await chooser).setFiles(image('Pierwszy.svg'));
    await page.waitForFunction(() => document.querySelector('#import-status').textContent.includes('Obrazy w tej sesji: 1'));
    assert.equal(await page.locator('.image-card').count(), 1);
    const firstCard = page.locator('.image-card').first();
    assert.equal(await firstCard.getByLabel('Tytuł', { exact: true }).inputValue(), '');
    assert.equal(await firstCard.getByLabel('Szerokość', { exact: true }).inputValue(), '');
    assert.equal(await firstCard.locator('.field-status:not([hidden]):not(.valid)').count(), 3);
    await firstCard.getByLabel('Tytuł', { exact: true }).fill('Nihongo');
    await firstCard.getByLabel('Szerokość', { exact: true }).fill('80,5');
    await firstCard.getByLabel('Wysokość', { exact: true }).fill('100');
    assert.equal(await firstCard.locator('.field-status.valid').count(), 3);
    assert.equal(await firstCard.locator('.image-summary').count(), 0);
    assert.equal(await firstCard.getByLabel('Data (opcjonalnie)', { exact: true }).inputValue(), '');
    const dateInput = firstCard.getByLabel('Data (opcjonalnie)', { exact: true });
    await firstCard.getByRole('button', { name: 'Format daty', exact: true }).click();
    assert.equal(await firstCard.getByRole('option').count(), 8);
    await firstCard.getByRole('option', { name: '15.05.2020', exact: true }).click();
    assert.equal(await dateInput.getAttribute('placeholder'), 'np. 15.05.2020');
    assert.equal(await dateInput.inputValue(), '');
    for (const date of ['2020', '05.2020', '29.02.2020', '2018–2021', '01.05.2020–30.06.2020', '05.2020–08.2021', 'od 05.2020 do 08.2021', 'przed 2020', 'przed 05.2020', 'wcześniej niż 15.05.2020', 'po 2020', 'po 05.2020', 'później niż 15.05.2020']) {
      await dateInput.fill(date);
      assert.equal(await dateInput.getAttribute('aria-invalid'), 'false', date);
    }
    for (const date of ['29.02.2021', '31.04.2020', '13.2020', '2021–2018', '08.2021–05.2020', 'od 08.2021 do 05.2020', 'przed 31.02.2020', 'po 13.2020', 'przed', 'po', 'wiosna 2020', 'nieprawidłowa data']) {
      await dateInput.fill(date);
      assert.equal(await dateInput.getAttribute('aria-invalid'), 'true', date);
    }
    await dateInput.fill('');
    assert.equal(await dateInput.getAttribute('aria-invalid'), 'false');
    await firstCard.getByLabel('Data (opcjonalnie)', { exact: true }).fill('2018–2021');
    await firstCard.getByLabel('Opis (opcjonalnie)', { exact: true }).fill('Akryl na płótnie');
    await firstCard.getByLabel('Szerokość', { exact: true }).fill('-1');
    await firstCard.getByLabel('Szerokość', { exact: true }).blur();
    assert.equal(await firstCard.getByLabel('Szerokość', { exact: true }).getAttribute('aria-invalid'), 'true');
    assert.equal(await firstCard.locator('.field-status:not([hidden]):not(.valid)').count(), 1);
    await firstCard.getByLabel('Szerokość', { exact: true }).fill('80,5');
    await input.setInputFiles([image('Drugi.svg'), image('Trzeci.svg')]);
    await page.waitForFunction(() => document.querySelector('#import-status').textContent.includes('Obrazy w tej sesji: 3'));
    assert.equal(await page.locator('.image-card').count(), 3);
    assert.equal(await page.locator('.image-card').nth(1).getByLabel('Tytuł', { exact: true }).inputValue(), '');
    const secondCard = page.locator('.image-card').nth(1);
    const inferredDate = secondCard.getByLabel('Data (opcjonalnie)', { exact: true });
    const descriptionInput = secondCard.getByLabel('Opis (opcjonalnie)', { exact: true });
    for (const [description, expected] of [
      ['Nihongo - Akryl na płótnie 80x80cm - prawdopodobnie 2018 - zadanie ze studiów.', 'ok. 2018'],
      ['Akryl, ukończony 15.05.2020.', '15.05.2020'],
      ['Namalowany 15 maja 2020 roku.', '15.05.2020'],
      ['Powstał w maju 2020.', '05.2020'],
      ['Akryl, maj 2020.', '05.2020'],
      ['Praca z 2020-05-15.', '15.05.2020'],
      ['Malowany od 05.2020 do 08.2021.', 'od 05.2020 do 08.2021'],
      ['Wykonany 2018–2021.', '2018–2021'],
      ['Powstał wcześniej niż 15.05.2020.', 'wcześniej niż 15.05.2020'],
      ['Namalowany po 2020.', 'po 2020'],
      ['Format 2000 x 3000 mm.', ''],
      ['Akryl na płótnie, bez znanej daty.', ''],
      ['Namalowany 2018, wystawiony 2021.', ''],
      ['Wykonany 29.02.2021.', ''],
      ['Wykonany 2018, według opisu z 2018.', '2018'],
    ]) {
      await descriptionInput.fill(description);
      assert.equal(await inferredDate.inputValue(), expected, description);
    }
    await inferredDate.fill('2019');
    await descriptionInput.fill('Nowy opis, wykonany w 2023.');
    assert.equal(await inferredDate.inputValue(), '2019');
    await inferredDate.fill('');
    await descriptionInput.fill('Opis z datą 2024.');
    assert.equal(await inferredDate.inputValue(), '');
    const inferredWidth = secondCard.getByLabel('Szerokość', { exact: true });
    const inferredHeight = secondCard.getByLabel('Wysokość', { exact: true });
    for (const [description, width, height] of [
      ['40x50cm', '50', '40'],
      ['Akryl na płótnie 40x50cm.', '50', '40'],
      ['Nihongo - Akryl na płótnie 80x80cm - prawdopodobnie 2018', '80', '80'],
      ['80 cm x 100 cm', '100', '80'],
      ['80cmx100', '100', '80'],
      ['80 na 100 cm', '100', '80'],
      ['80x100', '100', '80'],
      ['80 × 100 CM', '100', '80'],
      ['800x1000 mm', '100', '80'],
      ['0,8 x 1 m', '100', '80'],
      ['80 cm x 1000 mm', '100', '80'],
      ['80,5 cm x 100,2 cm', '100.2', '80.5'],
      ['80x100 cm i 80x100 cm', '100', '80'],
      ['80x100cm albo 100x120cm', '', ''],
      ['0x80cm', '', ''],
      ['Akryl, 2018, bez wymiarów', '', ''],
      ['Akryl na papierze A0', '118.9', '84.1'],
      ['Akwarela b1', '100', '70.7'],
      ['Format a 4', '29.7', '21'],
      ['A10', '3.7', '2.6'],
      ['B10', '4.4', '3.1'],
      ['Papier A4 / a4', '29.7', '21'],
      ['A4 lub B1', '', ''],
      ['Kod AB1, wersja A11', '', ''],
      ['B1, przycięty do 70x100cm', '100', '70'],
    ]) {
      await descriptionInput.fill(description);
      assert.equal(await inferredWidth.inputValue(), width, description);
      assert.equal(await inferredHeight.inputValue(), height, description);
    }
    await inferredWidth.fill('77');
    await descriptionInput.fill('Akryl 80x100cm');
    assert.equal(await inferredWidth.inputValue(), '77');
    assert.equal(await inferredHeight.inputValue(), '80');
    await inferredHeight.fill('');
    await descriptionInput.fill('Nowy opis 100x120cm');
    assert.equal(await inferredWidth.inputValue(), '77');
    assert.equal(await inferredHeight.inputValue(), '');
    assert.equal(await firstCard.getByLabel('Tytuł', { exact: true }).inputValue(), 'Nihongo');
    assert.equal(await firstCard.getByLabel('Data (opcjonalnie)', { exact: true }).inputValue(), '2018–2021');
    const sizes = await page.locator('.image-card img').evaluateAll(async images => {
      await Promise.all(images.map(image => image.decode()));
      return images.map(image => [image.naturalWidth, image.naturalHeight]);
    });
    assert.deepEqual(sizes, [[1600, 800], [1600, 800], [1600, 800]]);
    await input.setInputFiles([
      { name: 'Uszkodzony.png', mimeType: 'image/png', buffer: Buffer.from('invalid') },
      image('Czwarty.svg'),
    ]);
    await page.waitForFunction(() => document.querySelector('#import-status').textContent.includes('Pominięte pliki:'));
    assert.equal(await page.locator('.image-card').count(), 4);
    assert.equal(await page.locator('#add-images').isEnabled(), true);
    await page.evaluate(() => {
      const workspace = document.getElementById('workspace');
      const card = document.querySelector('.image-card');
      const transfer = count => {
        const data = new DataTransfer();
        for (let i = 0; i < count; i++) {
          data.items.add(new File([
            '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="red"/></svg>',
          ], `Upuszczony-${count}-${i}.svg`, { type: 'image/svg+xml' }));
        }
        return data;
      };
      const data = transfer(1);
      const event = (name, dataTransfer) => new DragEvent(name, { bubbles: true, cancelable: true, dataTransfer });
      workspace.dispatchEvent(event('dragenter', data));
      if (!workspace.classList.contains('drag-over')) throw new Error('Brak podświetlenia.');
      card.dispatchEvent(event('dragenter', data));
      card.dispatchEvent(event('dragleave', data));
      if (!workspace.classList.contains('drag-over')) throw new Error('Podświetlenie znika nad podglądem.');
      card.dispatchEvent(event('drop', data));
      if (workspace.classList.contains('drag-over')) throw new Error('Podświetlenie pozostało po upuszczeniu.');
      workspace.dispatchEvent(event('drop', transfer(2)));
    });
    await page.waitForFunction(() => document.querySelector('#import-status').textContent.includes('Obrazy w tej sesji: 7'));
    assert.equal(await page.locator('.image-card').count(), 7);
    await input.setInputFiles({
      name: 'Pionowy.svg', mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="blue"/></svg>'),
    });
    await page.waitForFunction(() => document.querySelector('.image-card:nth-child(8)'));
    const portrait = page.locator('.image-card').nth(7);
    await portrait.getByLabel('Opis (opcjonalnie)', { exact: true }).fill('Akryl 100x80cm');
    assert.equal(await portrait.getByLabel('Szerokość', { exact: true }).inputValue(), '80');
    assert.equal(await portrait.getByLabel('Wysokość', { exact: true }).inputValue(), '100');
    await portrait.getByLabel('Opis (opcjonalnie)', { exact: true }).fill('Praca w formacie B1');
    assert.equal(await portrait.getByLabel('Szerokość', { exact: true }).inputValue(), '70.7');
    assert.equal(await portrait.getByLabel('Wysokość', { exact: true }).inputValue(), '100');
    await portrait.getByLabel('Opis (opcjonalnie)', { exact: true }).fill('40x50cm');
    assert.equal(await portrait.getByLabel('Szerokość', { exact: true }).inputValue(), '40');
    assert.equal(await portrait.getByLabel('Wysokość', { exact: true }).inputValue(), '50');
    await input.setInputFiles(image('obraz_40x50cm.svg'));
    await page.waitForFunction(() => document.querySelector('.image-card:nth-child(9)'));
    const fromFilename = page.locator('.image-card').nth(8);
    assert.equal(await fromFilename.getByLabel('Szerokość', { exact: true }).inputValue(), '50');
    assert.equal(await fromFilename.getByLabel('Wysokość', { exact: true }).inputValue(), '40');
    await fromFilename.getByLabel('Opis (opcjonalnie)', { exact: true }).fill('Akryl na płótnie.');
    assert.equal(await fromFilename.getByLabel('Szerokość', { exact: true }).inputValue(), '50');
    await fromFilename.getByLabel('Opis (opcjonalnie)', { exact: true }).fill('60x80cm');
    assert.equal(await fromFilename.getByLabel('Szerokość', { exact: true }).inputValue(), '80');
    assert.equal(await fromFilename.getByLabel('Wysokość', { exact: true }).inputValue(), '60');
    await fromFilename.getByLabel('Opis (opcjonalnie)', { exact: true }).fill('60x80cm albo 100x120cm');
    assert.equal(await fromFilename.getByLabel('Szerokość', { exact: true }).inputValue(), '');
    await fromFilename.getByLabel('Opis (opcjonalnie)', { exact: true }).fill('Pośladki - Akryl na płótnie 40x50cm - październik 2026');
    assert.equal(await fromFilename.getByLabel('Szerokość', { exact: true }).inputValue(), '50');
    assert.equal(await fromFilename.getByLabel('Wysokość', { exact: true }).inputValue(), '40');
    assert.equal(await fromFilename.getByLabel('Data (opcjonalnie)', { exact: true }).inputValue(), '10.2026');
    const filenames = [
      ['Pośladki - Akryl na płótnie 40x50cm - październik 2026.svg', '10.2026'],
      ['Obraz - 15 październik 2026.svg', '15.10.2026'],
      ['Obraz - 15 października 2026.svg', '15.10.2026'],
      ['Obraz - paź. 2026.svg', '10.2026'],
      ['Obraz_15_paz_2026.svg', '15.10.2026'],
    ];
    await input.setInputFiles(filenames.map(([name]) => image(name)));
    await page.waitForFunction(() => document.querySelectorAll('.image-card').length === 14 && !document.getElementById('add-images').disabled);
    for (const [index, [, expected]] of filenames.entries()) {
      assert.equal(await page.locator('.image-card').nth(9 + index).getByLabel('Data (opcjonalnie)', { exact: true }).inputValue(), expected);
    }
    const fullFilename = page.locator('.image-card').nth(9);
    assert.equal(await fullFilename.getByLabel('Szerokość', { exact: true }).inputValue(), '50');
    assert.equal(await fullFilename.getByLabel('Wysokość', { exact: true }).inputValue(), '40');
    await fullFilename.getByLabel('Opis (opcjonalnie)', { exact: true }).fill('Akryl na płótnie.');
    assert.equal(await fullFilename.getByLabel('Data (opcjonalnie)', { exact: true }).inputValue(), '10.2026');
    await fullFilename.getByLabel('Opis (opcjonalnie)', { exact: true }).fill('Namalowany 2024, wystawiony 2025.');
    assert.equal(await fullFilename.getByLabel('Data (opcjonalnie)', { exact: true }).inputValue(), '');
    await fullFilename.getByLabel('Opis (opcjonalnie)', { exact: true }).fill('Powstał w marcu 2025.');
    assert.equal(await fullFilename.getByLabel('Data (opcjonalnie)', { exact: true }).inputValue(), '03.2025');
    await fullFilename.getByLabel('Data (opcjonalnie)', { exact: true }).fill('2020');
    await fullFilename.getByLabel('Opis (opcjonalnie)', { exact: true }).fill('Powstał w 2022.');
    assert.equal(await fullFilename.getByLabel('Data (opcjonalnie)', { exact: true }).inputValue(), '2020');
    assert.equal(await page.locator('#add-images').isEnabled(), true);
    assert.deepEqual(errors, []);
    console.log('OK: import i drag and drop, podpisy prac, wymagane wymiary, liczby dziesiętne, opcjonalna swobodna data i niezależna edycja.');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
