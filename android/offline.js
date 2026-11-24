'use strict';

(function () {
  const profile = {id: 1, name: 'Мой дневник'};
  const metrics = ['kcal', 'protein', 'fat', 'carbs'];
  const ranges = {
    food: {grams:[1, 10000], kcal:[0, 100000], protein:[0, 10000], fat:[0, 10000], carbs:[0, 10000]},
    water: {ml:[1, 10000]}, activity: {minutes:[0, 1440], steps:[0, 100000]},
    sleep: {hours:[.1, 24], quality:[1, 5]}, weight: {kg:[1, 500]}, habit: {},
    recipe: {grams:[1, 10000]},
    settings: Object.fromEntries(['calories', 'protein', 'fat', 'carbs', 'water', 'steps'].map(key => [key,[1, 100000]]))
  };
  const named = new Set(['food', 'activity', 'habit', 'recipe']);
  let database;

  function openDatabase() {
    if (!database) database = new Promise((resolve, reject) => {
      const request = indexedDB.open('balance-offline', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('records', {keyPath:'id', autoIncrement:true});
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Не удалось открыть локальное хранилище'));
    }).catch(error => {
      database = null;
      throw error;
    });
    return database;
  }

  async function useStore(mode, operation) {
    const db = await openDatabase();
    const transaction = db.transaction('records', mode);
    return new Promise((resolve, reject) => {
      let result;
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(new Error('Не удалось сохранить изменения в локальном хранилище'));
      const setResult = value => { result = value; };
      function safely(callback) {
        return () => {
          try {
            callback();
          } catch (error) {
            reject(error);
            transaction.abort();
          }
        };
      }
      safely(() => operation(transaction.objectStore('records'), setResult, safely))();
    });
  }

  function normalize(record) {
    const invalid = () => { throw new Error('В копии есть запись с неверным форматом'); };
    if (!record || typeof record.type !== 'string' || !Object.hasOwn(ranges, record.type) ||
        typeof record.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(record.date) ||
        !record.payload || typeof record.payload !== 'object' || Array.isArray(record.payload)) invalid();
    const day = new Date(record.date + 'T12:00:00Z');
    if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0,10) !== record.date) invalid();
    const source = record.payload;
    const payload = {};
    function copyNumber(key, min, max) {
      if (!Number.isFinite(source[key]) || source[key] < min || source[key] > max) invalid();
      payload[key] = source[key];
    }
    function name(value) {
      if (typeof value !== 'string' || !value.trim() || value.length > 100) invalid();
      return value;
    }
    for (const [key, [min, max]] of Object.entries(ranges[record.type])) copyNumber(key, min, max);
    if (named.has(record.type)) payload.name = name(source.name);
    if (record.type === 'food') {
      if (source.meal !== undefined && typeof source.meal !== 'string') invalid();
      payload.meal = source.meal || 'Перекус';
    }
    if (record.type === 'activity' && !payload.steps && !payload.minutes) invalid();
    if (record.type === 'weight') {
      for (const key of ['waist', 'hips']) if (source[key] !== undefined) copyNumber(key, 1, 300);
    }
    if (record.type === 'recipe') {
      if (!Array.isArray(source.ingredients) || !source.ingredients.length || source.ingredients.length > 100) invalid();
      payload.ingredients = source.ingredients.map(item => {
        if (!item || !Number.isFinite(item.grams) || item.grams <= 0) invalid();
        const ingredient = {name: name(item.name), grams:item.grams};
        for (const key of metrics) {
          if (!Number.isFinite(item[key]) || item[key] < 0) invalid();
          ingredient[key] = item[key];
        }
        return ingredient;
      });
    }
    if (source.time !== undefined && source.time !== '') {
      if (typeof source.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(source.time)) invalid();
      payload.time = source.time;
    }
    if (source.createdAt !== undefined) {
      if (typeof source.createdAt !== 'string' || !Number.isFinite(Date.parse(source.createdAt))) invalid();
      payload.createdAt = new Date(source.createdAt).toISOString();
    }
    return {date:record.date, type:record.type, payload};
  }

  async function request(path, method, data) {
    if (path === '/me' && method === 'GET') return profile;
    if (path === '/records' && method === 'GET') {
      return useStore('readonly', (store, result, safely) => {
        const entries = store.getAll();
        entries.onsuccess = safely(() => result(entries.result));
      });
    }
    if (path === '/records' && method === 'POST') {
      const entry = normalize(data);
      const createdAt = new Date().toISOString();
      entry.payload.createdAt = createdAt;
      return useStore('readwrite', (store, result, safely) => {
        const added = store.add(entry);
        added.onsuccess = safely(() => result({id:added.result, createdAt}));
      });
    }
    const match = /^\/records\/(\d+)$/.exec(path);
    const id = match && Number(match[1]);
    if (id && method === 'DELETE') {
      return useStore('readwrite', (store, result) => {
        store.delete(id);
        result({ok:true});
      });
    }
    if (id && method === 'PUT') {
      const entry = normalize(data);
      return useStore('readwrite', (store, result, safely) => {
        const entryRequest = store.get(id);
        entryRequest.onsuccess = safely(() => {
          const previous = entryRequest.result;
          if (!previous || previous.type !== entry.type) throw new Error('Запись не найдена');
          const createdAt = previous.payload.createdAt;
          if (createdAt) entry.payload.createdAt = createdAt;
          store.put({...entry, id});
          result({id, createdAt});
        });
      });
    }
    throw new Error('Действие недоступно');
  }

  async function importBackup(file) {
    if (file.size > 10 * 1024 * 1024) throw new Error('Размер копии превышает 10 МБ');
    let backup;
    try {
      backup = JSON.parse(await file.text());
    } catch {
      throw new Error('Не удалось прочитать файл JSON');
    }
    if (!Array.isArray(backup?.records)) throw new Error('Выберите копию дневника «Баланс»');
    const incoming = backup.records.map(normalize);
    return useStore('readwrite', (store, result, safely) => {
      const entries = store.getAll();
      entries.onsuccess = safely(() => {
        const matches = new Map();
        for (const entry of entries.result) {
          const key = JSON.stringify(normalize(entry));
          matches.set(key, (matches.get(key) || 0) + 1);
        }
        let imported = 0;
        for (const entry of incoming) {
          const key = JSON.stringify(entry);
          const count = matches.get(key) || 0;
          if (count) {
            matches.set(key, count - 1);
          } else {
            store.add(entry);
            imported++;
          }
        }
        result(imported);
      });
    });
  }

  window.balanceOffline = {request, importBackup};
})();

