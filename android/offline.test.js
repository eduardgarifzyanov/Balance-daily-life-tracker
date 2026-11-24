const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

test('Android diary stores, edits, imports and exports records without an API server', async t => {
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const browser = await chromium.launch({executablePath: process.env.BROWSER_PATH || (fs.existsSync(edge) ? edge : undefined)});
  t.after(() => browser.close());
  const page = await browser.newPage({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
  await page.addInitScript(() => {
    window.BalanceAndroid = {saveBackup: json => { window.exported = JSON.parse(json); }};
  });
  const publicDir = path.join(__dirname, '..', 'public');
  const requests = [];
  await page.route('https://balance.invalid/**', async route => {
    const file = new URL(route.request().url()).pathname;
    switch (file) {
      case '/':
        return route.fulfill({contentType: 'text/html', body: fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8')
          .replace('<script src="/app.js" defer></script>', '<script src="/offline.js" defer></script><script src="/app.js" defer></script>')});
      case '/offline.js': return route.fulfill({path: path.join(__dirname, 'offline.js'), contentType:'text/javascript'});
      case '/app.js': case '/style.css': case '/icon.svg': case '/manifest.json':
        return route.fulfill({path: path.join(publicDir, file.slice(1))});
      default:
        requests.push(file);
        return route.abort();
    }
  });
  await page.goto('https://balance.invalid/');
  await page.getByRole('heading', {name:'Сегодня в дневнике'}).waitFor();
  assert.equal(await page.locator('#authform').count(), 0);
  const tab = name => page.getByRole('button', {name, exact:true}).click();
  await tab('Питание');
  await page.locator('[data-water="250"]').click();
  await page.locator('.entry').getByText('250 мл').waitFor();
  await page.reload();
  await tab('Питание');
  await page.locator('.entry').getByText('250 мл').waitFor();
  await page.locator('[data-edit]').click();
  await page.locator('[name=ml]').fill('300');
  await page.locator('#entryform .primary').click();
  await page.locator('.entry').getByText('300 мл').waitFor();
  await tab('Настройки');
  await page.locator('#export').click();
  const original = await page.evaluate(() => window.exported);
  assert.equal(original.records.length, 1);
  assert.equal(original.records[0].payload.ml, 300);

  const imported = {date: original.records[0].date, type:'water', payload:{ml:450}};
  async function load(records, message) {
    await page.locator('#import-file').setInputFiles({
      name:'backup.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify({records}))
    });
    await page.getByRole('status').getByText(message, {exact:true}).waitFor();
  }
  await load([imported, {...imported, type:'unexpected'}], 'В копии есть запись с неверным форматом');
  await page.locator('#export').click();
  assert.equal((await page.evaluate(() => window.exported)).records.length, 1);
  await load([imported, imported], 'Импортировано записей: 2');
  await load([imported, imported], 'Новых записей нет');
  await page.locator('#export').click();
  assert.equal((await page.evaluate(() => window.exported)).records.length, 3);
  await tab('Питание');
  assert.equal(await page.locator('.entry').filter({hasText:'450 мл'}).count(), 2);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-delete]').first().click();
  await page.getByRole('status').getByText('Запись удалена').waitFor();
  assert.equal(await page.locator('.entry').count(), 2);
  assert.deepEqual(requests, []);
});

