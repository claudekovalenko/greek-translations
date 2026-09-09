# Anagnosis — Greek New Testament workbench

Read Greek New Testament passages, write your own English translation under each verse, and drill parsing and conjugation with your answers checked against the morphologically tagged text.

**Live app:** https://claudekovalenko.github.io/greek-translations/ (deployed from this repository by GitHub Actions; see below).

**No build step, no server.** Open `index.html` in a browser, or serve the folder with any static file server. Everything you write stays in your browser (localStorage) until you export it.

It is a Progressive Web App: install it from the browser menu (or the *Install app* button) to get an icon on your phone or desktop. A service worker keeps the app shell, the fonts, and every book you have opened available offline.

## What it does

1. **Add a passage** by reference (`John 3:16-18`, `Rom 8`, `Mk 1:1-2:5`, `1 Cor 13.4–7`). The Greek text and its word-by-word parsing are fetched from the [MorphGNT SBLGNT](https://github.com/morphgnt/sblgnt) repository and cached in the browser.
2. **Translate** in the box under each verse. It saves as you type.
3. **Click a word** to open its panel right below the verse:
   - **Parse**: choose person, tense, voice, mood, number (or case, number, gender), then *Check*. Wrong fields show the correct value. *Reveal* gives the answer and marks the word as corrected.
   - **Conjugate** (verbs): pick a tense, voice and mood and fill in the six forms. The answer key uses forms attested in the New Testament first (marked `sblgnt`), then regular paradigms the app generates (marked `generated`). Where neither exists the cell is left for you to check by hand.
   - **Decline** (nouns, adjectives, pronouns, articles): the same, on an eight-cell case/number table.
   - **Done** collapses the panel and underlines the word: green if you had it right, red if you were corrected.
4. **Ask for a meaning when you need one.** Click a word you do not know and its English stays under it, so the verse fills in as you work through it; *Hide meanings* in the passage header clears them, and an option shows every word at once. The word panel also gives the full dictionary entry and how often the word occurs in the New Testament, and under each passage a **Glossary** lists every distinct word, rarest first.
5. **Export** your Greek, translations and parsing notes as Markdown, plain text, or print to PDF. A JSON backup restores the whole session on another machine. The Markdown export includes a glossary table per passage.

You can also paste Greek text yourself (one verse per line). Pasted text has no parsing data, so only the translation boxes are available for it.

## Running locally

```sh
npx http-server . -p 8080 -c-1     # or: npm run serve
open http://localhost:8080
```

Opening `index.html` directly from disk also works in current browsers, because the data is fetched from GitHub with permissive CORS headers.

### Offline use / single file

```sh
npm run fetch-data      # downloads the 27 MorphGNT files into data/morphgnt/
npm run build           # dist/anagnosis.html  — one file, fetches text on demand
npm run build:embed     # dist/anagnosis-offline.html — one file with the whole NT inside (~5 MB)
```

## Deploying (GitHub Pages)

`.github/workflows/pages.yml` runs the tests, downloads the MorphGNT files so the site is self-contained, and publishes to GitHub Pages on every push to `main` (and to the development branch). One-time setup in the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**. The workflow also tries to enable Pages itself on its first run.

## Development

```sh
npm test                # unit tests (node:test) for reference parsing, code decoding,
                        # the paradigm generator, MorphGNT parsing and the lexicon
npm run build-lexicon   # rebuild data/lexicon.json from the Dodson lexicon
npm run make-icons      # re-render the PWA icons from icons/*.svg
```

Layout:

| Path | Purpose |
| --- | --- |
| `index.html`, `css/style.css` | page and styles |
| `js/main.js` | UI: passages, drill panel, export |
| `js/morphgnt.js` | parsing MorphGNT lines, compact cache format, verse grouping |
| `js/refs.js`, `js/books.js` | reference parsing and the 27-book table |
| `js/parsing.js` | parse-code decoding, drill fields, answer checking |
| `js/paradigm.js` | generation of regular verb and noun paradigms (recessive/persistent accent, contraction, augment, compounds) |
| `js/greek.js` | Unicode-aware Greek utilities: normalization, comparison, syllables, accents |
| `js/datasource.js` | loading books from embedded data, IndexedDB cache, local folder or GitHub |
| `js/lexicon.js` | glosses, dictionary headwords and NT frequencies |
| `js/state.js`, `js/export.js` | persistence and exporters |
| `scripts/` | data download and single-file build |

### About the generated paradigms

The generator covers regular -ω verbs (including contract verbs and prepositional compounds), a table of common irregular verbs (λέγω, ἔρχομαι, ὁράω, λαμβάνω, γίνομαι, βάλλω, ἔχω, φέρω, …), εἰμί, and first/second declension nouns. It deliberately does not generate μι-verbs, third-declension nouns, participles or the pluperfect: for those the drill falls back to forms attested in the loaded books and otherwise leaves the cell unchecked rather than risk correcting you wrongly.

## Credits and licences

- Greek text: [SBL Greek New Testament](https://sblgnt.com), © 2010 Society of Biblical Literature and Logos Bible Software, used under the SBLGNT End User License Agreement.
- Morphological parsing and lemmas: [MorphGNT](https://github.com/morphgnt/sblgnt), James K. Tauber (ed.), CC BY-SA 3.0.
- Glosses: [Jeffrey Dodson's Greek Lexicon](https://github.com/biblicalhumanities/Dodson-Greek-Lexicon), public domain. `data/lexicon.json` is built from it by `scripts/build-lexicon.mjs`, which converts the Beta Code headwords to Unicode, matches them to MorphGNT lemmas and adds a frequency counted in the SBLGNT. Glosses cover 99.6% of word occurrences; where a lemma has none, the app says so rather than guessing.
- Fonts (loaded from Google Fonts): Gentium Plus, Alegreya Sans, IBM Plex Mono.
- Application code: MIT.
