# STATUS — Goal Reader tracker

Update at the end of every working session. Newest log entry on top.

## Snapshot (2026-10-04, after parent feedback round 1)
- Build: `npm test` 111/111 · e2e 12/12 (after Practice a skill) · earlier: `npm test` 93/93 · e2e 9/9 (after final-checker fixes) · before: `npm test` 85/85 · e2e 6/6 (full match ×3 sizes + blocked-mic ×3) · previously `npm test` 75/75 · typecheck clean · `npm run validate` ✓ · build OK (precache ≈ 260 KB) · `npm run e2e` 3/3 (iPhone, iPad WebKit, laptop) incl. recording, intros, word bank, every parent tab
- Content: **14 units** (short vowels → th, ch/tch/wh/ck, blends, ng/nk, a_e, i_e/o_e/u_e, -ed/-ing) · 146 word cards · 55 heart words · **25 challenge words** from his homework topics (syllable split) · **10 stories** (5 decodable, 5 read-along)
- Audio: catalog 938 clips ≈ $0.16 with Fish; none generated yet (device voice fallback)
- Sync: code complete, not connected · Deploy: not yet

## Milestones
| # | Milestone | State | Notes |
|---|---|---|---|
| M0 | Setup & research | ✅ | git + exclude + noreply identity; `docs/research/01` (B.E.S.T. verified), `02` (Fish API, iOS speech); private learner profile |
| M1 | Scaffold + device spike | 🟡 | `/spike.html` built (env, audio, word mic, mic-after-audio hang test, sentence mic, Pencil canvas, copy report). **Needs real-device run** |
| M2 | Domain + tests | ✅ | Leitner, SessionPlanner, AnswerMatcher, SentenceMatcher, Grading, MicHealth, TraceScorer, Dashboard, events, PracticeLog sync, IndexedDB |
| M3 | Content + audio | 🟡 | Units 1–8, heart words, 6 stories, validator ✓. Fish generator + Audio Review screen ready; clips not generated |
| M4 | Child experience | ✅ | Players → Home → Kick off → warm-up → review → new words ×3 kicks → sentence → story → full time → extra time → stadium |
| M5 | Writing | 🟡 | Trace (auto-scored), write-from-memory (self check), letter tiles. Needs Pencil/finger QA on devices |
| M6 | Accounts, sync, parent area | 🟡 | Parent gate, Spanish dashboard (chart, tricky words, story skills, benchmarks, FAST card), settings, players, backup. Supabase wiring untested against a live project |
| M7 | Launch v1 | ⬜ | Icons ✅, offline precache ✅; deploy + real-device QA pending |
| v1.1 | Homework helper + mom's Spanish + units 9–30 | ⬜ | |
| v1.2 | Paid pronunciation (Azure) | ⬜ | |

## Waiting on the owner
1. Run `/spike.html` on iPad, iPhone, Mac (Safari tab + Home Screen) and paste the report.
2. GitHub repo + Vercel project (docs/SETUP.md §1).
3. Supabase project + email template with `{{ .Token }}` + env vars (§3).
4. Fish Audio key + voice id in `.env.local` (§4), then review sounds.

## Backlog (priority order)
**P1 — before daily use**
- [ ] Real-device QA: mic in Safari tab vs installed PWA; mic-after-audio hang (iOS 27); Pencil trace thresholds (`TRACE_PASS`); audio unlock.
- [ ] Generate + review Fish clips, especially the 27 isolated sounds.
- [ ] Connect Supabase; two-device sync test (iPad offline → practice → online → iPhone sees it).
- [ ] First real 5- and 10-minute session with him, timed; add every misjudged word to `tests/matchers.test.ts`.

**P2 — quality**
- [ ] Fluency timing: words-correct-per-minute from Read With Me (norms: 29 winter / 60 spring, grade 1) on the dashboard.
- [ ] Placement check (a 2-minute parent-run screener) instead of choosing the start unit by hand.
- [ ] Segmenting game (Elkonin boxes, ELA.1.F.1.2.a) as a fifth warm-up.
- [ ] Accessibility pass: focus order in activities, VoiceOver labels on tiles, contrast of `.muted` on white.

**P3 — v1.1 / v1.2**
- [ ] "Tarea de hoy" homework helper (parent types the passage; device TTS + read-along + unknown words to deck).
- [ ] "Para mamá": Spanish meanings (`es` already in data), examples, "Cómo ayudar" tips per unit.
- [ ] Units 9–30 (blends, ng/nk, VCe, inflections, r-controlled, vowel teams, two-syllable) + 2 stories per unit.
- [ ] Paired-text compare/contrast stories (B.E.S.T. ELA.1.R.3.3 compares two texts, not two characters).
- [ ] Azure pronunciation assessment behind `PronunciationChecker` via a Vercel function.
- [ ] COPPA review before any other family's children are added.

## Decisions log
- 2026-10-04 · **Practice a skill** (parent request "let the adult choose the topic, attached to the standards"): home button behind a 1.5 s hold gate opens a menu grouped by Florida B.E.S.T. strand (sounds F.1.2, phonics F.1.3, sight words F.1.4.a, fluency F.1.4, stories R, vocabulary V, writing C), each card with its codes, his accuracy and a ⭐ Recomendado (weakest with ≥4 tries <80%, else least recently practiced). Chosen topics start with ≤2 min of due reviews (toggle). Phonics units ahead of his level are allowed and marked "Adelantado". Automatic Kick off stays the default.
- 2026-10-04 · Benchmarks are derived from events (`standards/Standards.ts` `benchmarksOf`), not stored, so all history counts and the parent summary lists every standard practiced (accuracy, tries, last day). Rhyme is labeled ELA.K.F.1.2.b "Repaso de kínder" (verified K code); grade-1 warm-ups now lead with blend/segment.
- 2026-10-04 · New: Sound boxes (Elkonin segmenting, ELA.1.F.1.2.a/.d, audio only; skips x/nk/-ed/-ing); one-minute read (ELA.1.F.1.4: grown-up marks misreads and last word, NAEP 1–4 prosody; WCPM vs B.E.S.T. Appendix E norms, fall compared with the winter 50th percentile = 29, spring 60); retell beginning/middle/end after every story (R.3.2.a); "what lesson…?" on stories with a moral (R.1.2: s02, s04, s09 — many stories intentionally have none); "Tarea de esta semana" (homework skill for 7 days steers automatic story choice).
- 2026-10-04 · Final-checker review (11 findings, all fixed): shared serialized Outbox (events could drop out of the upload queue when a record and a sync interleaved); `WebAudioPlayer.sequence()` cancel counter separate from per-clip halts (it stopped after the first clip, so Rhyme Time never said the target word); AudioEngine.play awaits resume + watchdog (iOS-suspended context froze sessions); backup/sync input validated (`isPracticeEvent` tightened, `toProfile` with palette-only colors); coach bar hidden in step 4 + global `[hidden]` rule; command waiters disposable; clip loader caches only successes; trace pad scores in bitmap space; parent gate typed answer; dead code and the `html`/innerHTML escape hatch removed.
- 2026-10-04 · **Reading coach** (parent request): every story/sentence goes sentence by sentence through 4 steps — 🐢 app reads word by word (yellow + 👆), 🐇 app reads it whole (pointed), 👦 he reads word by word (yellow waits silently; grown-up taps ✓ or 🔊 Help), 👦 he reads the whole sentence (record → his voice → model → ✓). Control bar: ⏸/▶, 🐢 again, 🐇 again, ⏭ next, Skip to questions. Stories start with the whole story read aloud and pointed. Each sentence is saved as an assessment (`sentence` event with words / wordsRead / whole / helped) and listed in the parent summary "Lectura oración por oración"; helped words become review cards.
- 2026-10-04 · **Recording playback bug** ("Hear both again" played only the app voice): his take was played by a fresh `<audio>` element after several awaits (iOS blocks/mutes that; errors were swallowed). Now takes play through the same unlocked Web Audio engine as the clips (`platform/AudioEngine.ts`), with `<audio>` only as a fallback; iOS Audio Session set to play-and-record while recording and playback after (speaker, not earpiece; also ignores the silent switch). Every take is measured (seconds, peak, bytes): the grown-up sees "🎙 Grabado: 1.8 s", a live level bar while recording, and a parent-language warning for blocked/missing/busy mic, empty take, silent take or unplayable format. `/spike.html` card 3c reports exactly what a device captures.
- 2026-10-04 · Parent feedback round 1: (1) instructions unclear → every activity opens with a "how to play" card (spoken child line + Spanish grown-up role), a ? button on every screen, counters ("New word 2 of 3", "Say it 3 times: 1 of 3"), and a "Today's match" overview before kick-off; (2) wanted to hear his voice → default check mode is now **Record**: he records, hears himself, hears the model, grown-up taps ✓ (recordings in memory only); automatic mic is an opt-in setting; (3) reading too fast → model sentences/stories read **word by word with the word highlighted and a 👆 pointer** by default (🐢/🐇 toggle; natural-pace mode points by estimated timing); sentence clips generated at 0.8 speed.
- 2026-10-04 · "Words more complex": units 9–14 added; one challenge word a day (10/15-min sessions) from homework topics, taught whole with syllable tiles and a separate slow clip (slowing playback would drop the pitch). Words with untaught vowel patterns (play, ball, won, looking) were removed or made heart words so Sound It Out never teaches a wrong sound.
- 2026-10-04 · Word Bank ("My words"): every word to hear, hear slowly, record-and-compare, trace, build; 🇪🇸 gloss for mom. Practice there never moves review boxes.
- 2026-10-04 · Child-facing text is always English (even "Let's go!"); only grown-up notes follow the parent language setting.
- 2026-10-04 · SOLID/KISS refactor: PracticeLog split into PracticeLog (events + outbox) / ProfileRepository / SyncService / BackupService; read-aloud loop moved out of Kit into `ReadAloud` (one sentence routine shared by Sentence and Story); step dispatch is a typed runner table (`activities/runners.ts`); ParentScreen reduced to tabs with one module per tab; summary takes the locale as a parameter; unused NoMicChecker removed. Tests 71/71 and e2e 3/3 before and after; e2e now also renders every parent tab.
- 2026-10-04 · Parent area defaults to Spanish regardless of device language; an English switch is remembered per device.
- 2026-10-04 · Mic failures (hang/error) never cost the child a try; two in a row switch the session to Grown-up ✓ (iOS 27 recognition hangs after audio playback — research doc 02).
- 2026-10-04 · "Close" reads (th→d, sh→ch, b/v) count as a goal but don't promote the card; vowel swaps (cat→cut, ship→sheep) are always misses — that contrast is the skill.
- 2026-10-04 · Read-along stories: he reads the 3 key sentences (the order strips), decodable stories he reads entirely. Max 3 missed story words become cards per story.
- 2026-10-04 · New words come only from the current unit; a heavy review load (>12 due) cuts new words to 1, >20 to 0.
- 2026-10-04 · Phonological-awareness games are audio-only (B.E.S.T. ELA.1.F.1.2 clarification); Sound It Out shows letters (phonics).
- 2026-10-04 · Validator runs through vite-node (`scripts/validate-content.ts`) so it reuses the domain's Decodability code.

## Session log
- **2026-10-04 · S7** — Repo pushed to GitHub (`mondragon-developer/learn-to-read`). Owner connected Supabase ↔ GitHub (Deploy to production on `main`) and Supabase ↔ Vercel. This push triggers the first migration and a Vercel build with the integration keys. Still manual: the email-code template (`{{ .Token }}`).
- **2026-10-04 · S6** — Practice a skill (3 phases): topic catalog + planner.planTopic + recommendation; standards mapping + dashboard; Sound boxes; one-minute read; retell; moral; homework week. Tests 111/111; e2e 12/12 (new: practice menu → sound boxes → one-minute read → summary).
- **2026-10-04 · S5** — Final-checker pass: 11 fixes with regression tests (outbox interleavings, sequence plays all clips, malformed backup, transport pause/commands/leak, gate rejects wrong answer). Tests 93/93; e2e 9/9.
- **2026-10-04 · S4** — Reading coach (4-step sentence flow, transport with pause/replay/next, assessment events + dashboard). Recording fix (shared AudioEngine, audio session, take checks, error messages, level meter), spike card 3c. Tests 85/85; e2e 6/6 (adds blocked-mic test; fake recorder now emits a real WAV).
- **2026-10-04 · S3** — Parent feedback round 1 (instructions, record & hear, pointer reading, harder words, word bank). Units 9–14, 25 challenge words, 4 stories. ReadAloud record/mic/buttons modes; AudioPort.follow; VoiceRecorder port. E2E stubs mic/recorder/speech per engine; runs with reduced motion (pulsing buttons never settle for Playwright).
- **2026-10-04 · S1** — Plan approved. M0 research (FL B.E.S.T. verified via agent; Fish API + iOS speech via agent). Built domain (71 tests), content units 1–8 + 6 stories, all activities, parent area, Supabase adapter, spike page, icons, e2e on 3 sizes. Next: owner steps above, then M1 device results.
