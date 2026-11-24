const {before,after,test}=require('node:test');
const assert=require('node:assert/strict');
process.env.BALANCE_TEST_MEMORY='1';
const {server,db}=require('./server');
let base,cookie;
const credentials={name:'Анна',email:'api@example.org',password:'example-password'};
function post(path,data,headers={}) {
  return fetch(base+path,{method:'POST',headers:{Cookie:cookie||'',...headers},body:JSON.stringify(data)});
}
before(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  base='http://127.0.0.1:'+server.address().port;
  const response=await post('/api/register',credentials);
  assert.equal(response.status,200);
  cookie=response.headers.get('set-cookie').split(';')[0];
});
after(async()=>{await new Promise(resolve=>server.close(resolve));db.close()});
const examples={
  recipe:{name:'Каша',grams:200,ingredients:[{name:'Овсянка',grams:100,kcal:88,protein:3,fat:1.7,carbs:15}]},
  water:{ml:250},activity:{name:'Ходьба',minutes:20,steps:1500},
  sleep:{hours:7.5,quality:4},weight:{kg:70,waist:80,hips:90},
  food:{name:'Рис',meal:'Обед',grams:120,kcal:156,protein:3.2,fat:.4,carbs:34},
  habit:{name:'Чтение'},settings:{calories:2100,steps:8000,water:2000,protein:90,fat:70,carbs:250}
};
test('only owner can edit; creation time survives corrections',async()=>{
  const entry={type:'water',date:'2024-02-29',payload:{ml:250}};
  const original=await (await post('/api/records',entry)).json();
  const other=await post('/api/register',{...credentials,email:'other-editor@example.org'});
  const edit=(session,payload)=>fetch(base+'/api/records/'+original.id,{
    method:'PUT',headers:{Cookie:session},body:JSON.stringify({...entry,payload})
  });
  assert.equal((await edit(other.headers.get('set-cookie').split(';')[0],{ml:1})).status,404);
  assert.equal((await edit(cookie,{ml:300,time:'25:01'})).status,400);
  const result=await edit(cookie,{ml:300,time:'08:45'});
  assert.equal(result.status,200);
  assert.equal((await result.json()).createdAt,original.createdAt);
});
for(const [type,payload] of Object.entries(examples)){
  test(type+' round trip with leap date',async()=>{
    const date='2024-02-29';
    const response=await post('/api/records',{type,date,payload});
    assert.equal(response.status,201);
    const {id,createdAt}=await response.json();
    const records=await (await fetch(base+'/api/records',{headers:{Cookie:cookie}})).json();
    assert.deepEqual(records.find(row=>row.id===id),{id,date,type,payload:{...payload,createdAt}});
  });
}
for(const [type,patch] of [['water',{ml:0}],['sleep',{hours:25}],['sleep',{quality:6}],['weight',{waist:301}],['food',{grams:-1}],['habit',{name:' '}],['settings',{steps:'5000'}],['activity',{steps:0,minutes:0}]]){
 test('reject '+type+' '+JSON.stringify(patch),async()=>{
   assert.equal((await post('/api/records',{date:'2026-01-01',type,payload:{...examples[type],...patch}})).status,400);
 });
}
test('reject invalid date and unknown type',async()=>{
 for(const [date,type] of [['2025-02-29','water'],['2099-01-01','water'],['bad','water'],['2026-01-01','unknown']])
   assert.equal((await post('/api/records',{date,type,payload:{ml:250}})).status,400);
});
test('registration and session errors',async()=>{
 assert.equal((await post('/api/register',credentials)).status,409);
 assert.equal((await post('/api/login',{...credentials,password:'incorrect-password'})).status,401);
 assert.equal((await post('/api/register',{...credentials,email:'invalid'})).status,400);
 assert.equal((await post('/api/logout',{}, {Origin:'https://other.example'})).status,403);
 assert.equal((await fetch(base+'/api/me',{headers:{Cookie:cookie}})).status,200);
});
test('PWA manifest and app assets are served',async()=>{
 const manifest=await (await fetch(base+'/manifest.json')).json();
 for(const path of [manifest.start_url,...manifest.icons.map(icon=>icon.src),'/sw.js','/style.css','/app.js'])
   assert.equal((await fetch(base+path)).status,200,path);
 assert.equal((await fetch(base+'/missing')).status,404);
});
