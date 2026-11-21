const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
let user,records=[],date=today(),page='Обзор',register=false;
const pages=['Обзор','Питание','Активность','Сон и привычки','Прогресс','Напоминания','Настройки'];
const products=[['Овсянка на воде',88,3,1.7,15],['Яйцо варёное',155,12.6,10.6,1.1],['Куриная грудка',165,31,3.6,0],['Рис отварной',130,2.7,.3,28],['Гречка отварная',110,4.2,1.1,21],['Творог 5%',121,17,5,1.8],['Банан',89,1.1,.3,23],['Яблоко',52,.3,.2,14],['Огурец',15,.7,.1,3.6],['Лосось',208,20,13,0],['Йогурт натуральный',60,4,3,5]];
async function api(path,method='GET',data){const r=await fetch('/api'+path,{method,headers:{'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});const result=await r.json();if(!r.ok)throw Error(result.error);return result;}
function toast(s){$('#toast').textContent=s;$('#toast').classList.add('show');setTimeout(()=>$('#toast').classList.remove('show'),3500)}
const day=type=>records.filter(r=>r.date===date&&r.type===type),sum=(type,key)=>day(type).reduce((n,r)=>n+(Number(r.payload[key])||0),0);
const settings=()=>({...{calories:2000,water:2000,steps:8000,protein:100,fat:70,carbs:240},...records.filter(r=>r.type==='settings').sort((a,b)=>a.id-b.id).at(-1)?.payload});
const fmt=n=>Math.round(n*10)/10;
function auth(){ $('#app').innerHTML=`<main class="auth"><section class="welcome"><div class="brand"><img class="brand-icon" src="/icon.svg" alt="" width="36" height="36"> Баланс</div><span class="eyebrow">МАЛЕНЬКИЕ ШАГИ. БОЛЬШЕ ЗАБОТЫ.</span><h1>Хороший день<br>начинается с тебя.</h1><p>Питание, движение и отдых.<br>Всё, что помогает чувствовать себя лучше — в одном месте.</p><div class="leaf">✳</div><small>Твой ритм. Твои цели. Твой баланс.</small></section><section class="authform"><span class="eyebrow">ТВОЁ ПРОСТРАНСТВО ЗАБОТЫ</span><h2>${register?'Начнём знакомство':'С возвращением'}</h2><p class="muted">${register?'Создай аккаунт для своего дневника.':'Войди, чтобы продолжить свой день.'}</p><form id="authform">${register?'<label>Имя<input name="name" required maxlength="60" autocomplete="given-name"></label>':''}<label>Email<input type="email" name="email" required autocomplete="email"></label><label>Пароль<input type="password" name="password" minlength="8" maxlength="128" required autocomplete="${register?'new-password':'current-password'}" placeholder="Не менее 8 символов"></label><p id="error" role="alert"></p><button class="primary">${register?'Создать аккаунт':'Войти'}</button></form><button id="toggle" class="textbtn">${register?'Уже есть аккаунт? Войти':'Нет аккаунта? Зарегистрироваться'}</button><small>Питание, активность и самочувствие в одном месте</small></section></main>`;$('#toggle').onclick=()=>{register=!register;auth()};$('#authform').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{user=await api(register?'/register':'/login','POST',Object.fromEntries(new FormData(e.target)));await load()}catch(err){$('#error').textContent=err.message}finally{b.disabled=false}} }
async function load(){records=await api('/records');render()}
function metric(label,value,unit,goal,color='green'){return `<article class="card metric ${color}"><span>${label}</span><div><strong>${fmt(value)}</strong> <small>${unit}</small></div><progress max="${goal||1}" value="${value}"></progress><small>Цель: ${goal} ${unit}</small></article>`}
function entryTime(record){const value=record.payload.createdAt;const instant=new Date(value);if(!value||!Number.isFinite(instant.getTime()))return '<small class="entrytime">Время не сохранено</small>';const time=instant.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});const full=instant.toLocaleString('ru-RU');return `<small class="entrytime"><time datetime="${esc(instant.toISOString())}" title="${esc(full)}">Добавлено в ${esc(time)}</time></small>`;}
const awardRules=[
    ['water','ml','water','Водный баланс'],['activity','steps','steps','В движении'],
    ['food','kcal','calories','Цель по энергии'],['food','protein','protein','Цель по белкам'],
    ['food','fat','fat','Цель по жирам'],['food','carbs','carbs','Цель по углеводам']
  ];
function dailyAwards(selectedDate) {
  const goals={water:2000,steps:8000,calories:2000,protein:100,fat:70,carbs:240};

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
function list(type){const awards=dailyAwards(date);const rows=day(type).reverse();return rows.length?rows.map(r=>`<div class="entry"><div><b>${esc(r.payload.name||({water:'Вода',weight:'Замеры',sleep:'Сон'}[type])||'Запись')}</b><small>${esc(type==='food'?`${r.payload.meal} · ${r.payload.grams} г · ${fmt(r.payload.kcal)} ккал · Б ${fmt(r.payload.protein)} / Ж ${fmt(r.payload.fat)} / У ${fmt(r.payload.carbs)}`:type==='water'?`${r.payload.ml} мл`:type==='activity'?`${r.payload.minutes} мин · ${r.payload.steps||0} шагов`:type==='sleep'?`${r.payload.hours} ч · качество ${r.payload.quality}/5`:type==='weight'?`${r.payload.kg} кг${r.payload.waist?' · талия '+r.payload.waist+' см':''}${r.payload.hips?' · бёдра '+r.payload.hips+' см':''}`:'Выполнено')}</small>${entryTime(r)}${awards.filter(a=>a.id===r.id).map(a=>'<small class="earned">✦ '+a.title+'</small>').join('')}</div><button class="remove" data-delete="${r.id}" aria-label="Удалить запись">×</button></div>`).join(''):'<div class="empty">Здесь пока тихо.<br><small>Добавь первую запись за этот день.</small></div>'}
function panel(title,content,action=''){return `<section class="card"><div class="sectionhead"><h3>${title}</h3>${action}</div>${content}</section>`}
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
      return entries.length ? fmt(entries.reduce((total,row)=>total+(Number(row.payload[key])||0),0)) : null;
    });
    const peak = Math.max(1,...values);
    const bars = days.map((day,index)=>{
      const value=values[index];
      return '<div title="'+day+' · '+(value===null?'Нет записей':value+' '+unit)+'"><b>'+(value??'—')+'</b><div class="bar" style="height:'+((value||0)/peak*75)+'px"></div><small>'+day.slice(8)+'.'+day.slice(5,7)+'</small></div>';
    }).join('');
    return panel(title+' · '+unit,'<div class="chart trend">'+bars+'</div>');
  }).join('')+'</div><small>Прочерк означает, что за день нет записей.</small>';
}
function consistency() {
  const active = new Set(records.filter(row=>row.type!=='settings').map(row=>row.date));
  const days = weekEnding(date);
  let cursor = date;
  if(date===today() && !active.has(date)) cursor=previousDay(date,1);
  let streak=0;
  while(active.has(cursor)){streak++;cursor=previousDay(cursor,1)}
  const count=days.filter(day=>active.has(day)).length;
  const marks=days.map(day=>{
    const label=new Date(day+'T12:00:00').toLocaleDateString('ru-RU',{weekday:'short'});
    const done=active.has(day);
    return '<div title="'+day+'"><span>'+label+'</span><b aria-label="'+(done?'Есть запись':'Нет записей')+'" class="'+(done?'marked':'')+'">'+(done?'✓':'·')+'</b></div>';
  }).join('');
  return '<section class="streak"><div><h2>Регулярность дневника</h2><strong>'+streak+'</strong> дней подряд<p>За последние 7 дней с записями: '+count+'</p></div><div class="weekmarks">'+marks+'</div></section>';

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
async function deliverReminder(message){
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
  return panel('Сигнал напоминания','<button id="signalTest">Проверить звук и сообщение</button> <button id="systemAlerts">Системные уведомления</button><p id="notifyStatus" role="status"></p>')+panel('Мои напоминания',items||'<p>Пока нет напоминаний.</p>')+
    panel('Новое расписание','<form id="schedule" class="formgrid"><label>О чём напомнить<input name="message" placeholder="Например, размяться" maxlength="100" required></label><label>Время<input type="time" name="time" value="09:00" required></label><fieldset class="days"><legend>Повторять по дням</legend>'+checks+'</fieldset><button class="primary">Добавить расписание</button></form>')+
    panel('Разовое напоминание о воде','<label>Через сколько минут<input type="number" id="delay" min="1" max="1440" value="30" required></label><button id="remind">Запустить таймер</button>')+
    '<p class="muted">Расписания сохраняются в этом браузере для твоего аккаунта. Оставьте приложение открытым. При приостановке вкладки сигнал может появиться после возвращения.</p>';
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
  deliverReminder(due.join(' · '));
}
setInterval(checkReminders,5000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkReminders()});
function bindReminders(){
  const status=$('#notifyStatus');
  function permissionStatus(){
    status.textContent=({granted:'Системные уведомления разрешены.',denied:'Системные уведомления заблокированы. Разрешите их в настройках сайта.',default:'Для системных уведомлений нужно разрешение браузера.'})[window.Notification?.permission]||'Доступны звук и сообщение внутри приложения.';
  }
  permissionStatus();
  $('#systemAlerts').onclick=async()=>{
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

function render(){const s=settings(),k=sum('food','kcal');$('#app').innerHTML=`<aside><a class="brand" href="#"><img class="brand-icon" src="/icon.svg" alt="" width="36" height="36"> Баланс</a><p class="eyebrow">ДНЕВНИК ЗАБОТЫ О СЕБЕ</p><nav>${pages.map((p,i)=>`<button data-page="${p}" class="${page===p?'active':''}"><span>${['◫','◉','↟','☾','▥','◷','⚙'][i]}</span>${p}</button>`).join('')}</nav><div class="sidebarfoot"><div class="avatar">${esc(user.name.slice(0,1))}</div><b>${esc(user.name)}</b><button id="logout" class="textbtn">Выйти</button></div></aside><main class="main"><header><div><span class="eyebrow">КАЖДЫЙ ДЕНЬ ИМЕЕТ ЗНАЧЕНИЕ</span><h1>${page==='Обзор'?`Привет, ${esc(user.name)} ☀`:page}</h1><p class="muted">${page==='Обзор'?'Немного заботы о себе — уже отличный план.':'Сохраняй то, что важно для тебя.'}</p></div><label class="date">Твой день<input id="date" type="date" max="${today()}" value="${date}"></label></header><div id="content"></div><footer>Баланс · Твой дневник здоровья <span>В своём темпе, каждый день</span></footer></main>`;
 let content='';
 if(page==='Обзор')content=`<div class="metrics">${metric('Питание',k,'ккал',s.calories)}${metric('Вода',sum('water','ml'),'мл',s.water,'blue')}${metric('Движение',sum('activity','steps'),'шагов',s.steps,'peach')}${metric('Сон',sum('sleep','hours'),'ч',8,'purple')}</div>`;
 if(page==='Питание')content=`<div class="metrics">${metric('Энергия',k,'ккал',s.calories)}${metric('Белки',sum('food','protein'),'г',s.protein,'blue')}${metric('Жиры',sum('food','fat'),'г',s.fat,'peach')}${metric('Углеводы',sum('food','carbs'),'г',s.carbs,'purple')}</div><div class="columns">${panel('Приёмы пищи',list('food'),addButton('food','Добавить еду'))}${panel('Вода в течение дня',`<div class="waterbig">${sum('water','ml')} <small>/ ${s.water} мл</small></div><p class="muted">Небольшой глоток — простая привычка.</p><div class="quick"><button data-water="150">+ 150 мл</button><button data-water="250">+ 250 мл</button><button data-water="500">+ 500 мл</button></div>${list('water')}`)}</div>`;
 if(page==='Активность')content=`<div class="metrics">${metric('Шаги',sum('activity','steps'),'шагов',s.steps)}${metric('Движение',sum('activity','minutes'),'мин',30,'peach')}</div>${panel('Тренировки и прогулки',list('activity'),addButton('activity','Активность'))}<p class="muted">Добавляй шаги после прогулок и сохраняй свои тренировки.</p>`;
 if(page==='Сон и привычки')content=`<div class="columns">${panel('Восстановление',list('sleep'),addButton('sleep','Записать сон'))}${panel('Мои привычки',list('habit'),addButton('habit','Отметить привычку'))}</div>`;
 if(page==='Напоминания')content=reminderView();
 if(page==='Прогресс') {const weights=records.filter(r=>r.type==='weight' && r.date<=date).sort((a,b)=>a.date.localeCompare(b.date)||a.id-b.id).slice(-14),max=Math.max(1,...weights.map(r=>r.payload.kg));content=`${panel('Вес и замеры',list('weight'),addButton('weight','Добавить замеры'))}${panel('Последние 14 измерений',weights.length?`<div class="chart">${weights.map(r=>`<div><b>${r.payload.kg}</b><div class="bar" style="height:${Math.max(4,r.payload.kg/max*130)}px"></div><small>${r.date.slice(5)}</small></div>`).join('')}</div>`:'<p class="empty">Добавь замеры, чтобы увидеть изменения.</p>')}<p class="muted">Следи за изменениями веса по сохранённым измерениям.</p>`;}
 if(page==='Настройки')content=panel('Личные ориентиры',`<p class="muted">Укажи собственные цели. Настрой дневные ориентиры под свой ритм и потребности.</p><form id="goals" class="formgrid">${[['calories','Энергия, ккал'],['protein','Белки, г'],['fat','Жиры, г'],['carbs','Углеводы, г'],['water','Вода, мл'],['steps','Шаги']].map(([key,label])=>`<label>${label}<input name="${key}" type="number" min="1" max="100000" required value="${s[key]}"></label>`).join('')}<button class="primary">Сохранить цели</button></form><hr><h3>Копия дневника</h3><p class="muted">Скачай свои записи в JSON. Копия не содержит пароль.</p><button id="export" class="soft">Экспортировать данные</button>`);
 if(page==='Прогресс') content+=weeklyCharts();
 if(page==='Обзор') content=consistency()+content+awardPanel();
 $('#content').innerHTML=content;
 document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{page=b.dataset.page;render()});$('#date').onchange=e=>{date=e.target.value && e.target.value<=today()?e.target.value:today();render()};$('#logout').onclick=async()=>{await api('/logout','POST');clearTimeout(window.reminder);user=null;records=[];date=today();page='Обзор';register=false;auth()};
 document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>openForm(b.dataset.add));document.querySelectorAll('[data-water]').forEach(b=>b.onclick=()=>save('water',{ml:Number(b.dataset.water)}));document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{if(!confirm('Удалить эту запись?'))return;try{await api('/records/'+b.dataset.delete,'DELETE');await load()}catch(e){toast(e.message)}});
 if($('#goals'))$('#goals').onsubmit=async e=>{e.preventDefault();await save('settings',Object.fromEntries([...new FormData(e.target)].map(([k,v])=>[k,Number(v)])))};
 if($('#export'))$('#export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({user,records},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='balance-diary.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 if(page==='Напоминания') bindReminders();
}
let saving = false;
async function save(type, payload) {
  if (saving) return;
  saving = true;
  const owner = user;
  const entry = {date, type, payload};
  try {
    const saved = await api('/records', 'POST', entry);
    if (user !== owner) return;
    records.push({...entry, id:saved.id, payload:{...payload, createdAt:saved.createdAt}});
    $('#dialog').close();
    render();
    const earned=dailyAwards(entry.date).filter(a=>a.id===saved.id);
    toast(earned.length?'Награда за день: '+earned.map(a=>a.title).join(', '):'Запись сохранена');
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
function openForm(type){const titles={food:'Добавить еду',activity:'Движение',sleep:'Как ты спал(а)?',weight:'Вес и замеры',habit:'Маленькая победа'};let html='';
 if(type==='food')html=`<label>Из справочника<select id="product"><option value="">Свой продукт</option>${products.map((p,i)=>`<option value="${i}">${p[0]}</option>`).join('')}</select></label><label>Название<input name="name" required maxlength="100"></label><label>Приём пищи<select name="meal"><option>Завтрак</option><option>Обед</option><option>Ужин</option><option>Перекус</option></select></label>${field('grams','Порция, г',1,10000)}<p class="hint">Укажи значения на 100 г. Они будут пересчитаны на порцию. Справочник содержит приблизительные значения.</p>${field('kcal','Ккал на 100 г',0,1000)}${field('protein','Белки на 100 г',0,100)}${field('fat','Жиры на 100 г',0,100)}${field('carbs','Углеводы на 100 г',0,100)}`;
 if(type==='activity')html=`<label>Занятие<input name="name" required maxlength="100" placeholder="Например, прогулка"></label>${field('minutes','Продолжительность, мин',0,1440)}${field('steps','Шаги',0,100000,'1')}`;
 if(type==='sleep')html=`${field('hours','Продолжительность сна, ч',.1,24,'.1')}<label>Качество сна<select name="quality"><option value="3">3 — нормально</option><option value="1">1 — плохо</option><option value="2">2 — ниже среднего</option><option value="4">4 — хорошо</option><option value="5">5 — отлично</option></select></label>`;
 if(type==='weight')html=field('kg','Вес, кг',1,500,'.1')+field('waist','Талия, см',1,300,'.1',false)+field('hips','Бёдра, см',1,300,'.1',false);
 if(type==='habit')html='<label>Что получилось сегодня?<input name="name" required maxlength="100" placeholder="Например, 10 минут чтения"></label>';
 $('#dialog').innerHTML=`<div class="sectionhead"><h2>${titles[type]}</h2><button id="close" aria-label="Закрыть">×</button></div><form id="entryform" class="formgrid">${html}<button class="primary">Сохранить</button></form>`;$('#dialog').showModal();$('#close').onclick=()=>$('#dialog').close();
 if(type==='food')$('#product').onchange=e=>{if(e.target.value==='')return;const p=products[Number(e.target.value)],f=$('#entryform');['name','kcal','protein','fat','carbs'].forEach((k,i)=>f.elements[k].value=p[i]);f.elements.grams.value=100};
 $('#entryform').onsubmit=e=>{e.preventDefault();const p={};for(const [k,v] of new FormData(e.target)){if(v==='')continue;p[k]=['name','meal'].includes(k)?v:Number(v)}if(type==='food')for(const key of ['kcal','protein','fat','carbs'])p[key]=Math.round(p[key]*p.grams)/100;save(type,p)};
}
api('/me').then(async u=>{user=u;await load()}).catch(()=>auth());if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
