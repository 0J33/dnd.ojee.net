// What the AI tools (server/ai/*) borrow from the client's own data: the
// encounter budget, NPC/loot/trap presets, scene templates, the map
// generators, the built-in maps and the profanity filter. Bundled into
// server/ai/kit.cjs by build-ai-kit.mjs so there is one source of truth.
export { budgetFor, buildEncounter, describeEncounter, partyOf, ENCOUNTER_THEMES, DIFFICULTIES, seeded } from '../../client/src/data/encounters.js';
export { NPC_PRESETS, npcName, THING_PRESETS, ambushObject, SCENE_TEMPLATES, templateByKey, entryOf, farPoint, sceneFromTemplate, QUICK_CAMPAIGNS, buildQuickCampaign } from '../../client/src/data/presets.js';
export { BUILTIN_SCENES, SCENE_CATEGORIES, sceneFromBuiltin } from '../../client/src/data/scenes.js';
export { GENERATORS, generateMap, STAMPS } from '../../client/src/data/mapKit.js';
export { TILES, FLOOR_MATERIALS } from '../../client/src/data/tiles.js';
export { cleanText, makeFilter, cleanDeep, FILTER_LEVELS } from '../../client/src/ai/profanity.js';
