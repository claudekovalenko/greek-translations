// The 27 books of the Greek New Testament as numbered in MorphGNT.
// `file` is the file name in the morphgnt/sblgnt repository; `id` is the
// two-digit book number used in the first column of each data line.

export const REMOTE_BASE = 'https://raw.githubusercontent.com/morphgnt/sblgnt/master';

export const BOOKS = [
  { id: 1,  name: 'Matthew',         abbr: 'Matt',   file: '61-Mt-morphgnt.txt',  chapters: 28, aliases: ['matthew', 'matt', 'mt', 'mat'] },
  { id: 2,  name: 'Mark',            abbr: 'Mark',   file: '62-Mk-morphgnt.txt',  chapters: 16, aliases: ['mark', 'mk', 'mr', 'mrk'] },
  { id: 3,  name: 'Luke',            abbr: 'Luke',   file: '63-Lk-morphgnt.txt',  chapters: 24, aliases: ['luke', 'lk', 'lu', 'luk'] },
  { id: 4,  name: 'John',            abbr: 'John',   file: '64-Jn-morphgnt.txt',  chapters: 21, aliases: ['john', 'jn', 'jhn', 'joh'] },
  { id: 5,  name: 'Acts',            abbr: 'Acts',   file: '65-Ac-morphgnt.txt',  chapters: 28, aliases: ['acts', 'ac', 'act'] },
  { id: 6,  name: 'Romans',          abbr: 'Rom',    file: '66-Ro-morphgnt.txt',  chapters: 16, aliases: ['romans', 'rom', 'ro', 'rm'] },
  { id: 7,  name: '1 Corinthians',   abbr: '1 Cor',  file: '67-1Co-morphgnt.txt', chapters: 16, aliases: ['1corinthians', '1cor', '1co'] },
  { id: 8,  name: '2 Corinthians',   abbr: '2 Cor',  file: '68-2Co-morphgnt.txt', chapters: 13, aliases: ['2corinthians', '2cor', '2co'] },
  { id: 9,  name: 'Galatians',       abbr: 'Gal',    file: '69-Ga-morphgnt.txt',  chapters: 6,  aliases: ['galatians', 'gal', 'ga'] },
  { id: 10, name: 'Ephesians',       abbr: 'Eph',    file: '70-Eph-morphgnt.txt', chapters: 6,  aliases: ['ephesians', 'eph', 'ep'] },
  { id: 11, name: 'Philippians',     abbr: 'Phil',   file: '71-Php-morphgnt.txt', chapters: 4,  aliases: ['philippians', 'phil', 'php', 'philip', 'pp'] },
  { id: 12, name: 'Colossians',      abbr: 'Col',    file: '72-Col-morphgnt.txt', chapters: 4,  aliases: ['colossians', 'col'] },
  { id: 13, name: '1 Thessalonians', abbr: '1 Thess', file: '73-1Th-morphgnt.txt', chapters: 5, aliases: ['1thessalonians', '1thess', '1thes', '1th'] },
  { id: 14, name: '2 Thessalonians', abbr: '2 Thess', file: '74-2Th-morphgnt.txt', chapters: 3, aliases: ['2thessalonians', '2thess', '2thes', '2th'] },
  { id: 15, name: '1 Timothy',       abbr: '1 Tim',  file: '75-1Ti-morphgnt.txt', chapters: 6,  aliases: ['1timothy', '1tim', '1ti'] },
  { id: 16, name: '2 Timothy',       abbr: '2 Tim',  file: '76-2Ti-morphgnt.txt', chapters: 4,  aliases: ['2timothy', '2tim', '2ti'] },
  { id: 17, name: 'Titus',           abbr: 'Titus',  file: '77-Tit-morphgnt.txt', chapters: 3,  aliases: ['titus', 'tit', 'ti'] },
  { id: 18, name: 'Philemon',        abbr: 'Phlm',   file: '78-Phm-morphgnt.txt', chapters: 1,  aliases: ['philemon', 'phlm', 'phm', 'philem', 'phile'] },
  { id: 19, name: 'Hebrews',         abbr: 'Heb',    file: '79-Heb-morphgnt.txt', chapters: 13, aliases: ['hebrews', 'heb', 'hb'] },
  { id: 20, name: 'James',           abbr: 'Jas',    file: '80-Jas-morphgnt.txt', chapters: 5,  aliases: ['james', 'jas', 'jam', 'jm', 'ja'] },
  { id: 21, name: '1 Peter',         abbr: '1 Pet',  file: '81-1Pe-morphgnt.txt', chapters: 5,  aliases: ['1peter', '1pet', '1pe', '1pt'] },
  { id: 22, name: '2 Peter',         abbr: '2 Pet',  file: '82-2Pe-morphgnt.txt', chapters: 3,  aliases: ['2peter', '2pet', '2pe', '2pt'] },
  { id: 23, name: '1 John',          abbr: '1 John', file: '83-1Jn-morphgnt.txt', chapters: 5,  aliases: ['1john', '1jn', '1jhn', '1joh'] },
  { id: 24, name: '2 John',          abbr: '2 John', file: '84-2Jn-morphgnt.txt', chapters: 1,  aliases: ['2john', '2jn', '2jhn', '2joh'] },
  { id: 25, name: '3 John',          abbr: '3 John', file: '85-3Jn-morphgnt.txt', chapters: 1,  aliases: ['3john', '3jn', '3jhn', '3joh'] },
  { id: 26, name: 'Jude',            abbr: 'Jude',   file: '86-Jud-morphgnt.txt', chapters: 1,  aliases: ['jude', 'jud', 'jd'] },
  { id: 27, name: 'Revelation',      abbr: 'Rev',    file: '87-Re-morphgnt.txt',  chapters: 22, aliases: ['revelation', 'revelations', 'rev', 're', 'apoc', 'apocalypse', 'rv'] },
];

export const BOOK_BY_ID = new Map(BOOKS.map((b) => [b.id, b]));
