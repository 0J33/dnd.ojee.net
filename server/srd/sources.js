// Every body of rules content the app serves, with its licence and the notice
// that licence requires. The credits screen renders this list; the builder
// labels races and subclasses with `short`.
//
// OGL 1.0a content additionally needs the full licence text (data/OGL-1.0a.txt)
// and a Section 15 listing every copyright notice in the chain, which `ogl15`
// assembles below. Product Identity (setting names, logos, trade dress) is not
// used beyond the titles those notices require.

const fs = require('fs');
const path = require('path');

const SOURCES = [
  {
    key: 'srd51', short: 'SRD 5.1', name: 'System Reference Document 5.1',
    publisher: 'Wizards of the Coast', license: 'CC-BY-4.0',
    url: 'https://dnd.wizards.com/resources/systems-reference-document',
  },
  {
    key: 'srd52', short: 'SRD 5.2', name: 'System Reference Document 5.2.1',
    publisher: 'Wizards of the Coast', license: 'CC-BY-4.0',
    url: 'https://www.dndbeyond.com/srd',
  },
  {
    key: 'toh', short: 'Tome of Heroes', name: 'Tome of Heroes',
    publisher: 'Kobold Press', license: 'OGL-1.0a',
    url: 'https://koboldpress.com/kpstore/product/tome-of-heroes-for-5th-edition/',
    notice: 'Tome of Heroes. Copyright 2022, Open Design LLC; Authors Kelly Pawlik, Ben McFarland, and Brian Suskind.',
  },
  {
    key: 'tdcs', short: "Tal'Dorei", name: "Critical Role: Tal'Dorei Campaign Setting",
    publisher: 'Green Ronin Publishing', license: 'OGL-1.0a',
    url: 'https://greenronin.com/',
    notice: "Critical Role: Tal'Dorei Campaign Setting. Copyright 2017, Green Ronin Publishing, LLC; Authors Matthew Mercer, James Haeck.",
  },
  {
    key: 'open5e', short: 'Open5e', name: 'Open5e Originals',
    publisher: 'Open5e', license: 'OGL-1.0a',
    url: 'https://open5e.com/',
    notice: 'Open5e Originals. Copyright 2024, Open5e.com; Authors Ean Moody and contributors.',
  },
];

const BY_KEY = Object.fromEntries(SOURCES.map((s) => [s.key, s]));

const OGL_TEXT = fs.readFileSync(path.join(__dirname, '..', 'data', 'OGL-1.0a.txt'), 'utf8').trim();

const ogl15 = [
  'Open Game License v 1.0a Copyright 2000, Wizards of the Coast, LLC.',
  'System Reference Document 5.1 Copyright 2016, Wizards of the Coast, Inc.; Authors Mike Mearls, Jeremy Crawford, Chris Perkins, Rodney Thompson, Peter Lee, James Wyatt, Robert J. Schwalb, Bruce R. Cordell, Chris Sims, and Steve Townshend, based on original material by E. Gary Gygax and Dave Arneson.',
  ...SOURCES.filter((s) => s.license === 'OGL-1.0a').map((s) => s.notice),
];

module.exports = { SOURCES, BY_KEY, OGL_TEXT, OGL_SECTION_15: ogl15 };
