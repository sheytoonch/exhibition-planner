// Pomocnicze testy historii; poza plikami aplikacji.
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
    const name = 'Pośladki - Akryl na płótnie 40x50cm - październik 2026.svg';
    await page.locator('#image-files').setInputFiles({ name, mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="green"/></svg>') });
    await page.waitForFunction(() => document.querySelector('.image-card') && !document.getElementById('add-images').disabled);
    assert.equal(await page.locator('#undo').isDisabled(), true);
    const card = page.locator('.image-card');
    const source = card.getByRole('textbox', { name: 'Nazwa pliku lub opis', exact: true });
    const title = card.getByLabel('Tytuł', { exact: true });
    const technique = card.getByLabel('Technika (opcjonalnie)', { exact: true });
    async function assign(text, field) {
      await source.focus();
      await source.evaluate((input, text) => { const at = input.value.indexOf(text); input.setSelectionRange(at, at + text.length); input.dispatchEvent(new Event('select')); }, text);
      await card.getByRole('group', { name: 'Przypisz zaznaczony tekst', exact: true }).getByRole('button', { name: field, exact: true }).click();
    }
    await assign('Pośladki', 'Tytuł');
    assert.equal(await title.inputValue(), 'Pośladki');
    await page.keyboard.press('Control+z');
    assert.equal(await title.inputValue(), '');
    assert.equal(await card.locator('.source-mark[data-field="title"]').count(), 0);
    await page.keyboard.press('Control+y');
    assert.equal(await title.inputValue(), 'Pośladki');
    assert.equal(await card.locator('.source-mark[data-field="title"]').textContent(), 'Pośladki');
    await assign('Akryl', 'Tytuł');
    assert.equal(await title.inputValue(), 'Akryl');
    await page.locator('#undo').click();
    assert.equal(await title.inputValue(), 'Pośladki');
    await page.locator('#redo').click();
    assert.equal(await title.inputValue(), 'Akryl');
    await page.keyboard.press('Control+z');
    await card.getByRole('button', { name: 'Usuń powiązanie: Technika', exact: true }).click();
    assert.equal(await technique.inputValue(), 'akryl');
    assert.equal(await source.inputValue(), name);
    assert.equal(await card.locator('.source-mark[data-field="technique"]').count(), 0);
    assert.equal(await page.locator('#redo').isDisabled(), true);
    await page.keyboard.press('Control+z');
    assert.equal(await card.locator('.source-mark[data-field="technique"]').textContent(), 'Akryl');
    await page.keyboard.press('Control+Shift+z');
    assert.equal(await card.locator('.source-mark[data-field="technique"]').count(), 0);
    await assign('Akryl', 'Technika');
    assert.equal(await card.locator('.source-mark[data-field="technique"]').textContent(), 'Akryl');
    await page.keyboard.press('Control+z');
    assert.equal(await card.locator('.source-mark[data-field="technique"]').count(), 0);
    await page.keyboard.press('Control+y');
    assert.equal(await card.locator('.source-mark[data-field="technique"]').textContent(), 'Akryl');
    await source.fill('Nowy tekst źródłowy');
    assert.equal(await card.locator('.source-mark').count(), 0);
    await page.keyboard.press('Control+z');
    assert.equal(await source.inputValue(), name);
    assert.equal(await card.locator('.source-mark[data-field="technique"]').textContent(), 'Akryl');
    await card.getByLabel('Opis (opcjonalnie)', { exact: true }).fill('Olej na papierze, 60x80cm, marzec 2025');
    assert.equal(await card.getByLabel('Szerokość', { exact: true }).inputValue(), '60');
    assert.equal(await card.getByLabel('Data (opcjonalnie)', { exact: true }).inputValue(), '03.2025');
    await page.keyboard.press('Control+z');
    assert.equal(await card.getByLabel('Opis (opcjonalnie)', { exact: true }).inputValue(), '');
    assert.equal(await card.getByLabel('Szerokość', { exact: true }).inputValue(), '40');
    assert.equal(await card.getByLabel('Data (opcjonalnie)', { exact: true }).inputValue(), '10.2026');
    await page.keyboard.press('Control+y');
    assert.equal(await card.getByLabel('Szerokość', { exact: true }).inputValue(), '60');
    assert.equal(await card.getByLabel('Data (opcjonalnie)', { exact: true }).inputValue(), '03.2025');
    assert.deepEqual(errors, []);
    console.log('OK: Ctrl+Z/Y, przyciski, błędne przypisanie, usuwanie i odtwarzanie powiązań, edycja tekstu i automatycznych metadanych.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
