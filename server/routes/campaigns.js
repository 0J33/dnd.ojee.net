const express = require('express');
const Campaign = require('../models/Campaign');
const { requireAuth } = require('../middleware/auth');
const { activeRooms } = require('../socket/roomState');

const router = express.Router();

router.use(requireAuth);

// Campaigns this user is a member of (for the lobby list).
router.get('/', async (req, res) => {
  const userId = req.user._id.toString();
  const docs = await Campaign.find({ memberIds: userId }).sort({ lastActivity: -1 }).limit(30);
  res.json(
    docs.map((d) => {
      const live = activeRooms.get(d.code);
      const state = live || d.state;
      return {
        code: d.code,
        name: state.name,
        mode: state.mode,
        isHost: state.hostId === userId,
        memberCount: state.members.length,
        members: state.members.map((m) => m.username),
        online: live ? live.members.filter((m) => m.socketId).length : 0,
        tutorialActive: state.tutorial && state.tutorial.active,
        lastActivity: d.lastActivity,
      };
    })
  );
});

router.delete('/:code', async (req, res) => {
  const userId = req.user._id.toString();
  const code = (req.params.code || '').toUpperCase();
  const doc = await Campaign.findOne({ code });
  if (!doc) return res.status(404).json({ error: 'Not found' });
  if (doc.state.hostId !== userId) return res.status(403).json({ error: 'Only the host can delete a campaign' });
  await Campaign.deleteOne({ code });
  activeRooms.delete(code);
  res.json({ ok: true });
});

module.exports = router;
