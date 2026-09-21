// Built-in battle maps, grouped so the scene picker can browse them.
// Every character is a tile from data/tiles.js - see TILES there for the legend.
// Maps are hand-drawn; short rows are padded on load.

import { FLOOR_THEMES, FLOOR_MATERIALS, TILES, tileAt } from './tiles';

export { FLOOR_THEMES, FLOOR_MATERIALS };

const trim = (s) => s.split('\n').map((r) => r.trimEnd()).filter((r) => r.length);

const map = (key, name, category, floor, blurb, cells) => ({ key, name, category, floor, blurb, cells: trim(cells) });

export const SCENE_CATEGORIES = ['Town & tavern', 'Dungeon', 'Cave & underdark', 'Wilderness', 'Grand halls'];

export const BUILTIN_SCENES = [
  /* ------------------------------------------------ Town & tavern */
  map('taproom', 'The Gilded Flagon - Taproom', 'Town & tavern', 'wood', 'A warm inn common room. Great for the opening scene.', `
######################
#=333333=====I=====b=#
#=1111=======2222==bb#
#====================#
#==t1==t1==t1==t1====#
D====================#
#=1t===1t===1t===1t==#
#====================#
#==t1==t1====c====()=#
#=================[==#
#=========D==========#
######################
`),
  map('cellar', 'The Flagon Cellar', 'Town & tavern', 'stone', 'Storage under the inn. Rats, crates and a broken wall.', `
##################
#[b...........bb.#
#bb..t.........b.#
#................#
D................#
#......t.......7.#
#..............7.#
#..B........rr...#
#..[B.......rr%%#
#############>####
`),
  map('village', 'Village Square', 'Town & tavern', 'dirt', 'Cobbled square with a well, market carts and a signpost.', `
,,,,,,,,,,,,,,,,,,,,,,,,,,
,TT,,kkkkkkkkkkkkkk,,,TT,,
,T,,kkkkkkkkkkkkkkkk,,,T,,
,,,kkk[[kkkkkkkk))kkkk,,,,
,,,kkkkkkkkkkkkkkkkkkk,,,,
,,,kkkkkkkWkkkkkkkkkkk,,,,
,?,kkkkkkkkkkkkkkkkkkk,,,,
,,,kkkkkkkkkkkkkkkkkkk,,,,
,,,kk))kkkkkkkkk[[kkkk,,,,
,,,kkkkkkkkkkkkkkkkkkk,,,,
,T,,kkkkkkkkkkkkkkkk,,,T,,
,TT,,,kkkkkkkkkkkk,,,,TT,,
,,,,,,,,,,,,,,,,,,,,,,,,,,
`),
  map('smithy', 'The Smithy', 'Town & tavern', 'stone', 'Forge, anvil and weapon racks. A good shop or ambush.', `
################
#..44......RRR.#
#..44..........#
#..............#
#....b....b....#
D....2222......#
#..............#
#..[[.....C....#
#..[[......b...#
#######D########
`),
  map('barracks', 'Guard Barracks', 'Town & tavern', 'stone', 'Bunks, weapon racks and a locked strongroom.', `
######################
#EE..EE..EE..EE..#CC.#
#EE..EE..EE..EE..#$$.#
#................L...#
#..2222....RRRR..#####
D................#..I#
#..1111..........#...#
#EE..EE..EE..EE..#...#
#EE..EE..EE..EE..#..G#
##########D###########
`),

  /* ------------------------------------------------ Dungeon */
  map('vault', 'The Old Vault', 'Dungeon', 'stone', 'A guarded strongroom inside a ring of walls.', `
################
#..............#
#..rr......rr..#
#..I........I..#
#....######....#
#....#C$$C#....#
D....#....#....#
#....#....#....#
#....##LL##....#
#..............#
#..r........r..#
################
`),
  map('corridors', 'Dungeon Corridors', 'Dungeon', 'stone', 'Classic branching passages - a flexible starting dungeon.', `
####################
#....#........#....#
#.C..D........D..$.#
#....#...##...#....#
######...##...######
#....D........D....#
#....#........#....#
#.X..#...<....#..C.#
#....#........#....#
######DDDD#DDDD#####
#..................#
#..r....7....r.....#
#........>.........#
####################
`),
  map('crypt', 'The Crypt', 'Dungeon', 'stone', 'Rows of graves and bone-strewn floor. Undead country.', `
######################
#zzzzzzzzzzzzzzzzzzzz#
#zMM.zMM.zMM.zMM.zMM.#
#zzzzzzzzzzzzzzzzzzzz#
#z..................z#
D....UU......UU......#
#z..................z#
#zMM.zMM.zMM.zMM.zMM.#
#zzzzzzzzzzzzzzzzzzzz#
#zzzzzz#SS#zzzzzzzzzz#
##########D###########
`),
  map('study', "The Wizard's Study", 'Dungeon', 'wood', 'Bookshelves, a warded circle and something valuable.', `
####################
#FFFFFFF##FFFFFFFF.#
#..................#
#..eeeeeeeeeeee....#
#..e..........e..C.#
D..e...ZZZZ...e....#
#..e...ZZZZ...e....#
#..e..........e..K.#
#..eeeeeeeeeeee....#
#..............2222#
#FFFFFF##FFFFFFFF..#
####################
`),
  map('prison', 'The Dungeon Cells', 'Dungeon', 'stone', 'Barred cells off a guarded hall - a rescue or a jailbreak.', `
######################
#zz.L.zz.L.zz.L.zz.L.#
#zz#..zz#..zz#..zz#..#
####..####..####..####
#....................#
D......I......I......#
#....................#
####..####..####..####
#zz#..zz#..zz#..zz#..#
#zz.L.zz.L.zz.L.zz.L.#
######################
`),
  map('keep', 'Ruined Keep', 'Dungeon', 'stone', 'Half-collapsed walls and rubble. Cover everywhere.', `
%%%%%%%%%%%%%%%%%%%%%%
%..rr...........rr...%
%......%%%%%%........%
%..r...%....%....r...%
%......%.C..D........%
D......%....%........%
%..O...%%%%%%....O...%
%....................%
%..rr....))......rr..%
%..........?.........%
%%%%%%%%%%%%%%%%%%%%%%
`),

  /* ------------------------------------------------ Cave & underdark */
  map('warren', 'The Rat Warren', 'Cave & underdark', 'dirt', 'Cramped dirt tunnels. Ideal for a first fight.', `
vvvvvvvvvvvvvvvvvvvv
vv::::vvvvvvvvvv::vv
v::::::::vv::::::::v
v:::rr:::::::::::::v
D::::::::::~~::::::v
v:::::vv:::~~:::::vv
v::::vvvv::::::::vvv
v:::::vv::::rr::::vv
vv:::::::::::::::::v
vvv:::::::vv:::::::D
vvvvvvvvvvvvvvvvvvvv
`),
  map('cavern', 'Dark Cavern', 'Cave & underdark', 'stone', 'An open natural cave with a pool and loose rock.', `
____vvvvvvvvvvvvvvvvvv
__vvv..............6.v
_vv.......rr.........v
vv...................v
v.....~~~.....6......v
v.....~~~~.....rr....v
v......~~............v
vv..........6.....5..v
_vv........vv__vv..vvv
__vvv......v____vvvv
____vvvvvvvv________
`),
  map('mushroom', 'Fungal Grotto', 'Cave & underdark', 'dirt', 'Glowing fungus and shallow pools deep underground.', `
vvvvvvvvvvvvvvvvvvvvvv
v5:::::::::::::::::5:v
v::::mm::::::::mm::::v
v:::mmmm::5:::mmmm:::v
v::::mm::::::::mm::::v
D::::::::::::::::::::v
v:5::::::QQ::::::::5:v
v:::::::::::::::::::5v
v::mm:::::::::::mm:::v
vv:::::::5::::::::::vv
vvvvvvvvvvvvvvvvvvvvvv
`),
  map('icecave', 'Ice Cavern', 'Cave & underdark', 'snow', 'Slick blue ice and frozen pools. Movement is treacherous.', `
vvvvvvvvvvvvvvvvvvvv
vnniiiiinnnniiiiinnv
vniiiiiiiiiiiiiiiinv
vniii..QQ....QQiiinv
vnii..........iiiinv
Dnii....xx....iiiinv
vnii....xx....iiiinv
vniii........iiiiinv
vniiiiiiiiiiiiiiiinv
vvnnniiiiiinnniiivvv
vvvvvvvvvvvvvvvvvvvv
`),
  map('lavacave', 'Molten Chamber', 'Cave & underdark', 'stone', 'A lava flow splits the room. Bring a plan.', `
vvvvvvvvvvvvvvvvvvvv
v..................v
v...6..........6...v
v..................v
v.lllll....lllll...v
D.lllll////lllll...v
v.lllll....lllll...v
v..................v
v...6....A.....6...v
v..................v
vvvvvvvvvvvvvvvvvvvv
`),
  map('sewer', 'Sewer Junction', 'Cave & underdark', 'stone', 'Filthy channels and narrow ledges beneath the city.', `
####################
#..................#
#.qqqqqqqqqqqqqqqq.#
#.qqqqqqqqqqqqqqqq.#
D......////........#
#.qqqq////qqqqqqqq.#
#.qqqq////qqqqqqqq.#
#......////.....7..#
#..................#
#####H#######>######
`),

  /* ------------------------------------------------ Wilderness */
  map('field', 'Open Field', 'Wilderness', 'grass', 'A road across open ground with a stream. Room to manoeuvre.', `
,,,,,,,,,,,,,,,,,,,,,,,,,,
,,T,,,,,,,,,,,,,,,,,,,T,,,
,,,,,,,,,:::,,,,,,,,,,,,,,
,,,&,,,,,:::,,,,,,,T,,,,,,
,T,,,,,,,,:::,,,,,,,,,,,,,
,,,,,,,,,,:::,,,,,,,,,&,,,
,,,,,,,,,,:::,,,,,,,,,T,,,
,,,,T,,,,,:::,,,,,,,,,,,,,
,,,,,,,,,,:::,,,,~~~,,,,,,
,,,,,,,,,,:::,,,~~~~~,,,,,
,,T,,,,,,,:::,,,,~~~,,,,,,
,,,,,,,,,,:::,,,,,,,,,,,,,
,,,,,,,,,,:::,,,,,,,T,,,,,
,,,,,,,,,,:::,,,,,,,,,,,,,
`),
  map('clearing', 'Forest Clearing', 'Wilderness', 'grass', 'Ringed by trees with a campfire and a brook.', `
TTTT,,,,TTT,,,,,TTTTTTT
TT,,,,YY,,,,,,,,,,,TTTT
T,,,,,,,,,,,,,,,,,,,,TT
T,,,,,,,,c,,,,,,,(,,,,T
,,,,,,,,,,,,,,,,,,,,,,T
,,,,,,,,,,,,,~~,,,,,,,T
T,,,,,,,,,,,~~~~,,,,,,,
T,,,,,,,,,,,,~~,,,,,,,T
TT,,,,YY,,,,,,,,,,&,,TT
TTT,,,,,,,,,,,,,,,,TTTT
TTTTT,,,,TTTT,,,TTTTTTT
`),
  map('bridge', 'River Crossing', 'Wilderness', 'grass', 'The only way over is the bridge. Perfect ambush ground.', `
,,,,,,,,,,,,,,,,,,,,,,,,
,,T,,,,,,,,,,,,,,,,,T,,,
,,,,,,,,,,,,,,,,,,,,,,,,
,,,,,,,,,,::::,,,,,,,,,,
qqqqqqqqqq::::qqqqqqqqqq
qqqqqqqqqq////qqqqqqqqqq
qqqqqqqqqq////qqqqqqqqqq
qqqqqqqqqq::::qqqqqqqqqq
,,,,,,,,,,::::,,,,,,,,,,
,,,,,,,,,,,,,,,,,,,,,,,,
,,T,,,,Y,,,,,,,,Y,,,,T,,
,,,,,,,,,,,,,,,,,,,,,,,,
`),
  map('goblincamp', 'Goblin Camp', 'Wilderness', 'dirt', 'A palisade around cook fires, tents and stolen goods.', `
wwwwwwwwwwwwwwwwwwww
w::::::::::::::::::w
w::[[::::::::::[[::w
w::::::::c:::::::::w
w:::::::::::::::::Dw
w::::K:::::::::!!::w
w::::::::::::::::::w
w::[[::::c:::::))::w
w::::::::::::::::::w
w::::::?:::::::::::w
wwwwwwwwDwwwwwwwwwww
`),
  map('swamp', 'The Sunken Mire', 'Wilderness', 'dirt', 'Mud, standing water and rotten logs. Slow going.', `
,,,,,,,,,,,,,,,,,,,,,,
,mmmm,,,,mmmm,,,,mmm,,
mmmmmm,~~,mmmm,,mmmmm,
mm~~mmm~~~mmm(mmmm~~mm
m~~~~mm~~~mmmmmm~~~~~m
,mm~~~mmmm5mmmm~~~~mm,
,,mmmm(mmmmmmmmmm~~mm,
,,,mmmmmmm5mmmmmmmmm,,
,,mmmm,,mmmm,,,mmmm,,,
,,,,,,,,,,,,,,,,,,,,,,
`),
  map('mountain', 'Mountain Pass', 'Wilderness', 'snow', 'A narrow ledge above a drop. Falling is a real risk.', `
^^^^^^^^^^^^^^^^^^^^^^
vvvvvvvvvvvvvvvvvvvvvv
vnnnnnnnnnnnnnnnnnnnnv
vnnOnnnnnnnnnnnnOnnnnv
vnnnnnnnnnnnnnnnnnnnnv
:nnnnnnnnnnnnnnnnnnnn:
vxxxxxxxxxxxxxxxxxxxxv
vxxxxxxxxxxxxxxxxxxxxv
vvvvvvvvvvvvvvvvvvvvvv
`),
  map('desert', 'Desert Ruins', 'Wilderness', 'sand', 'Broken columns half-buried in sand under a hard sun.', `
ssssssssssssssssssssss
sssssssPssssssPsssssss
ss%%%%ssssssssss%%%%ss
ss%ssssssssssssssss%ss
ss%ssssPssUssPsssss%ss
ssssssssssssssssssssss
ss%sssssssssssssssss%s
ss%%%ssPssssssPsss%%%s
ssssssssssssssssssssss
sssssss?ssssssssssssss
ssssssssssssssssssssss
`),

  /* ------------------------------------------------ Grand halls */
  map('chamber', 'Stone Chamber', 'Grand halls', 'stone', 'A simple pillared hall - a clean, readable arena.', `
######################
#....................#
#..I..............I..#
#...PP..........PP...#
#....................#
#....................#
D....................D
#....................#
#...PP..........PP...#
#..I..............I..#
#....................#
##########DD##########
`),
  map('throne', 'Throne Room', 'Grand halls', 'marble', 'Banners, columns and a dais. For audiences and betrayals.', `
##########}}##########
#pppppppppJJpppppppppp
#ppppppppppppppppppppp
#ppPPpppeeeeppppPPpppp
#pppppppeeeepppppppppp
#ppppGppeeeeppGpppppp#
Dppppppeeeeeeppppppppp
#ppPPppeeeeeepppPPpppp
#pppppppeeeepppppppppp
#pppppppeeeepppppppppp
##########DD##########
`),
  map('temple', 'Temple Hall', 'Grand halls', 'marble', 'A processional aisle to the altar, flanked by braziers.', `
######################
#pppppppp#AA#ppppppppp
#ppppppppppppppppppppp
#ppGppppeeeeeepppppGpp
#ppppPPpeeeeeepPPppppp
#pppppppeeeeeeppppppp#
Dpppppppeeeeeepppppppp
#ppppPPpeeeeeepPPppppp
#ppGppppeeeeeepppppGpp
#ppppppppppppppppppppp
##########DD##########
`),
  map('library', 'The Great Library', 'Grand halls', 'wood', 'Stacks, reading tables and a locked archive.', `
######################
#FFFFFF##FFFFFF##FFFF#
#....................#
#..2222....2222......#
#..1111....1111...#CC#
D.................L$$#
#..2222....2222...#..#
#..1111....1111......#
#FFFFFF##FFFFFF##FFFF#
######################
`),
  map('arena', 'The Sand Arena', 'Grand halls', 'sand', 'A fighting pit ringed by stone. Nowhere to hide.', `
######################
#ssssssssssssssssssss#
#ssssssssssssssssssss#
#sssOsssssssssssOssss#
#ssssssssssssssssssss#
Lssssssssssssssssssssl
#ssssssssssssssssssss#
#sssOsssssssssssOssss#
#ssssssssssssssssssss#
#ssssssssssssssssssss#
##########LL##########
`),
];

/* ---------------- helpers ---------------- */

export const sceneCategories = () => {
  const seen = new Map();
  for (const s of BUILTIN_SCENES) {
    if (!seen.has(s.category)) seen.set(s.category, []);
    seen.get(s.category).push(s);
  }
  return [...seen.entries()].map(([name, maps]) => ({ name, maps }));
};

const padChar = (floor) => (floor === 'grass' ? ',' : floor === 'sand' ? 's' : floor === 'snow' ? 'n' : floor === 'marble' ? 'p' : '.');

/** Materialise a built-in map into the scene payload the server expects. */
export function sceneFromBuiltin(key) {
  const b = BUILTIN_SCENES.find((s) => s.key === key);
  if (!b) return null;
  const w = Math.max(...b.cells.map((r) => r.length));
  const h = b.cells.length;
  return {
    name: b.name,
    floor: b.floor,
    cells: b.cells.map((r) => r.padEnd(w, padChar(b.floor))),
    w,
    h,
    blurb: b.blurb,
  };
}

/** A blank grid of one material, as an editable cells array. */
export function blankCells(w, h, floor = 'stone') {
  const ch = padChar(floor);
  return Array.from({ length: h }, () => ch.repeat(w));
}

/**
 * Preview object for a built-in map (or any cells array) that the shared
 * renderer can draw without it having to be a live scene.
 */
export function previewScene(source) {
  if (typeof source === 'string') {
    const b = sceneFromBuiltin(source);
    if (!b) return null;
    return { grid: { w: b.w, h: b.h }, cells: b.cells, bg: { floor: b.floor }, tokens: [] };
  }
  return source;
}

/* ---------------- campaign starter packs ---------------- */
// Picked at campaign creation so a new table opens on a real place instead of
// an empty grid, with the next few scenes already waiting in the wings.

export const STARTER_PACKS = [
  {
    key: 'blank',
    name: 'Empty table',
    blurb: 'One blank grid. Build everything yourself.',
    scenes: [],
  },
  {
    key: 'tavern',
    name: 'Village & tavern',
    blurb: 'The classic opening: inn, cellar, village square and the road out.',
    scenes: ['taproom', 'cellar', 'village', 'field'],
  },
  {
    key: 'dungeon',
    name: 'Dungeon delve',
    blurb: 'Corridors into cells, a vault and a crypt at the bottom.',
    scenes: ['corridors', 'prison', 'vault', 'crypt'],
  },
  {
    key: 'wilds',
    name: 'Into the wilds',
    blurb: 'Open country, a river crossing, a goblin camp and a cave.',
    scenes: ['field', 'bridge', 'goblincamp', 'cavern'],
  },
  {
    key: 'city',
    name: 'City intrigue',
    blurb: 'Streets, barracks, a library and the throne room.',
    scenes: ['village', 'barracks', 'library', 'throne'],
  },
  {
    key: 'underdark',
    name: 'Deep places',
    blurb: 'Sewers down to fungal caves, ice and molten rock.',
    scenes: ['sewer', 'mushroom', 'icecave', 'lavacave'],
  },
];

/** Difficult-terrain / blocking lookups re-exported for convenience. */
export { TILES, tileAt };
