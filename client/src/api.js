import { SERVER_URL } from './socket';

const API = `${SERVER_URL}/api`;

async function request(path, opts = {}) {
  try {
    const res = await fetch(`${API}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
    return await res.json();
  } catch (err) {
    return { error: 'Network error - is the server up?' };
  }
}

export const auth = {
  me: () => request('/auth/me'),
  register: (username, password) => request('/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) }),
  login: (username, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
};

export const characters = {
  list: () => request('/characters'),
  get: (id) => request(`/characters/${id}`),
  create: (name, sheet) => request('/characters', { method: 'POST', body: JSON.stringify({ name, sheet }) }),
  update: (id, data) => request(`/characters/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id) => request(`/characters/${id}`, { method: 'DELETE' }),
};

export const campaigns = {
  list: () => request('/campaigns'),
  remove: (code) => request(`/campaigns/${code}`, { method: 'DELETE' }),
};

const srdCache = new Map();
async function cached(path) {
  if (srdCache.has(path)) return srdCache.get(path);
  const data = await request(path);
  if (!data || data.error) return data;
  srdCache.set(path, data);
  return data;
}

export const srd = {
  races: () => cached('/srd/races'),
  race: (index) => cached(`/srd/races/${index}`),
  classes: () => cached('/srd/classes'),
  clazz: (index) => cached(`/srd/classes/${index}`),
  classLevels: (index) => cached(`/srd/classes/${index}/levels`),
  spells: (params = '') => cached(`/srd/spells${params}`),
  spell: (index) => cached(`/srd/spells/${index}`),
  monsters: (params = '') => cached(`/srd/monsters${params}`),
  monster: (index) => cached(`/srd/monsters/${index}`),
  equipment: (params = '') => cached(`/srd/equipment${params}`),
  equipmentItem: (index) => cached(`/srd/equipment/${index}`),
  magicItems: (params = '') => cached(`/srd/magic-items${params}`),
  magicItem: (index) => cached(`/srd/magic-items/${index}`),
  conditions: () => cached('/srd/conditions'),
  backgrounds: () => cached('/srd/backgrounds'),
  rules: () => cached('/srd/rules'),
  ruleSection: (index) => cached(`/srd/rule-sections/${index}`),
};
