require('./offline-tests.cjs');
// Test pomocniczy; aplikacja działa bez tych zależności.
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
    const file = name => ({ name, mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="green"/></svg>') });
    await page.locator('#image-files').setInputFiles([
      file('Pośladki - Akryl na płótnie 40x50cm - październik 2026.svg'),
      file('Szkic - technika mieszana na papierze.svg'),
    ]);
    await page.waitForFunction(() => document.querySelectorAll('.image-card').length === 2 && !document.getElementById('add-images').disabled);
    const card = page.locator('.image-card').first();
    const second = page.locator('.image-card').nth(1);
    const technique = card.getByLabel('Technika (opcjonalnie)', { exact: true });
    const support = card.getByLabel('Podłoże (opcjonalnie)', { exact: true });
    const description = card.getByLabel('Opis (opcjonalnie)', { exact: true });
    assert.equal(await technique.inputValue(), 'akryl');
    assert.equal(await support.inputValue(), 'płótno');
    for (const [key, text] of [['technique', 'Akryl'], ['support', 'płótnie'], ['dimensions', '40x50cm'], ['date', 'październik 2026']]) {
      assert.equal(await card.locator(`.source-mark[data-field="${key}"]`).textContent(), text);
    }
    assert.equal(await second.getByLabel('Technika (opcjonalnie)', { exact: true }).inputValue(), 'mieszana');
    assert.equal(await second.getByLabel('Podłoże (opcjonalnie)', { exact: true }).inputValue(), 'papier');
    for (const [text, expectedTechnique, expectedSupport] of [
      ['Olej na desce', 'olej', 'drewno'],
      ['Akwarela na papierze', 'akwarela', 'papier'],
      ['Technika własna na sklejce', 'własna', 'sklejka'],
      ['Akryl i tusz na płycie MDF', 'akryl + tusz', 'płyta MDF'],
    ]) {
      await description.fill(text);
      assert.equal(await technique.inputValue(), expectedTechnique);
      assert.equal(await support.inputValue(), expectedSupport);
    }
    await technique.fill('moja technika');
    await support.fill('ceramika');
    await description.fill('Akryl na papierze');
    assert.equal(await technique.inputValue(), 'moja technika');
    assert.equal(await support.inputValue(), 'ceramika');
    assert.equal(await card.locator('.source-mark[data-field="technique"]').count(), 0);
    assert.equal(await card.locator('.source-mark[data-field="support"]').count(), 0);

    const source = card.getByRole('textbox', { name: 'Nazwa pliku lub opis', exact: true });
    const mapping = card.getByRole('group', { name: 'Przypisz zaznaczony tekst', exact: true });
    // Rzeczywiste zaznaczenie myszką, następnie świadome przypisanie tytułu.
    await source.dblclick({ position: { x: 40, y: 26 } });
    await mapping.getByRole('button', { name: 'Tytuł', exact: true }).click();
    assert.equal(await card.getByLabel('Tytuł', { exact: true }).inputValue(), 'Pośladki');
    assert.equal(await card.locator('.source-mark[data-field="title"]').textContent(), 'Pośladki');
    // To samo z klawiatury: Shift+strzałka, Enter i Enter wybierają propozycję.
    await source.focus();
    await source.press('Control+Home');
    for (let i = 0; i < 'Pośladki'.length; i++) await source.press('Shift+ArrowRight');
    await source.press('Enter');
    await page.keyboard.press('Enter');
    assert.equal(await card.getByLabel('Tytuł', { exact: true }).inputValue(), 'Pośladki');

    async function selectFragment(text) {
      await source.focus();
      await source.evaluate((element, text) => {
        const start = element.value.indexOf(text);
        if (start < 0) throw Error('Brak fragmentu w nazwie.');
        element.setSelectionRange(start, start + text.length);
        element.dispatchEvent(new Event('select'));
      }, text);
    }
    for (const [fragment, button, label, value] of [
      ['Akryl', 'Technika', 'Technika (opcjonalnie)', 'akryl'],
      ['płótnie', 'Podłoże', 'Podłoże (opcjonalnie)', 'płótno'],
      ['październik 2026', 'Data', 'Data (opcjonalnie)', '10.2026'],
      ['Akryl na płótnie', 'Opis', 'Opis (opcjonalnie)', 'Akryl na płótnie'],
    ]) {
      await selectFragment(fragment);
      await mapping.getByRole('button', { name: button, exact: true }).click();
      assert.equal(await card.getByLabel(label, { exact: true }).inputValue(), value);
    }
    await card.getByLabel('Szerokość', { exact: true }).fill('10');
    await selectFragment('40x50cm');
    await mapping.getByRole('button', { name: 'Rozmiar', exact: true }).click();
    assert.equal(await card.getByLabel('Szerokość', { exact: true }).inputValue(), '40');
    assert.equal(await card.getByLabel('Wysokość', { exact: true }).inputValue(), '50');
    assert.equal(await card.locator('.source-mark[data-field="dimensions"]').textContent(), '40x50cm');
    assert.equal(await card.locator('.source-mark[data-field="dimensions"]').isVisible(), true);
    await selectFragment('Pośladki');
    assert.equal(await mapping.getByRole('button', { name: 'Data', exact: true }).isDisabled(), true);
    assert.equal(await mapping.getByRole('button', { name: 'Rozmiar', exact: true }).isDisabled(), true);
    await source.press('Escape');
    assert.equal(await mapping.isVisible(), false);
    const formBox = await card.locator('form').boundingBox();
    const sourceBox = await source.boundingBox();
    assert.ok(sourceBox.x >= formBox.x + formBox.width, 'Tekst źródłowy ma być po prawej stronie formularza.');
    assert.ok(sourceBox.height >= 300, 'Pole źródłowe ma pomieścić długi opis.');
    await source.fill('Wklejony długi opis — autorska technika na ceramice.');
    await selectFragment('autorska technika');
    await mapping.getByRole('button', { name: 'Technika', exact: true }).click();
    assert.equal(await technique.inputValue(), 'autorska technika');
    assert.equal(await card.locator('.source-mark[data-field="technique"]').textContent(), 'autorska technika');
    await source.focus();
    await source.press('Control+Home');
    await page.keyboard.insertText('Dopisek: ');
    assert.equal(await card.locator('.source-mark[data-field="technique"]').textContent(), 'autorska technika');
    await source.fill('Inny opis bez poprzedniego fragmentu.');
    assert.equal(await card.locator('.source-mark[data-field="technique"]').count(), 0);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    console.log('OK: technika, podłoże, ochrona poprawek, wybór fragmentu myszką i klawiaturą, przypisania do sześciu pól, widok mobilny.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
