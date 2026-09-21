const express = require('express');
const Character = require('../models/Character');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
  const chars = await Character.find({ userId: req.user._id }).sort({ updatedAt: -1 });
  res.json(chars.map((c) => ({ id: c._id, name: c.name, sheet: c.sheet, updatedAt: c.updatedAt })));
});

router.post('/', async (req, res) => {
  try {
    const { name, sheet } = req.body || {};
    if (!name || !sheet) return res.status(400).json({ error: 'Missing name or sheet' });
    const count = await Character.countDocuments({ userId: req.user._id });
    if (count >= 50) return res.status(400).json({ error: 'Character limit reached (50)' });
    const char = await Character.create({ userId: req.user._id, name, sheet });
    res.json({ id: char._id, name: char.name, sheet: char.sheet });
  } catch (err) {
    console.error('create character error', err);
    res.status(500).json({ error: 'Failed to create character' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const char = await Character.findOne({ _id: req.params.id, userId: req.user._id });
    if (!char) return res.status(404).json({ error: 'Not found' });
    res.json({ id: char._id, name: char.name, sheet: char.sheet });
  } catch (err) {
    res.status(404).json({ error: 'Not found' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, sheet } = req.body || {};
    const char = await Character.findOne({ _id: req.params.id, userId: req.user._id });
    if (!char) return res.status(404).json({ error: 'Not found' });
    if (name) char.name = name;
    if (sheet) char.sheet = sheet;
    char.updatedAt = new Date();
    await char.save();
    res.json({ id: char._id, name: char.name, sheet: char.sheet });
  } catch (err) {
    console.error('update character error', err);
    res.status(500).json({ error: 'Failed to save character' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await Character.deleteOne({ _id: req.params.id, userId: req.user._id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete' });
  }
});

module.exports = router;
