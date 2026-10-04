# Plan — "Goal Reader" (working name): daily reading practice for a 1st grader

## Context
A first grader in Palm Beach County, FL (first name only in the app). He speaks fluent English and ~70% Spanish. Goal: a simple app he uses **every day for 5–15 min**, with mom or dad beside him, on **iPad, iPhone and Mac**. It must:
- model pronunciation
- listen to him read and tell him if it's right
- repeat words until they stick
- optionally let him write words with his finger or Apple Pencil
- follow **Florida B.E.S.T. ELA** and Florida's K–3 ban on three‑cueing

The parent area is in Spanish. Spanish word translations for mom come in phase 2. Hosting: GitHub → Vercel. Start free; paid pronunciation scoring comes later. More kids later.

### Where he is
Baseline scores and homework analysis live in `docs/private/learner-profile.md` (never committed). Summary: decoding short-vowel CVC words and Kindergarten high-frequency words is the bottleneck; listening comprehension is at grade level; homework practices sequence and compare/contrast. So: core practice = short-vowel CVC + heart words + sound games, plus a Story mode for the homework skills.

User decisions already made:
- sync from v1 (Supabase free tier)
- same git rules as mdragonsolutions-webapp
- Fish Audio for all audio, with a review pass
- soccer + building blocks theme with original art (no FIFA, LEGO or Minecraft names or look‑alikes)
- **work in auto mode after approval**

## Architecture (mirrors ASVAB Ready — `~/Documents/1_portafolio/ASVAB_test`)
- **TypeScript strict + Vite 6, no framework, vite-plugin-pwa, vitest.** Same aliases (`@domain`, `@ui`, `@data`) and the same `vite.config.ts` PWA shape.
- **Non‑negotiables (copied from ASVAB `CLAUDE.md`):**
  - SOLID in `src/domain/` (no DOM). Views only paint. `src/main.ts` is the only composition root.
  - `events` are the source of truth; Leitner boxes and mastery are rebuildable caches.
  - Every save carries `schemaVersion`; merges are a union by event id.
  - **All content is original.** Dolch is public domain. Never copy Evan‑Moor, i‑Ready or UFLI text; homework only tells us which skills to practice.
- **Port from ASVAB:**
  - `src/ui/dom.ts` (`h`, `replace`, `toast`, `svg`)
  - `src/ui/context.ts`
  - `src/domain/storage/{ProgressStore,IndexedDbStore,BackupService}.ts`
  - `src/domain/i18n/i18n.ts`
  - `src/ui/installPrompt.ts`, the icon set, and the `docs/PLAN.md` + `docs/STATUS.md` format

### Layout
```
src/domain/  content (types, UnitLibrary, StoryLibrary, Decodability) · srs (Leitner) · session (SessionPlanner, ActivityRunner, Timer)
             speech (PronunciationChecker port, WebSpeechChecker, AnswerMatcher, SentenceMatcher) · audio (AudioPort, ClipPlayer)
             writing (TraceScorer) · storage (events, Progress rebuild, IndexedDbStore, SupabaseSync, SyncingStore)
             profiles · rewards (goals, blocks, stadium) · i18n
src/ui/      AppShell · screens/ (PlayerPick, Session, Story, Celebration, Stadium, Parent/*) · activities/
src/data/    units/u01.json… · stories/s01.json… · heartwords.json · benchmarks.json · contrasts.json
public/audio/ words/ sentences/ sounds/ stories/   (generated MP3s, committed so Vercel needs no key)
scripts/     generate-audio.mjs · validate-content.mjs
supabase/    migrations/*.sql
docs/        PLAN.md · STATUS.md · research/ · private/ (scores, homework, learner profile — never committed)
```

## Learning design
- **Benchmarks** (exact codes and wording verified from the FLDOE B.E.S.T. ELA PDF in M0, then stored in `benchmarks.json`; every unit, story and activity is tagged):
  - Foundations ELA.1.F.1.2–1.4: phonological awareness, phonics, fluency
  - Reading: sequence, compare/contrast, key details
  - Vocabulary: word meanings
  - Conventions/spelling for writing mode
- **No three‑cueing:** no picture or emoji before he reads the word or sentence; pictures are rewards after reading. Enforced in data validation and the UI.
- **Placement: start at Unit 1** (short a CVC) with fast‑track review, per i‑Ready.
  - Heart words start with Dolch pre‑primer/primer (K gaps), then the **"story words"** from homework: first, next, then, last, after, before, soon, finally, same, different, both, they, she, what, there, inside, want.
- **Scope (≈30 weekly units):**
  - short a, i, o, u, e
  - short‑vowel contrast review
  - sh · ch/tch · th · wh/ck
  - l/r/s blends · final blends · ng/nk
  - a_e · i_e · o_e/u_e/e_e
  - -s/-es · -ed · -ing
  - ar · or · er/ir/ur
  - ee/ea · ai/ay · oa/ow · igh/y · oo · ou/ow · oi/oy
  - two‑syllable words
- **Each unit:** 8–12 decodable words, 3–5 heart words, 2–3 decodable sentences, rhyme families, contrast pairs, a stored `es` gloss (shown in phase 2).
- **Decodability check:** `validate-content.mjs` fails if a unit sentence uses a word not decodable with patterns taught so far and not an introduced heart word.
- **Spanish‑speaker trouble spots** (`contrasts.json`):
  - short i/ee
  - a/u/e
  - sh/ch, th, b/v
  - final consonants and clusters
  - initial s‑clusters
  - -ed

### Daily session (`SessionPlanner`; length set by the parent: 5 / 10 / 15 min)
- **Core, 5 min (every day):**
  1. **Warm‑up** (~1 min), rotating: Rhyme Match, Blend It (onset‑rime: /c/ + /at/), Clap the Syllables, Sound It Out.
  2. **Review** (~2 min): due Leitner cards. Read aloud → mic check → hear the model.
  3. **New words** (~1–2 min): 3 new (2 decodable + 1 heart). Hear → sound out → **say it 3 times** (3 kicks) → write.
  4. **Read a sentence:** one decodable sentence; tap a word to hear it; read the whole sentence aloud.
- **10 min:** core + **Story** (below).
- **15 min:** core + Story + games (Tricky Sounds, letter‑tile spelling).
- **Full time:** goals scored → blocks → build the stadium.

### Story mode (homework skills, original passages)
- **Two tiers:**
  - **Decodable stories:** only words from his units, so he reads them himself.
  - **Homework‑level stories:** Evan‑Moor‑like length and topics, with read‑along support.
- **Flow:**
  1. **Listen:** sentence‑by‑sentence audio with the current sentence highlighted; tap any word to hear it.
  2. **Read with me:** he reads each sentence aloud; `SentenceMatcher` scores word by word. **Words he misses become Leitner cards automatically**, linking stories back to word practice.
  3. **3 questions,** each option has a speaker button: sequence, alike/different, key detail.
  4. **Bonus:** word meaning (time words, synonyms such as last/finally) or a rhyme from the story.
  5. **Put it in order:** drag 3 sentence strips into first/next/last order.
- **Skill rotation** follows the homework skills (sequence, compare/contrast, then main idea/details as the workbook advances). Extra weight goes to his misses: alike vs different, and "words that tell when."

### Spaced repetition (`domain/srs/Leitner.ts`)
- 5 boxes with intervals 0/1/3/7/14 days; a miss sends the card to box 1; mastered after leaving box 5 twice.
- Rebuilt deterministically from `events`; one queue per profile.

### Activities (`src/ui/activities/`, each a small Screen over an `ActivityRunner` in the domain)
- **Listen & Find**
- **Sound It Out**
- **Rhyme Match**
- **Blend It**
- **Clap the Syllables**
- **Say It** (mic) — outcomes:
  - ✓ "Goal!"
  - "Almost — listen…" (never "wrong")
  - **"Grown‑up ✓"** override
- **Write It:**
  - trace on canvas, auto‑checked by `TraceScorer` coverage
  - write from memory, then compare to the model
  - letter tiles
- **Read the Sentence**
- **Tricky Sounds**
- **Story** steps (as above)

## Speech & audio
- **Model voice:** `scripts/generate-audio.mjs` uses the **Fish Audio API** (`FISH_API_KEY` in `.env.local`, gitignored; one child‑friendly voice).
  - Generates words, sentences, story sentences and isolated sounds (with spelling hints such as "mmm" and "sh").
  - A hash manifest regenerates only changed clips.
  - A **dev‑only Audio Review screen** lets you mark bad clips and retry them with a new hint. Clips that stay bad get an in‑browser recording override.
  - Runtime fallback: `speechSynthesis`.
- **Pronunciation check (free, v1):** `PronunciationChecker` port, implemented by `WebSpeechChecker` (`webkitSpeechRecognition`, en‑US, `maxAlternatives: 5`).
  - `AnswerMatcher` handles normalization, a homophone table and lenient rules for short words.
  - `SentenceMatcher` aligns the recognized words to the target sentence, giving a per‑word hit/miss and a fluency‑style accuracy.
- **Paid check (v1.2):** `AzurePronunciationChecker` calls a Vercel function `/api/pronounce` (key server‑side); it swaps in through `main.ts` only.
- **Privacy:** no recordings are stored. The parent settings explain (in Spanish) that recognition audio goes to Apple/Google, with a mic toggle; mic off = grown‑up check mode.

## Profiles, sync, parent area
- **Supabase free tier:** parent signs in with **email + 6‑digit OTP code**; magic links would open in Safari, outside the installed PWA. Each device signs in once; the child taps his player card.
- **Tables:**
  - `profiles` (id, family_id = auth.uid(), first_name, avatar, settings jsonb)
  - `events` (id uuid, profile_id, item_id, activity, result, ms, device, created_at), append‑only
  - `homework` (v1.1)
  - RLS by family_id
  - SQL lives in `supabase/migrations/`
- **SyncingStore** (decorator over IndexedDbStore): local write + outbox → push when online → pull since a cursor → union merge. Fully usable offline.
- **Parent area** (Spanish, EN toggle; parent gate: hold 3 s + a simple sum):
  - **Dashboard:**
    - minutes per day
    - current unit
    - words mastered/learning
    - trouble words and sounds
    - story question accuracy by skill
    - progress per B.E.S.T. benchmark
    - a **"Next FAST check"** card with the scores the parent enters and the Level 3 band
  - **Settings:** 5/10/15 min, mic, writing mode, start unit, profiles, sync status, backup.
- **v1.1 "Tarea de hoy" (homework helper):** the parent types this week's homework passage (kept privately in the family's own rows, never published).
  - The app reads it aloud with device TTS, offers tap‑to‑hear words and read‑along with the mic.
  - Unknown words are queued into his Leitner deck.
  - Then: "Para mamá" Spanish meanings, examples and per‑unit "Cómo ayudar" tips.
- **Data minimization:** first name only. The scores PDFs contain his full name, student ID and FLEID, so they stay in `docs/private/` (excluded). The learner summary lives in `docs/private/learner-profile.md`, also excluded. A COPPA review is required before any other family's kids are added.

## Child UX & theme
- Every instruction is spoken; icons over text; ≥64 px targets; one action per screen.
- **Andika** font, self‑hosted.
- Light theme; reduced motion respected.
- Soccer match + blocks build a stadium; original art only.
- iPad Guided Access tip in the parent guide.

## Milestones (auto mode after approval; STATUS.md updated each session)
| # | Milestone | Done when |
|---|---|---|
| M0 | Setup & research | Memory files written. `git init`; `.git/info/exclude` covers CLAUDE.md, `.claude/`, `docs/private/`, `temp/`, `.env.local`; local identity `mondragon-developer` noreply. CLAUDE.md in the ASVAB format. `docs/research/`: B.E.S.T. codes verified (FLDOE PDF), scope & sequence, homework‑skill map. `docs/private/learner-profile.md`. |
| M1 | Scaffold + **device spike** | Vite/TS/PWA skeleton; spike page for SpeechRecognition (Safari tab **and** installed PWA), mic permission, audio unlock, Pencil canvas. Deployed to a Vercel preview so you can test on the real iPad/iPhone/Mac. Go/no‑go recorded. |
| M2 | Domain + tests | Content types, Leitner, SessionPlanner, AnswerMatcher, SentenceMatcher, TraceScorer, event→progress rebuild, decodability validator; vitest green. |
| M3 | Content + audio | Units 1–8 (short vowels, contrasts, sh/ch/th), Dolch + story words, 6 original stories (3 decodable, 3 homework‑level: sequence ×3, compare/contrast ×2, time words ×1); validator passes; Fish clips generated; Audio Review screen. |
| M4 | Child experience | Player pick → 5‑min core → Story → celebration → stadium; warm‑up games. |
| M5 | Writing | Trace, write‑from‑memory, letter tiles; iPad Pencil + iPhone finger. |
| M6 | Accounts, sync, parent area | OTP login, profiles, SyncingStore, Spanish dashboard and settings, backup. |
| M7 | Launch v1 | Icons, install, offline, real‑device QA, production on Vercel. |
| v1.1 | Homework helper + mom's Spanish + content | "Tarea de hoy", "Para mamá", units 9–30, more stories, weekly summary. |
| v1.2 | Paid pronunciation | Azure via a Vercel function behind `PronunciationChecker`. |

**Things only you can do** (I'll pause and ask at these points):
- Create the GitHub repo and connect Vercel.
- Create the Supabase project (and paste the URL/anon key).
- Put the Fish Audio key in `.env.local` and pick a voice.
- Test the M1 spike on the real devices.

## Verification
- Every task: `npm test && npm run typecheck && node scripts/validate-content.mjs && npm run build`.
- **Domain tests:**
  - Leitner intervals and demotion
  - the planner fits 5/10/15 budgets
  - AnswerMatcher homophones and near‑miss rejection
  - SentenceMatcher alignment
  - decodability rejects untaught words
  - no picture‑before‑read in data
  - sync merge is a union and idempotent
  - TraceScorer thresholds
- **UI:** Playwright smoke at 390 px, 820 px and laptop width: pick player → core → story → celebration → parent gate → Spanish dashboard.
- **Sync:** two browsers on one account; one goes offline, practices, reconnects; event counts match.
- **Offline:** stop the server after the first load; a full session still runs.
- **Real devices:** iPad + Pencil, iPhone, Mac, in both the installed PWA and a Safari tab.
- **Acceptance:** one timed real session with your son. Any word the mic misjudged becomes an AnswerMatcher test case.
