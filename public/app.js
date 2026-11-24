const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
let user,records=[],date=today(),page='Обзор',register=false;


const products=[['Овсянка на воде',88,3,1.7,15],['Яйцо варёное',155,12.6,10.6,1.1],['Куриная грудка',165,31,3.6,0],['Рис отварной',130,2.7,.3,28],['Гречка отварная',110,4.2,1.1,21],['Творог 5%',121,17,5,1.8],['Банан',89,1.1,.3,23],['Яблоко',52,.3,.2,14],['Огурец',15,.7,.1,3.6],['Лосось',208,20,13,0],['Йогурт натуральный',60,4,3,5]];

const offline = window.balanceOffline;

async function api(path, method = 'GET', data) {
  if (offline) return offline.request(path, method, data);
  let response;
  try {
    response = await fetch('/api' + path, {
      method,
      headers: data ? {'Content-Type': 'application/json'} : {},
      body: data ? JSON.stringify(data) : undefined
    });
  } catch {
    throw new Error('Сервер недоступен. Проверь соединение и попробуй снова.');
  }
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || 'Не удалось выполнить запрос');
    error.status = response.status;
    throw error;
  }
  return result;
}

let toastTimer;
function toast(message) {
  const status = $('#toast');
  clearTimeout(toastTimer);
  status.textContent = message;
  status.classList.add('show');
  toastTimer = setTimeout(() => {
    status.classList.remove('show');
    status.textContent = '';
  }, 3500);
}
const defaultGoals = {calories: 2000, water: 2000, steps: 8000, protein: 100, fat: 70, carbs: 240};
const day = type => records.filter(row => row.date === date && row.type === type);
const sum = (type, key) => total(day(type), key);
const total = (rows, key) => rows.reduce((value, row) => value + (Number(row.payload[key]) || 0), 0);
const settings = () => {
  const latest = records.reduce((match, row) =>
    row.type === 'settings' && (!match || row.id > match.id) ? row : match, null);
  return {...defaultGoals, ...latest?.payload};
};
const fmt = value => Math.round(value * 10) / 10;
const displayNumber = new Intl.NumberFormat('ru-RU', {maximumFractionDigits: 1});
const dayPlural = new Intl.PluralRules('ru-RU');
const dateLabel = new Intl.DateTimeFormat('ru-RU', {day: 'numeric', month: 'long', weekday: 'long'});

function auth() {
  const title = register ? 'Создать аккаунт' : 'Войти в дневник';
  $('#app').innerHTML = `
    <main class="auth">
      <section class="welcome">
        <div class="brand"><img src="/icon.svg" alt="" width="38" height="38">Баланс</div>
        <div class="welcome-copy">
          <h1>Дневник заботы<br>о себе</h1>
          <p>Питание, движение и отдых в одном месте.</p>
        </div>
      </section>
      <section class="authform">
        <h2>${title}</h2>
        <form id="authform">
          ${register ? '<label>Имя<input name="name" required maxlength="60" autocomplete="given-name"></label>' : ''}
          <label>Электронная почта<input type="email" name="email" required maxlength="254" autocomplete="email"></label>
          <label>Пароль<input type="password" name="password" minlength="8" maxlength="128" required
            autocomplete="${register ? 'new-password' : 'current-password'}"
            ${register ? 'aria-describedby="password-hint"' : ''}></label>
          ${register ? '<small id="password-hint">От 8 до 128 символов</small>' : ''}
          <p id="error" role="alert"></p>
          <button class="primary">${register ? title : 'Войти'}</button>
        </form>
        <button id="toggle" class="textbtn">${register ? 'Уже есть аккаунт? Войти' : 'Зарегистрироваться'}</button>
      </section>
    </main>`;
  $('#toggle').onclick = () => {
    register = !register;
    auth();
    $('#authform input').focus();
  };
  $('#authform').onsubmit = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button');
    const error = $('#error');
    error.textContent = '';
    button.disabled = true;
    $('#toggle').disabled = true;
    try {
      const account = await api(register ? '/register' : '/login', 'POST', Object.fromEntries(new FormData(form)));
      await restoreSession(account);
    } catch (err) {
      error.textContent = err.message;
    } finally {
      button.disabled = false;
      if ($('#toggle')) $('#toggle').disabled = false;
    }
  };
}

async function startSession(account) {
  records = await api('/records');
  user = account;
  render();
}

async function restoreSession(account) {
  $('#app').innerHTML = '<main class="session-state"><p role="status">Загружаем дневник…</p></main>';
  try {
    await startSession(account || await api('/me'));
  } catch (error) {
    if (error.status === 401) {
      auth();
      return;
    }
    $('#app').innerHTML = '<main class="session-state"><p role="alert"></p><button class="primary">Повторить</button></main>';
    $('.session-state p').textContent = error.message;
    $('.session-state button').onclick = () => restoreSession();
  }
}

function metric(label, value, unit, goal, color = 'green') {
  return `<article class="card metric ${color}">
    <h3>${label}</h3>
    <div class="metric-value"><strong>${displayNumber.format(value)}</strong> <small>${unit}</small></div>
    <progress max="${goal}" value="${value}" aria-label="${label}, прогресс к цели"></progress>
    <small>Цель ${displayNumber.format(goal)} ${unit}</small>
  </article>`;
}

function entryTime(record){if(record.payload.time)return '<small>Время записи · '+esc(record.payload.time)+'</small>';const value=record.payload.createdAt;const instant=new Date(value);if(!value||!Number.isFinite(instant.getTime()))return '<small class="entrytime">Время не сохранено</small>';const time=instant.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});const full=instant.toLocaleString('ru-RU');return `<small class="entrytime"><time datetime="${esc(instant.toISOString())}" title="${esc(full)}">Добавлено в ${esc(time)}</time></small>`;}
const awardRules=[
    ['water','ml','water','Водный баланс'],['activity','steps','steps','В движении'],
    ['food','kcal','calories','Цель по энергии'],['food','protein','protein','Цель по белкам'],
    ['food','fat','fat','Цель по жирам'],['food','carbs','carbs','Цель по углеводам']
  ];
function dailyAwards(selectedDate) {
  const goals = {...defaultGoals};

  const totals={}, awards=new Map();
  const timeline=records.filter(r=>r.type==='settings'||r.date===selectedDate).sort((a,b)=>a.id-b.id);
  for(const row of timeline){
    if(row.type==='settings'){Object.assign(goals,row.payload);continue}
    for(const [type,field,key,title] of awardRules){
      if(row.type!==type)continue;
      const before=totals[key]||0;
      totals[key]=before+(Number(row.payload[field])||0);
      if(!awards.has(key)&&before<goals[key]&&totals[key]>=goals[key]) awards.set(key,{title,id:row.id});
    }
  }
  return [...awards.values()];
}
function awardPanel(){
  const earned = new Set(dailyAwards(date).map(award => award.title));
  const badges = awardRules.map(([, , , title]) => {
    const done = earned.has(title);
    const status = done ? 'Цель достигнута' : 'Цель ещё не достигнута';
    return '<span class="'+(done?'achieved':'pending')+'" aria-label="'+title+'. '+status+'" title="'+status+'">'+(done?'✓':'◇')+' '+title+'</span>';
  });
  return panel('Награды за день','<div class="awards">'+badges.join('')+'</div>');
}

function entrySummary(type, payload) {
  switch (type) {
    case 'food':
      return [payload.meal, payload.grams + ' г', fmt(payload.kcal) + ' ккал',
        `Б ${fmt(payload.protein)} / Ж ${fmt(payload.fat)} / У ${fmt(payload.carbs)}`].filter(Boolean).join(' · ');
    case 'water': return `${payload.ml} мл`;
    case 'activity': return `${payload.minutes} мин · ${payload.steps || 0} шагов`;
    case 'sleep': return `${payload.hours} ч · качество ${payload.quality}/5`;
    case 'weight':
      return [payload.kg + ' кг', payload.waist && `талия ${payload.waist} см`,
        payload.hips && `бёдра ${payload.hips} см`].filter(Boolean).join(' · ');
    default: return 'Выполнено';
  }
}

function list(type) {
  const rows = day(type).reverse();
  if (!rows.length) return '<div class="empty">За этот день пока нет записей.</div>';
  const awards = dailyAwards(date);
  const fallback = {water: 'Вода', weight: 'Замеры', sleep: 'Сон'}[type] || 'Запись';
  return rows.map(row => `<div class="entry">
    <div><b>${esc(row.payload.name || fallback)}</b>
      <small>${esc(entrySummary(type, row.payload))}</small>
      ${entryTime(row)}
      ${awards.filter(award => award.id === row.id).map(award => `<small class="earned">✦ ${award.title}</small>`).join('')}
    </div>
    <button class="soft" data-edit="${row.id}">Изменить</button>
    <button class="remove" data-delete="${row.id}" aria-label="Удалить запись">×</button>
  </div>`).join('');
}

function panel(title,content,action='',heading='h2'){return `<section class="card"><div class="sectionhead"><${heading}>${title}</${heading}>${action}</div>${content}</section>`}
function addButton(type,label){return `<button data-add="${type}" class="soft">+ ${label}</button>`}
function previousDay(end, offset) {
  const day = new Date(end + 'T12:00:00Z');
  day.setUTCDate(day.getUTCDate() - offset);
  return day.toISOString().slice(0,10);
}
function weekEnding(end) {
  return Array.from({length:7}, (_, index) => previousDay(end,6-index));
}
function weeklyCharts() {
  const days = weekEnding(date);
  const metrics = [
    ['Питание','food','kcal','ккал'], ['Вода','water','ml','мл'],
    ['Шаги','activity','steps','шагов'], ['Тренировки','activity','minutes','мин'],
    ['Сон','sleep','hours','ч']
  ];
  return '<h2>Динамика за 7 дней</h2><div class="trendgrid">' + metrics.map(([title,type,key,unit]) => {
    const values = days.map(day => {
      const entries = records.filter(row => row.date===day && row.type===type);
      return entries.length ? fmt(total(entries, key)) : null;
    });
    const peak = Math.max(1,...values);
    const bars = days.map((day,index)=>{
      const value=values[index];
      return '<div title="'+day+' · '+(value===null?'Нет записей':value+' '+unit)+'"><b>'+(value??'—')+'</b><div class="bar" style="height:'+((value||0)/peak*75)+'px"></div><small>'+day.slice(8)+'.'+day.slice(5,7)+'</small></div>';
    }).join('');
    return panel(title+' · '+unit,'<div class="chart trend">'+bars+'</div>', '', 'h3');
  }).join('')+'</div><small>Прочерк означает, что за день нет записей.</small>';
}
function consistency() {
  const active = new Set(records.filter(row=>!['settings','recipe'].includes(row.type)).map(row=>row.date));
  const days = weekEnding(date);
  let cursor = date;
  if(date===today() && !active.has(date)) cursor=previousDay(date,1);
  let streak=0;
  while(active.has(cursor)){streak++;cursor=previousDay(cursor,1)}
  const unit = {one: 'день', few: 'дня', many: 'дней'}[dayPlural.select(streak)];
  const count=days.filter(day=>active.has(day)).length;
  const marks=days.map(day=>{
    const label=new Date(day+'T12:00:00').toLocaleDateString('ru-RU',{weekday:'short'});
    const done=active.has(day);
    return '<div title="'+day+'"><span>'+label+'</span><b aria-label="'+(done?'Есть запись':'Нет записей')+'" class="'+(done?'marked':'')+'">'+(done?'✓':'·')+'</b></div>';
  }).join('');
  return '<section class="streak"><div><h2>Регулярность дневника</h2><strong>'+streak+'</strong> '+unit+' подряд<p>За последние 7 дней с записями: '+count+'</p></div><div class="weekmarks">'+marks+'</div></section>';

}
const weekdays=['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
function reminders(){
  try{return JSON.parse(localStorage.getItem('balance.reminders.'+user.id)||'[]')}catch{return []}
}
function storeReminders(items){localStorage.setItem('balance.reminders.'+user.id,JSON.stringify(items))}
let soundContext;
function enableSound(){
  const Engine=window.AudioContext||window.webkitAudioContext;
  if(!Engine)return;
  try{soundContext ||= new Engine(); soundContext.resume().catch(()=>{});}catch{}
}
document.addEventListener('click',enableSound,{once:true});
function ring(){
  if(soundContext?.state!=='running')return;
  const start=soundContext.currentTime;
  for(const [delay,frequency] of [[0,660],[0.24,880]]){
    const tone=soundContext.createOscillator(),gain=soundContext.createGain();
    const at=start+delay;
    tone.frequency.value=frequency;
    gain.gain.setValueAtTime(0.001,at);
    gain.gain.exponentialRampToValueAtTime(0.14,at+0.02);
    gain.gain.exponentialRampToValueAtTime(0.001,at+0.32);
    tone.connect(gain);gain.connect(soundContext.destination);
    tone.start(at);tone.stop(at+0.34);
  }
}
async function deliverReminder(message,water=false){
  let box=document.getElementById('reminderAlert');
  if(!box){
    box=document.createElement('dialog');box.id='reminderAlert';
    box.setAttribute('aria-label','Напоминание');
    box.innerHTML='<h2>Напоминание</h2><div role="alert"></div><button class="primary">Понятно</button>';
    document.body.append(box);
    box.querySelector('button').onclick=()=>box.close();
    box.onclose=()=>box.remove();
  }
  const line=document.createElement('p');line.textContent=message;box.querySelector('[role=alert]').append(line);
  if(water){
    const actions=document.createElement('div');
    actions.innerHTML='<button>Выпил 250 мл</button> <button>Через 15 минут</button>';
    line.after(actions);
    actions.children[0].onclick=async()=>{if(await save('water',{ml:250},null,today()))box.close()};
    actions.children[1].onclick=()=>{storeReminders([...reminders(),{id:Date.now(),name:'Пора выпить воды',minutes:15,due:Date.now()+900000,enabled:true}]);box.close()};
  }
  if(!box.open)box.showModal();
  ring();
  if(window.Notification?.permission==='granted'){
    try{
      const registration=await navigator.serviceWorker?.getRegistration();
      if(registration)await registration.showNotification('Баланс · Напоминание',{body:message,icon:'/icon.svg'});
      else new Notification('Баланс · Напоминание',{body:message});
    }catch{line.append(' (Браузер не смог показать системное уведомление.)')}
  }
}

function reminderView(){
  const items=reminders().map(item=>{
    const schedule=item.due?new Date(item.due).toLocaleString('ru-RU'):item.time+' · '+item.days.map(d=>weekdays[d]).join(', ');
    return '<div class="entry"><div><b>'+esc(item.name)+'</b><small>'+esc(schedule)+(item.enabled?'':' · На паузе')+'</small></div><div><button data-switch="'+item.id+'">'+(item.enabled?'Пауза':'Включить')+'</button> <button data-drop="'+item.id+'" aria-label="Удалить напоминание">×</button></div></div>';
  }).join('');
  const checks=[1,2,3,4,5,6,0].map(d=>'<label><input type="checkbox" name="weekday" value="'+d+'" checked>'+weekdays[d]+'</label>').join('');
  const systemButton = offline ? '' : ' <button id="systemAlerts">Системные уведомления</button>';
  return panel('Сигнал напоминания','<button id="signalTest">Проверить звук и сообщение</button>' + systemButton + '<p id="notifyStatus" role="status"></p>')+panel('Мои напоминания',items||'<p>Пока нет напоминаний.</p>')+
    panel('Новое расписание','<form id="schedule" class="formgrid"><label>О чём напомнить<input name="message" placeholder="Например, размяться" maxlength="100" required></label><label>Время<input type="time" name="time" value="09:00" required></label><fieldset class="days"><legend>Повторять по дням</legend>'+checks+'</fieldset><button class="primary">Добавить расписание</button></form>')+
    panel('Разовое напоминание о воде','<label>Через сколько минут<input type="number" id="delay" min="1" max="1440" value="30" required></label><button id="remind">Запустить таймер</button>')+
    (offline ? '<p class="muted">Оставь приложение открытым, чтобы услышать сигнал. Расписания хранятся на этом телефоне.</p>'
      : '<p class="muted">Расписания сохраняются в этом браузере для твоего аккаунта. Оставьте приложение открытым. При приостановке вкладки сигнал может появиться после возвращения.</p>');
}
function checkReminders(){
  if(!user)return;
  const now=new Date(),time=now.toTimeString().slice(0,5),items=reminders(),due=[];
  for(const item of items){
    if(!item.enabled)continue;
    if(item.due ? now.getTime()>=item.due : item.time<=time && new Date(today()+'T'+item.time+':59').getTime()>=(item.enabledSince||item.id) && item.days.includes(now.getDay()) && item.last!==today()){
      due.push(item.name);item.last=today();
    }
  }
  if(!due.length)return;
  storeReminders(items.filter(i=>!(i.enabled && i.due && i.due<=now.getTime())));
  if(page==='Напоминания')render();
  deliverReminder(due.join(' · '),due.some(text=>/вод[ауые]/i.test(text)));
}
setInterval(checkReminders,5000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkReminders()});
function bindReminders(){
  const status=$('#notifyStatus');
  function permissionStatus(){
    status.textContent=({granted:'Системные уведомления разрешены.',denied:'Системные уведомления заблокированы. Разрешите их в настройках сайта.',default:'Для системных уведомлений нужно разрешение браузера.'})[window.Notification?.permission]||'Доступны звук и сообщение внутри приложения.';
  }
  permissionStatus();
  const systemAlerts = $('#systemAlerts');
  if (systemAlerts) systemAlerts.onclick=async()=>{
    enableSound();
    try{if(window.Notification?.permission==='default')await Notification.requestPermission();permissionStatus()}
    catch{status.textContent='Проверьте разрешения уведомлений в настройках браузера.'}
  };
  $('#signalTest').onclick=async()=>{enableSound();if(soundContext)await soundContext.resume().catch(()=>{});deliverReminder('Проверка напоминания')};
  function update(items){storeReminders(items);render()}
  $('#schedule').onsubmit=e=>{
    e.preventDefault();
    const data=new FormData(e.target),days=data.getAll('weekday').map(Number),name=data.get('message').trim();
    if(!days.length||!name)return toast('Введите текст и выберите дни недели');
    update([...reminders(),{id:Date.now(),name,time:data.get('time'),days,enabled:true}]);
  };
  $('#remind').onclick=()=>{
    const input=$('#delay');
    if(!input.reportValidity())return;
    const minutes=input.valueAsNumber;
    update([...reminders(),{id:Date.now(),name:'Пора выпить воды',minutes,due:Date.now()+minutes*60000,enabled:true}]);
  };
  document.querySelectorAll('[data-drop]').forEach(b=>b.onclick=()=>update(reminders().filter(i=>i.id!==Number(b.dataset.drop))));
  document.querySelectorAll('[data-switch]').forEach(b=>b.onclick=()=>update(reminders().map(i=>{
    if(i.id!==Number(b.dataset.switch))return i;
    if(i.due&&!i.enabled)i.due=Date.now()+i.minutes*60000;
    return {...i,enabled:!i.enabled,enabledSince:Date.now()};
  })));
}

function navigationIcon(page) {
  const drawings = {
    'Обзор': '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    'Питание': '<path fill="#dbe9ad" d="M13 2.5c3.2-.9 5.1 1.3 5.2 4.6.1 2.7 2 4.6 2 7.2a8 8 0 0 1-15.8 1.6c-.6-3.2 1.3-5.7 3.4-7.8 2.1-2 2.5-4.8 5.2-5.6Z"/><ellipse cx="12" cy="14.8" rx="3.5" ry="4" fill="#a67a52" stroke="#77573b"/>',
    'Активность': '<circle cx="15" cy="4" r="2" fill="currentColor" stroke="none"/><path d="m5 10 4-3 4.5.8 2.5 4 4-1M13 8l-3 6 4.5 2.5-2 5M10 14l-3 4H2"/>',
    'Прогресс': '<path d="M3 19c6-1 10-5 16-14m-6 1 6-1 .5 6"/>'
  };
  if (!drawings[page]) return {'Сон и привычки':'☾','Напоминания':'◷','Настройки':'⚙'}[page];
  return '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle">'+drawings[page]+'</svg>';
}

function overviewView(goals) {
  const sunday = new Date(date + 'T12:00:00').getDay() === 0;
  return `<section class="overview-hero">
    <div><p class="overview-date">${dateLabel.format(new Date(date + 'T12:00:00'))}</p>
      <h2>${date === today() ? 'Сегодня в дневнике' : 'Дневник за выбранный день'}</h2>
      <p>Питание, вода, движение и сон.</p></div>
    <div class="overview-art" aria-hidden="true"></div>
  </section>
  <div class="metrics">
    ${metric('Питание', sum('food','kcal'), 'ккал', goals.calories)}
    ${metric('Вода', sum('water','ml'), 'мл', goals.water, 'blue')}
    ${metric('Движение', sum('activity','steps'), 'шагов', goals.steps, 'peach')}
    ${metric('Сон', sum('sleep','hours'), 'ч', 8, 'purple')}
  </div>
  <div class="overview-details">${consistency()}${awardPanel()}</div>
  ${sunday ? weekReport() : ''}`;
}

function nutritionView(goals) {
  return `<div class="metrics">
    ${metric('Энергия', sum('food','kcal'), 'ккал', goals.calories)}
    ${metric('Белки', sum('food','protein'), 'г', goals.protein, 'blue')}
    ${metric('Жиры', sum('food','fat'), 'г', goals.fat, 'peach')}
    ${metric('Углеводы', sum('food','carbs'), 'г', goals.carbs, 'purple')}
  </div>
  <div class="columns">
    ${panel('Приёмы пищи', list('food'), addButton('food','Добавить еду'))}
    ${panel('Вода в течение дня', `<p class="waterbig">${displayNumber.format(sum('water','ml'))} <small>/ ${displayNumber.format(goals.water)} мл</small></p>
      <div class="quick">${[150, 250, 500].map(ml => `<button data-water="${ml}">+ ${ml} мл</button>`).join('')}</div>${list('water')}`)}
  </div>
  ${foodLibrary()}`;
}

function progressView() {
  const weights = records.filter(row => row.type === 'weight' && row.date <= date)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id).slice(-14);
  const peak = Math.max(1, ...weights.map(row => row.payload.kg));
  const chart = weights.length
    ? `<div class="chart">${weights.map(row => `<div><b>${esc(row.payload.kg)}</b><div class="bar"
        style="height:${Math.max(4, row.payload.kg / peak * 130)}px"></div><small>${esc(row.date.slice(5))}</small></div>`).join('')}</div>`
    : '<p class="empty">Добавь замеры, чтобы увидеть изменения.</p>';
  return panel('Вес и замеры', list('weight'), addButton('weight', 'Добавить замеры'))
    + panel('Последние 14 измерений', chart) + weeklyCharts() + weekReport();
}

function settingsView(goals) {
  const fields = [['calories','Энергия, ккал'], ['protein','Белки, г'], ['fat','Жиры, г'],
    ['carbs','Углеводы, г'], ['water','Вода, мл'], ['steps','Шаги']];
  const backupActions = offline
    ? '<p class="muted">Записи хранятся на этом телефоне. Сохрани копию или перенеси записи из веб-версии.</p>' +
      '<div class="quick"><button id="export" class="soft">Экспортировать данные</button>' +
      '<button id="import" class="soft">Импортировать JSON</button></div><input id="import-file" type="file" hidden>'
    : '<p class="muted">Скачай свои записи в формате JSON.</p><button id="export" class="soft">Экспортировать данные</button>';
  return panel('Дневные цели', `<form id="goals" class="formgrid">
    ${fields.map(([key, label]) => `<label>${label}<input name="${key}" type="number" min="1"
          max="100000" required value="${esc(goals[key])}"></label>`).join('')}
    <button class="primary">Сохранить цели</button>
  </form>`) + panel('Копия дневника', backupActions);
}

const views = {
  'Обзор': overviewView,
  'Питание': nutritionView,
  'Активность': goals => `<div class="metrics metrics-activity">
    ${metric('Шаги', sum('activity','steps'), 'шагов', goals.steps)}
    ${metric('Движение', sum('activity','minutes'), 'мин', 30, 'peach')}
  </div>${panel('Тренировки и прогулки', list('activity'), addButton('activity','Активность'))}`,
  'Сон и привычки': () => `<div class="columns">
    ${panel('Восстановление', list('sleep'), addButton('sleep','Записать сон'))}
    ${panel('Мои привычки', list('habit'), addButton('habit','Отметить привычку'))}
  </div>`,
  'Прогресс': progressView,
  'Напоминания': reminderView,
  'Настройки': settingsView
};

function render() {
  const app = $('#app');
  const active = document.activeElement;
  const navigationScroll = app.querySelector('nav')?.scrollLeft || 0;
  const overview = page === 'Обзор';
  const showDate = !['Настройки', 'Напоминания'].includes(page);
  app.innerHTML = `
    <a class="skip-link" href="#content">К содержимому</a>
    <aside class="sidebar">
      <div class="brand"><img src="/icon.svg" alt="" width="38" height="38">Баланс</div>
      <nav aria-label="Разделы дневника">${Object.keys(views).map(name => `
        <button data-page="${name}" ${page === name ? 'class="active" aria-current="page"' : ''}>
          <span aria-hidden="true">${navigationIcon(name)}</span>${name}
        </button>`).join('')}
      </nav>
      ${offline ? '' : `<div class="sidebarfoot">
        <span class="avatar" aria-hidden="true">${esc(user.name.slice(0,1))}</span>
        <b>${esc(user.name)}</b><button id="logout" class="textbtn">Выйти</button>
      </div>`}
    </aside>
    <main id="content" class="main" tabindex="-1">
      <header class="page-header"><div>
        ${overview ? '<p class="page-label">Обзор</p>' : ''}
        <h1>${overview ? (offline ? esc(user.name) : 'Привет, ' + esc(user.name)) : page}</h1>
      </div>
      ${showDate ? `<label class="date">Дата дневника<input id="date" type="date" max="${today()}" value="${date}"></label>` : ''}
      </header>
      ${views[page](settings())}
    </main>`;
  $('nav').scrollLeft = navigationScroll;
  if (active?.id === 'date') $('#date')?.focus({preventScroll: true});
  if (active?.dataset.page) $('nav .active').focus({preventScroll: true});
  bindPage();
}

function bindPage() {
  document.querySelectorAll('[data-page]').forEach(button => {
    button.onclick = () => {
      page = button.dataset.page;
      render();
      window.scrollTo(0, 0);
    };
  });
  const picker = $('#date');
  if (picker) picker.onchange = () => {
    date = picker.value && picker.value <= today() ? picker.value : today();
    render();
  };
  const logout = $('#logout');
  if (logout) logout.onclick = async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await api('/logout', 'POST');
      user = null;
      records = [];
      date = today();
      page = 'Обзор';
      register = false;
      $('#dialog').close();
      $('#reminderAlert')?.close();
      auth();
    } catch (error) {
      toast(error.message);
    } finally {
      button.disabled = false;
    }
  };
  document.querySelectorAll('[data-add]').forEach(button => {
    button.onclick = () => openForm(button.dataset.add);
  });
  document.querySelectorAll('[data-water]').forEach(button => {
    button.onclick = () => save('water', {ml: Number(button.dataset.water)});
  });
  document.querySelectorAll('[data-delete]').forEach(button => {
    button.onclick = async () => {
      if (!confirm('Удалить эту запись?')) return;
      const owner = user;
      button.disabled = true;
      try {
        await api('/records/' + button.dataset.delete, 'DELETE');
        if (user !== owner) return;
        records = records.filter(row => row.id !== Number(button.dataset.delete));
        render();
        toast('Запись удалена');
      } catch (error) {
        toast(error.message);
      } finally {
        button.disabled = false;
      }
    };
  });
  const goals = $('#goals');
  if (goals) goals.onsubmit = event => {
    event.preventDefault();
    save('settings', Object.fromEntries([...new FormData(goals)].map(([key, value]) => [key, Number(value)])));
  };
  const exportButton = $('#export');
  if (exportButton) exportButton.onclick = () => {
    const backup = JSON.stringify({user, records}, null, 2);
    if (offline) {
      window.BalanceAndroid.saveBackup(backup);
      return;
    }
    const url = URL.createObjectURL(new Blob([backup], {type: 'application/json'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'balance-diary.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importButton = $('#import');
  const input = $('#import-file');
  if (importButton) importButton.onclick = () => input.click();
  if (input) input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    input.value = '';
    importButton.disabled = true;
    try {
      const count = await offline.importBackup(file);
      await startSession(user);
      toast(count ? 'Импортировано записей: ' + count : 'Новых записей нет');
    } catch (error) {
      toast(error.message);
    } finally {
      importButton.disabled = false;
    }
  };
  bindDiaryTools();
  if (page === 'Напоминания') bindReminders();
}

let saving = false;
async function save(type, payload, editId=null, entryDate=date) {
  if (saving) return;
  saving = true;
  const owner = user;
  const entry = {date:entryDate, type, payload};
  try {
    const saved = await api(editId?'/records/'+editId:'/records',editId?'PUT':'POST',entry);
    if (user !== owner) return;
    const row={...entry,id:saved.id,payload:{...payload,createdAt:saved.createdAt}};
    if(editId)records=records.map(r=>r.id===editId?row:r);else records.push(row);
    $('#dialog').close();
    render();
    const earned=dailyAwards(entry.date).filter(a=>a.id===saved.id);
    toast(!editId && earned.length?'Награда за день: '+earned.map(a=>a.title).join(', '):'Запись сохранена');
    return true;
  } catch (error) {
    if ($('#dialog').open) {
      let message = $('#entryerror');
      if (!message) {
        message = document.createElement('p');
        message.id = 'entryerror';
        message.setAttribute('role','alert');
        $('#entryform').append(message);
      }
      message.textContent = error.message;
    } else toast(error.message);
  } finally { saving = false; }
}
function field(name,label,min=0,max=100000,step='any',required=true){return `<label>${label}<input name="${name}" type="number" min="${min}" max="${max}" step="${step}" ${required?'required':''}></label>`}
function openForm(type,seed=null,editId=null){const titles={water:'Записать воду',food:'Добавить еду',activity:'Движение',sleep:'Как ты спал(а)?',weight:'Вес и замеры',habit:'Маленькая победа'};let html='';
 if(type==='water')html=field('ml','Вода, мл',1,10000);
 if(type==='food')html=`<label>Из справочника<select id="product"><option value="">Свой продукт</option>${products.map((p,i)=>`<option value="${i}">${p[0]}</option>`).join('')}</select></label><label>Название<input name="name" required maxlength="100"></label><label>Приём пищи<select name="meal"><option>Завтрак</option><option>Обед</option><option>Ужин</option><option>Перекус</option></select></label>${field('grams','Порция, г',1,10000)}<p class="hint">Укажи значения на 100 г. Они будут пересчитаны на порцию. Справочник содержит приблизительные значения.</p>${field('kcal','Ккал на 100 г',0,1000)}${field('protein','Белки на 100 г',0,100)}${field('fat','Жиры на 100 г',0,100)}${field('carbs','Углеводы на 100 г',0,100)}`;
 if(type==='activity')html=`<label>Занятие<input name="name" required maxlength="100" placeholder="Например, прогулка"></label>${field('minutes','Продолжительность, мин',0,1440)}${field('steps','Шаги',0,100000,'1')}`;
 if(type==='sleep')html=`${field('hours','Продолжительность сна, ч',.1,24,'.1')}<label>Качество сна<select name="quality"><option value="3">3 — нормально</option><option value="1">1 — плохо</option><option value="2">2 — ниже среднего</option><option value="4">4 — хорошо</option><option value="5">5 — отлично</option></select></label>`;
 if(type==='weight')html=field('kg','Вес, кг',1,500,'.1')+field('waist','Талия, см',1,300,'.1',false)+field('hips','Бёдра, см',1,300,'.1',false);
 if(type==='habit')html='<label>Что получилось сегодня?<input name="name" required maxlength="100" placeholder="Например, 10 минут чтения"></label>';
 $('#dialog').innerHTML=`<div class="sectionhead"><h2 id="entry-title">${editId?'Изменить запись':titles[type]}</h2><button id="close" aria-label="Закрыть">×</button></div><form id="entryform" class="formgrid">${html}<label>Время<input type="time" name="time"></label><button class="primary">Сохранить</button></form>`;$('#dialog').showModal();$('#close').onclick=()=>$('#dialog').close();
 if(type==='food')$('#product').onchange=e=>{if(e.target.value==='')return;const p=products[Number(e.target.value)],f=$('#entryform');['name','kcal','protein','fat','carbs'].forEach((k,i)=>f.elements[k].value=p[i]);f.elements.grams.value=100};
 const form=$('#entryform');
 form.elements.time.value=new Date().toTimeString().slice(0,5);
 if(seed){for(const [key,val] of Object.entries(seed)){if(form.elements[key])form.elements[key].value=type==='food'&&nutrients.includes(key)?Number((val*100/seed.grams).toFixed(6)):val}}
 $('#entryform').onsubmit=e=>{e.preventDefault();const p={};for(const [k,v] of new FormData(e.target)){if(v==='')continue;p[k]=['name','meal','time'].includes(k)?v:Number(v)}if(type==='food')for(const key of ['kcal','protein','fat','carbs'])p[key]=Math.round(p[key]*p.grams)/100;save(type,p,editId)};
}
const nutrients=['kcal','protein','fat','carbs'];
function yesterdayMeals(){
  const meals=new Map();
  for(const row of records.filter(r=>r.type==='food' && r.date===previousDay(date,1))){
    const p=row.payload,group=meals.get(p.meal)||{meal:p.meal,names:[],grams:0,kcal:0,protein:0,fat:0,carbs:0};
    group.names.push(p.name);
    for(const key of ['grams',...nutrients])group[key]+=p[key];
    meals.set(p.meal,group);
  }
  return [...meals.values()].map(g=>({...g,name:g.names.join(', ').slice(0,100)}));
}
function foodLibrary(){
  const meals=yesterdayMeals().map((m,i)=>'<p><button data-repeat="'+i+'">'+esc(m.meal)+'</button> '+esc(m.name)+' · '+fmt(m.grams)+' г</p>').join('');
  const recipes=records.filter(r=>r.type==='recipe').map(r=>'<p><button data-dish="'+r.id+'">'+esc(r.payload.name)+'</button> · выход '+r.payload.grams+' г</p>').join('');
  return panel('Повторить вчерашний приём пищи',meals||'<small>За предыдущий день пока нет записей о еде.</small>')+
    panel('Мои рецепты',recipes||'<small>Сохрани состав блюда, чтобы добавлять его порциями.</small>','<button id="newrecipe">Создать рецепт</button>');
}
function weekReport(){
  const end=previousDay(date,(new Date(date+'T12:00:00').getDay())%7);
  const days=weekEnding(end);
  const rows=records.filter(r=>days.includes(r.date)&&!['recipe','settings'].includes(r.type));
  const totals=(type,key)=>days.map(day=>{
    const entries=rows.filter(r=>r.date===day&&r.type===type);
    return entries.length?total(entries, key):null;
  });
  const steps=totals('activity','steps'),sleep=totals('sleep','hours');
  const peak=Math.max(...steps.filter(n=>n!==null));
  const nights=sleep.filter(n=>n!==null);
  const delta=nights.at(-1)-nights[0];
  return panel('Итоги недели · '+days[0].slice(5)+' — '+end.slice(5),
    '<p>Дней с записями: '+new Set(rows.map(r=>r.date)).size+' из 7.</p><p>'+
    (Number.isFinite(peak)?'Больше всего шагов: '+peak+' ('+days.filter((_,i)=>steps[i]===peak).join(', ')+').':'Шаги за неделю не записаны.')+'</p><p>'+
    (nights.length<2?'Для сравнения сна нужны записи хотя бы за две ночи.':'Сон в первую и последнюю отмеченные ночи: '+fmt(nights[0])+' и '+fmt(nights.at(-1))+' ч. Изменение: '+(delta>0?'+':'')+fmt(delta)+' ч.')+'</p>');
}
function recipeForm(){
  const dialog=$('#dialog');
  dialog.innerHTML='<div class="sectionhead"><h2 id="entry-title">Новый рецепт</h2><button id="close">Закрыть</button></div><form id="entryform"><label>Название блюда<input name="dish" maxlength="100" required></label>'+field('yield','Вес готового блюда, г',1,10000)+'<div id="ingredients"></div><button type="button" id="another">Добавить ингредиент</button> <button class="primary">Сохранить рецепт</button></form>';
  function add(){
    const row=document.createElement('fieldset');
    row.innerHTML='<legend>Ингредиент</legend><label>Продукт<select><option value="">Свой продукт</option>'+products.map((p,i)=>'<option value="'+i+'">'+esc(p[0])+'</option>').join('')+'</select></label><label>Название<input name="ingredient" required maxlength="100"></label>'+field('amount','Масса, г',0.1,10000)+nutrients.map((k,i)=>field(k,['Ккал','Белки','Жиры','Углеводы'][i]+' на 100 г',0,i?100:1000)).join('')+'<button type="button">Убрать</button>';
    row.querySelector('select').onchange=e=>{if(e.target.value==='')return;const p=products[Number(e.target.value)];['ingredient',...nutrients].forEach((k,i)=>row.elements[k].value=p[i])};
    row.querySelector('button').onclick=()=>{if($('#ingredients').children.length>1)row.remove()};
    $('#ingredients').append(row);
  }
  add();$('#another').onclick=add;$('#close').onclick=()=>dialog.close();dialog.showModal();
  $('#entryform').onsubmit=e=>{
    e.preventDefault();const form=e.target;
    const ingredients=[...form.querySelectorAll('fieldset')].map(row=>({
      name:row.elements.ingredient.value,grams:row.elements.amount.valueAsNumber,
      ...Object.fromEntries(nutrients.map(k=>[k,row.elements[k].valueAsNumber]))
    }));
    save('recipe',{name:form.elements.dish.value,grams:form.elements.yield.valueAsNumber,ingredients});
  };
}
function bindDiaryTools(){
  document.querySelectorAll('[data-edit]').forEach(button=>button.onclick=()=>{
    const row=records.find(r=>r.id===Number(button.dataset.edit));
    const seed={...row.payload};
    if(!seed.time && seed.createdAt)seed.time=new Date(seed.createdAt).toTimeString().slice(0,5);
    openForm(row.type,seed,row.id);
  });
  document.querySelectorAll('[data-repeat]').forEach(b=>b.onclick=()=>openForm('food',yesterdayMeals()[Number(b.dataset.repeat)]));
  document.querySelectorAll('[data-dish]').forEach(b=>b.onclick=()=>{
    const dish=records.find(r=>r.id===Number(b.dataset.dish)).payload;
    const seed={name:dish.name,grams:100};
    for(const k of nutrients)seed[k]=dish.ingredients.reduce((n,i)=>n+i[k]*i.grams,0)/dish.grams;
    openForm('food',seed);
  });
  if($('#newrecipe'))$('#newrecipe').onclick=recipeForm;
}
if (offline) window.balanceBack = () => {
  const dialog = [...document.querySelectorAll('dialog[open]')].at(-1);
  if (dialog) {
    dialog.close();
    return true;
  }
  if (user && page !== 'Обзор') {
    page = 'Обзор';
    render();
    window.scrollTo(0, 0);
    return true;
  }
  return false;
};
restoreSession();
if (!offline && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

