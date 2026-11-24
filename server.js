const http = require('node:http');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes,scryptSync,timingSafeEqual}=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const inMemory = process.env.BALANCE_TEST_MEMORY === '1';
const dataDir = path.join(__dirname, 'data');
if (!inMemory) fs.mkdirSync(dataDir, {recursive: true});
const db = new DatabaseSync(inMemory ? ':memory:' : path.join(dataDir, 'balance.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,salt TEXT NOT NULL,hash TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER,expires INTEGER); CREATE TABLE IF NOT EXISTS records(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL,date TEXT NOT NULL,type TEXT NOT NULL,payload TEXT NOT NULL);`);
const recordRanges = {
  food: {grams: [1, 10000], kcal: [0, 100000], protein: [0, 10000], fat: [0, 10000], carbs: [0, 10000]},
  water: {ml: [1, 10000]}, activity: {steps: [0, 100000], minutes: [0, 1440]},
  sleep: {hours: [0.1, 24], quality: [1, 5]}, weight: {kg: [1, 500]},
  habit: {}, recipe: {grams: [1, 10000]},
  settings: Object.fromEntries(['calories', 'water', 'steps', 'protein', 'fat', 'carbs'].map(key => [key, [1, 100000]]))
};
const namedRecords = new Set(['food', 'activity', 'habit', 'recipe']);
const staticFiles = new Map([['/', 'index.html'], ...['app.js', 'style.css', 'manifest.json', 'sw.js',
  'icon.svg', 'icon-192.png', 'icon-512.png'].map(file => ['/' + file, file])]);
const contentTypes = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8',
  json: 'application/json', svg: 'image/svg+xml', png: 'image/png'
};

function serveStatic(pathname, res) {
  const file = staticFiles.get(pathname);
  if (!file) {
    res.writeHead(404);
    return res.end('Not found');
  }
  res.writeHead(200, {
    'Content-Type': contentTypes[file.split('.').pop()],
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'"
  });
  return res.end(fs.readFileSync(path.join(__dirname, 'public', file)));
}

function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
async function handler(req,res){
 try{
 const url=new URL(req.url,'http://localhost');
 if (!url.pathname.startsWith('/api/')) return serveStatic(url.pathname, res);
 if(req.headers.origin && req.headers.origin!==`http://${req.headers.host}` && req.headers.origin!==`https://${req.headers.host}`)return send(res,403,{error:'Недопустимый источник запроса'});
 let body = {};
 if (['POST', 'PUT'].includes(req.method)) {
   let raw = '';
   req.setEncoding('utf8');
   for await (const chunk of req) {
     raw += chunk;
     if (raw.length > 32000) return send(res, 413, {error: 'Слишком большой запрос'});
   }
   try { body = JSON.parse(raw || '{}'); }
   catch { return send(res, 400, {error: 'Некорректный JSON'}); }
   if (!body || typeof body !== 'object' || Array.isArray(body)) {
     return send(res, 400, {error: 'Ожидается объект JSON'});
   }
 }
 const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('session='))?.slice(8);
 const user=db.prepare('SELECT u.id,u.name,u.email FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?').get(token||'',Date.now());
 if(url.pathname==='/api/register'||url.pathname==='/api/login'){
 if(req.method!=='POST')return send(res,405,{error:'Метод не поддерживается'});
 const email=String(body.email||'').trim().toLowerCase(),password=String(body.password||'');
 if(!/^\S+@\S+\.\S+$/.test(email)||email.length>254||password.length<8||password.length>128)return send(res,400,{error:'Введите email и пароль от 8 до 128 символов'});
 let account=db.prepare('SELECT * FROM users WHERE email=?').get(email);
 if(url.pathname.endsWith('register')){if(account)return send(res,409,{error:'Этот email уже зарегистрирован'});const name=String(body.name||'').trim().slice(0,60);if(!name)return send(res,400,{error:'Укажите имя'});const salt=randomBytes(16).toString('hex');const hash=scryptSync(password,salt,64).toString('hex');const result=db.prepare('INSERT INTO users(email,name,salt,hash) VALUES(?,?,?,?)').run(email,name,salt,hash);account={id:Number(result.lastInsertRowid),name,email};}
 else if(!account||!timingSafeEqual(scryptSync(password,account.salt,64),Buffer.from(account.hash,'hex')))return send(res,401,{error:'Неверный email или пароль'});
 const session=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(session,account.id,Date.now()+30*86400000);res.setHeader('Set-Cookie',`session=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${process.env.COOKIE_SECURE==='1'?'; Secure':''}`);return send(res,200,{id:account.id,name:account.name,email:account.email});
 }
 if(!user)return send(res,401,{error:'Войдите в аккаунт'});
 if(url.pathname==='/api/me'&&req.method==='GET')return send(res,200,user);
 if(url.pathname==='/api/logout'&&req.method==='POST'){db.prepare('DELETE FROM sessions WHERE token=?').run(token);res.setHeader('Set-Cookie','session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return send(res,200,{ok:true});}
 if(url.pathname==='/api/records'&&req.method==='GET')return send(res,200,db.prepare('SELECT id,date,type,payload FROM records WHERE user_id=? ORDER BY date,id').all(user.id).map(r=>({...r,payload:JSON.parse(r.payload)})));
 const editId=req.method==='PUT' && /^\/api\/records\/\d+$/.test(url.pathname) ? Number(url.pathname.split('/').pop()) : null;
 if(editId || (url.pathname==='/api/records' && req.method==='POST')){
 const original=editId && db.prepare('SELECT type,payload FROM records WHERE id=? AND user_id=?').get(editId,user.id);
 if(editId && (!original || original.type!==body.type))return send(res,404,{error:'Запись не найдена'});
 if(typeof body.type!=='string'||!Object.hasOwn(recordRanges, body.type)||!/^\d{4}-\d{2}-\d{2}$/.test(body.date)||!body.payload||typeof body.payload!=='object'||Array.isArray(body.payload))return send(res,400,{error:'Некорректная запись'});
 const instant = new Date(body.date + 'T12:00:00Z');
 if (!Number.isFinite(instant.getTime()) || instant.toISOString().slice(0,10) !== body.date) {
   return send(res,400,{error:'Проверьте дату записи'});
 }
 const now = new Date();
 const localToday = new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10);
 if (body.date > localToday) return send(res,400,{error:'Можно добавлять записи только за сегодня и прошедшие дни'});
 const p=body.payload;
 if(p.time!==undefined && (typeof p.time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(p.time)))return send(res,400,{error:'Проверьте время'});
 if(body.type==='recipe' && (!Array.isArray(p.ingredients)||!p.ingredients.length||p.ingredients.length>100||p.ingredients.some(i=>!i||typeof i.name!=='string'||!i.name.trim()||!Number.isFinite(i.grams)||i.grams<=0||['kcal','protein','fat','carbs'].some(k=>!Number.isFinite(i[k])||i[k]<0))))return send(res,400,{error:'Проверьте ингредиенты'});
 const invalidNumber = Object.entries(recordRanges[body.type]).some(([key, [min, max]]) =>
   !Number.isFinite(p[key]) || p[key] < min || p[key] > max);
 const invalidName = namedRecords.has(body.type) &&
   (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 100);
 const invalidMeasurement = body.type === 'weight' && ['waist', 'hips'].some(key =>
   p[key] !== undefined && (!Number.isFinite(p[key]) || p[key] < 1 || p[key] > 300));
 if (invalidNumber || invalidName || invalidMeasurement || (body.type === 'activity' && !p.minutes && !p.steps)) {
   return send(res, 400, {error: 'Проверьте значения записи'});
 }
 if(original){
   const createdAt=JSON.parse(original.payload).createdAt;
   db.prepare('UPDATE records SET date=?,payload=? WHERE id=? AND user_id=?').run(body.date,JSON.stringify({...p,createdAt}),editId,user.id);
   return send(res,200,{id:editId,createdAt});
 }
 const createdAt=new Date().toISOString();
 const result=db.prepare('INSERT INTO records(user_id,date,type,payload) VALUES(?,?,?,?)').run(user.id,body.date,body.type,JSON.stringify({...p,createdAt}));return send(res,201,{id:Number(result.lastInsertRowid),createdAt});
 }
 if(/^\/api\/records\/\d+$/.test(url.pathname)&&req.method==='DELETE'){db.prepare('DELETE FROM records WHERE id=? AND user_id=?').run(Number(url.pathname.split('/').pop()),user.id);return send(res,200,{ok:true});}
 return send(res,404,{error:'Не найдено'});
 }catch(e){console.error(e.message);send(res,500,{error:'Ошибка сервера'});}
}
const server=http.createServer(handler);if(require.main===module)server.listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1',()=>console.log('Balance: http://localhost:'+(process.env.PORT||3000)));module.exports={server,db};
