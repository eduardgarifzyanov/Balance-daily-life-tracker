const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
process.env.BALANCE_TEST_MEMORY='1';
const {server,db}=require('./server');
test('daily diary on phone and desktop',async t=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close()});
 const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
 const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH||(fs.existsSync(edge)?edge:undefined)});
 t.after(()=>browser.close());
 for(const width of [320,360,390,430,844,1280]) await t.test('viewport '+width,async()=>{
   const mobile=width<1280;
   const page=await browser.newPage({viewport:{width,height:width===844?390:844},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:mobile?2:1});
   const errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   page.setDefaultTimeout(5000);
   try{
     const click=selector=>page.locator(selector).first()[mobile?'tap':'click']();
     const fill=(name,value)=>page.locator('[name="'+name+'"]').fill(value);
     const tab=async name=>{
       await click('[data-page="'+name+'"]');
       const actual=await page.evaluate(()=>document.documentElement.scrollWidth);
       assert.ok(actual<=width+1,name+' overflows viewport: '+actual+' > '+width);
     };
     async function entry(type,fields,text){
       await click('[data-add="'+type+'"]');
       for(const [key,value] of Object.entries(fields)) await fill(key,value);
       await click('#entryform button');
       await page.locator('.entry').filter({hasText:text}).waitFor();
     }
     await page.clock.install();
     await page.goto('http://127.0.0.1:'+server.address().port);
     await click('#toggle');await fill('name','Анна');await fill('email',width+'@example.org');
     await fill('password','Example1234');await click('#authform button');
     await page.locator('.awards').waitFor();assert.equal(await page.locator('.awards .pending').count(),6);await tab('Питание');await click('[data-water="250"]');await page.locator('.entry time').waitFor();
     await page.reload();await tab('Питание');await page.locator('.entry').filter({hasText:'250 мл'}).waitFor();
     await click('[data-add=food]');await page.locator('#product').selectOption('0');
     await fill('grams','150');await click('#entryform button');
     await page.getByText(/150 г · 132 ккал/).waitFor();
     await tab('Питание');assert.match(await page.locator('.metrics').innerText(),/4,5|4\.5/);
     await tab('Активность');await entry('activity',{name:'Ходьба',minutes:'30',steps:'3000'},'3000 шагов');
     await tab('Сон и привычки');await entry('sleep',{hours:'7.5'},'7.5 ч');
     await entry('habit',{name:'Чтение'},'Чтение');
     await tab('Напоминания');await fill('message','Разминка');await click('#schedule button');await click('[data-switch]');await page.getByText(/На паузе/).waitFor();await click('[data-drop]');await click('#remind');await page.clock.fastForward(1800000);
     await page.locator('#reminderAlert').getByText('Пора выпить воды').waitFor();await click('#reminderAlert button');
     await click('#signalTest');await page.locator('#reminderAlert').getByText('Проверка напоминания').waitFor();await click('#reminderAlert button');
     await tab('Прогресс');await entry('weight',{kg:'70.5',waist:'80'},'70.5 кг');
     assert.equal(await page.locator('.chart b').first().innerText(),'70.5');
     assert.equal(await page.locator('.trend').count(),5);
     await tab('Настройки');await fill('water','2400');await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/records')&&r.status()===201),click('#goals button')]);
     const downloaded=page.waitForEvent('download');await click('#export');
     const file=await (await downloaded).path();
     const exported=JSON.parse(fs.readFileSync(file,'utf8'));
     assert.equal(exported.records.length,7);
     assert.equal(exported.records.find(r=>r.type==='settings').payload.water,2400);
     await tab('Обзор');await page.getByText('Регулярность дневника').waitFor();assert.equal(await page.locator('[data-water], [data-add=food]').count(),0);await tab('Питание');await page.locator('#date').fill('2099-01-01');assert.notEqual(await page.locator('#date').inputValue(),'2099-01-01');await page.locator('#date').fill('2020-01-01');
     assert.equal(await page.locator('.entry').count(),0);
     await click('[data-water="150"]');await page.locator('.entry').filter({hasText:'150 мл'}).waitFor();
     page.once('dialog',dialog=>dialog.accept());await click('[data-delete]');
     await page.locator('.entry').waitFor({state:'detached'});
     await tab('Настройки');await fill('water','150');
     await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/records')&&r.status()===201),click('#goals button')]);
     await tab('Питание');await click('[data-water="150"]');await page.locator('.earned').waitFor();
     assert.match(await page.locator('#toast').innerText(),/Награда за день/);
     await click('[data-water="250"]');await page.locator('.entry').filter({hasText:'250 мл'}).waitFor();
     assert.equal(await page.locator('.earned').count(),1);
     await tab('Обзор');await page.locator('.awards .achieved').filter({hasText:'Водный баланс'}).waitFor();
     await click('#logout');await page.locator('#authform').waitFor();await fill('email',width+'@example.org');await fill('password','Example1234');await click('#authform button');await page.locator('.streak').waitFor();assert.deepEqual(errors,[]);
   }finally{await page.close()}
 });
});
