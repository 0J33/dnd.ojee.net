const express = require('express');
const srd = require('../srd/store');

const router = express.Router();

const norm = (s) => (s || '').toString().toLowerCase();

// ---- Races ----
// SRD 5.1 plus the open-licensed expansions, in one shape (see srd/store.js).
router.get('/races', (req, res) => res.json(srd.raceSummaries));
router.get('/races/:index', (req, res) => {
  const race = srd.raceByIndex.get(req.params.index);
  if (!race) return res.status(404).json({ error: 'Not found' });
  res.json(race);
});

// ---- Classes ----
router.get('/classes', (req, res) => {
  res.json(srd.raw.classes.map((c) => ({
    index: c.index,
    name: c.name,
    hit_die: c.hit_die,
    saving_throws: (c.saving_throws || []).map((s) => s.index),
  })));
});
router.get('/classes/:index', (req, res) => {
  const detail = srd.classDetail(req.params.index);
  if (!detail) return res.status(404).json({ error: 'Not found' });
  res.json(detail);
});
router.get('/classes/:index/levels', (req, res) => {
  const levels = srd.classLevels(req.params.index);
  if (!levels.length) return res.status(404).json({ error: 'Not found' });
  res.json(levels);
});
router.get('/subclasses', (req, res) => {
  if (!req.query.class) return res.status(400).json({ error: 'class is required' });
  res.json(srd.subclassesFor(norm(req.query.class)));
});
router.get('/subclasses/:index/levels', (req, res) => {
  res.json(srd.subclassLevels(req.params.index));
});
// Every subclass, SRD or expansion: { ...summary, levels: { "3": [{ name, desc }] } }
router.get('/subclasses/:index', (req, res) => {
  const sc = srd.subclassByIndex.get(req.params.index);
  if (!sc) return res.status(404).json({ error: 'Not found' });
  res.json(sc);
});

// ---- Spells ----
router.get('/spells', (req, res) => {
  let list = srd.spellSummaries;
  const { search, level, class: cls, school } = req.query;
  if (search) list = list.filter((s) => norm(s.name).includes(norm(search)));
  if (level !== undefined && level !== '') list = list.filter((s) => s.level === parseInt(level, 10));
  if (cls) list = list.filter((s) => s.classes.includes(norm(cls)));
  if (school) list = list.filter((s) => norm(s.school) === norm(school));
  res.json(list);
});
router.get('/spells/:index', (req, res) => {
  const spell = srd.byIndex.spells.get(req.params.index);
  if (!spell) return res.status(404).json({ error: 'Not found' });
  res.json(spell);
});

// ---- Monsters ----
router.get('/monsters', (req, res) => {
  let list = srd.monsterSummaries;
  const { search, cr, crMax, type } = req.query;
  if (search) list = list.filter((m) => norm(m.name).includes(norm(search)));
  if (cr !== undefined && cr !== '') list = list.filter((m) => m.cr === parseFloat(cr));
  if (crMax !== undefined && crMax !== '') list = list.filter((m) => m.cr <= parseFloat(crMax));
  if (type) list = list.filter((m) => norm(m.type) === norm(type));
  res.json(list);
});
router.get('/monsters/:index', (req, res) => {
  const monster = srd.byIndex.monsters.get(req.params.index);
  if (!monster) return res.status(404).json({ error: 'Not found' });
  res.json(monster);
});

// ---- Equipment / magic items ----
router.get('/equipment', (req, res) => {
  let list = srd.equipmentSummaries;
  const { search, category } = req.query;
  if (search) list = list.filter((e) => norm(e.name).includes(norm(search)));
  if (category) list = list.filter((e) => e.category === norm(category));
  res.json(list);
});
router.get('/equipment/:index', (req, res) => {
  const item = srd.byIndex.equipment.get(req.params.index);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});
router.get('/magic-items', (req, res) => {
  let list = srd.magicItemSummaries;
  if (req.query.search) list = list.filter((m) => norm(m.name).includes(norm(req.query.search)));
  res.json(list);
});
router.get('/magic-items/:index', (req, res) => {
  const item = srd.byIndex.magicItems.get(req.params.index);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

// ---- Small static sets ----
router.get('/conditions', (req, res) => res.json(srd.raw.conditions));
router.get('/skills', (req, res) => res.json(srd.raw.skills));
router.get('/languages', (req, res) => res.json(srd.raw.languages));
router.get('/alignments', (req, res) => res.json(srd.raw.alignments));
router.get('/weapon-properties', (req, res) => res.json(srd.raw.weaponProperties));
router.get('/backgrounds', (req, res) => res.json(srd.raw.backgrounds));
router.get('/sources', (req, res) => res.json({
  sources: srd.sources.list,
  ogl: { text: srd.sources.oglText, section15: srd.sources.oglSection15 },
}));
router.get('/rules', (req, res) => res.json(srd.raw.rules.map((r) => ({ index: r.index, name: r.name, subsections: r.subsections }))));
router.get('/rule-sections/:index', (req, res) => {
  const section = srd.byIndex.ruleSections.get(req.params.index);
  if (!section) return res.status(404).json({ error: 'Not found' });
  res.json(section);
});

module.exports = router;
