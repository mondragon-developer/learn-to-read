# STATUS — Goal Reader tracker

Update at the end of every working session. Newest log entry on top.

## Snapshot (2026-10-16, end of S9)

- Production: **https://learn-to-read-eight.vercel.app** · GitHub `mondragon-developer/learn-to-read` · app release **`37455fc`** deployed successfully through Vercel. Live WebKit check at iPad dimensions: HTTP 200, Josh selected and saved, its Fish preview fetched and played, no page errors.
- Validation: **120/120 unit tests · 42/42 browser tests** across phone, iPad-sized WebKit and desktop; typecheck, content validation and production build pass. Browser coverage includes both voices offline, saved voice selection after reload, whole sessions, sentence continuation, skipping without grading, late speech results, and recorder shutdown. Physical-device QA remains open.
- Content: 14 units · 146 word cards · 55 heart words · 25 challenge words · 10 stories (3 with a moral).
- Audio: **969 recordings per voice, 1,938 total**. Teacher and Josh use Fish Audio; separate manifests, content-versioned MP3s, pitch-preserving speeds, offline precache. The selected voice is saved per player; installed English device voices are optional.
- Child flow: independent practice defaults for new players; Story Time defaults to one sentence → Continue, with optional sentence playback and Skip to questions. Skip this part / Skip section stay available; a correct new word can continue after one checked reading.
- Settings: visible sticky **⚙️ Settings** button opens the parent gate and then the settings tab. Opening settings ends the current session; already saved answers remain. Continue-only reading is unverified practice, not a pronunciation pass.
- Fish balance: **218,873 package credits**, verified 2026-10-16. Latest update used **335** credits for revised Teacher instructions + **12,230** for Josh = **12,565**. Website credits are used through the authorized MCP; the developer API balance is separate. Replaying or switching bundled voices uses no credits.
- Supabase: project/migration recorded in S7–S8; code supports the explicit public environment-variable names. Email-code sign-in and two-device sync were not verified in S9.
- Custom domain: `reading.mdragonsolutions.com` remains planned; no DNS/domain migration performed in S9. Keep the existing address until the migration checklist in `docs/DOMAIN.md` is completed.

## Milestones

| # | Milestone | State | Notes |
|---|---|---|---|
| M0 | Setup & research | ✅ | git + exclude + noreply identity; `docs/research/01` (B.E.S.T. verified), `02` (Fish API, iOS speech); private learner profile |
| M1 | Scaffold + device spike | 🟡 | `/spike.html` built (env, audio, word mic, mic-after-audio hang test, sentence mic, Pencil canvas, copy report). **Needs real-device run** |
| M2 | Domain + tests | ✅ | Leitner, SessionPlanner, AnswerMatcher, SentenceMatcher, Grading, MicHealth, TraceScorer, Dashboard, events, PracticeLog sync, IndexedDB |
| M3 | Content + audio | 🟡 | Content validated; Teacher + Josh generated and deployed (969 clips each), offline playback tested. Human pronunciation review, especially all 39 sound clips per voice, remains open |
| M4 | Child experience | ✅ | Independent mode; sentence-by-sentence Story Time; skip parts/sections; continue after a correct word; visible settings and voice selector. Assisted reading remains available |
| M5 | Writing | 🟡 | Trace (auto-scored), write-from-memory (self check), letter tiles. Needs Pencil/finger QA on devices |
| M6 | Accounts, sync, parent area | 🟡 | Parent gate, Spanish dashboard, settings, players, backup, practice menu by standard. Supabase migration previously applied; live account configuration, email codes and multi-device sync still need verification |
| M7 | Launch v1 | 🟡 | Vercel production live ✅; both Fish voices and new reading flow deployed; custom domain and physical-device acceptance pending |
| v1.1 | Homework helper + mom's Spanish + units 9–30 | ⬜ | |
| v1.2 | Paid pronunciation (Azure) | ⬜ | |

## Next session (S10): real iPad acceptance + domain/sync follow-up

1. Refresh the installed app on the child's iPad. Try a five-minute session and a Story Time session: Continue, skip one sentence/question, skip a section, and continue after a correct word.
2. In **⚙️ Settings → Voz de lectura / Reading voice**, preview Teacher and Josh, save a choice, reopen the app and try airplane-mode playback. Review all **39 sound clips per voice** in Audio Review; record any pronunciation corrections.
3. Run `/spike.html` in Safari and from the Home Screen, especially mic-after-audio, card **3c** (record/hear yourself), and finger/Pencil tracing. Browser emulation does not establish real iPad speech-recognition reliability.
4. Verify Supabase account configuration and email codes, then test iPad offline practice → online sync → the same history on a second device.
5. Resume the existing custom-domain plan in **docs/DOMAIN.md**: add `reading.mdragonsolutions.com` in Vercel; use its exact CNAME target in Cloudflare with **DNS only**; verify HTTPS; update Supabase URLs; sync/export before changing origins; reinstall the Home Screen app and reallow the microphone. Update README/SETUP only after the new address works.

## Waiting on the owner

1. ✅ GitHub/Vercel setup · ✅ Supabase project/migration previously recorded · ✅ Fish MCP authorization and Teacher/Josh generation. **No Fish API key is needed for the deployed voices.**
2. Real iPad/iPhone checks: Safari + installed PWA, microphone permissions, audio output, offline use, finger/Pencil tracing; share `/spike.html` reports.
3. Listen to Teacher and Josh, especially the isolated sounds, and note clips that need pronunciation corrections.
4. Verify **Cuenta y respaldo** shows account sign-in. If needed, check the Vercel public URL/key variables and Supabase **Magic Link** / **Confirm signup** templates with `{{ .Token }}` and six-digit OTPs; sign in with the same email on each device.
5. Dependency alerts/PR review carried forward from S8; current PR resolution was not checked during this session.

## Backlog (priority order)

**P1 — before daily use**

- [ ] Custom domain `reading.mdragonsolutions.com` (carried forward to S10; docs/DOMAIN.md) and move devices to it.
- [ ] Real-device QA: mic in Safari tab vs installed PWA; mic-after-audio hang (iOS 27); Pencil trace thresholds (`TRACE_PASS`); audio unlock.
- [x] Generate and deploy Teacher/Josh Fish libraries; verify both offline (S9).
- [ ] Human pronunciation review of both voices, especially the **39 isolated sound clips per voice**.
- [ ] Verify Supabase account setup; two-device sync test (iPad offline → practice → online → iPhone sees it).
- [ ] First real 5- and 10-minute session with him, timed; add every misjudged word to `tests/matchers.test.ts`.

**P2 — quality**

- [x] Fluency timing: one-minute read with words correct per minute vs B.E.S.T. norms (S6).
- [ ] Placement check (a 2-minute parent-run screener) instead of choosing the start unit by hand.
- [x] Segmenting game (Elkonin boxes, ELA.1.F.1.2.a/.d) as a fifth warm-up (S6).
- [x] Sentence-by-sentence Story Time, skip controls, correct-word continuation, accessible Settings entry and per-player Fish voice selection (S9).
- [ ] Accessibility pass: focus order in activities, VoiceOver labels on tiles, contrast of `.muted` on white.

**P3 — v1.1 / v1.2**

- [ ] "Tarea de hoy" homework helper (parent types the passage; device TTS + read-along + unknown words to deck).
- [ ] "Para mamá": Spanish meanings (`es` already in data), examples, "Cómo ayudar" tips per unit.
- [ ] Units 9–30 (blends, ng/nk, VCe, inflections, r-controlled, vowel teams, two-syllable) + 2 stories per unit.
- [ ] Paired-text compare/contrast stories (B.E.S.T. ELA.1.R.3.3 compares two texts, not two characters).
- [ ] Azure pronunciation assessment behind `PronunciationChecker` via a Vercel function.
- [ ] COPPA review before any other family's children are added.

## Decisions log

- 2026-10-16 · **Flexible reading:** Story Time defaults to a whole sentence with Continue; no microphone or adult per-word check is required. Guided reading remains an option. Continue records unverified practice; skips do not create passes or misses. Correct new-word results are saved before the Continue control, and three repetitions are no longer compulsory after a correct reading.
- 2026-10-16 · **Cancellation:** each skippable part owns its DOM and guarded audio/mic access. Skipping or leaving cancels speech recognition, recording and playback; late results cannot assess the next part. Mic-failure state stays shared across the session.
- 2026-10-16 · **Independent mode:** new players use five-minute sessions, tracing and no challenge word by default. Mic checks fall back to child-led listen/repeat. Unverified practice stays outside checked accuracy, mastery and goal awards; existing parent check-mode choices are preserved.
- 2026-10-16 · **Voices:** Teacher remains the default; the owner explicitly requested Josh alongside it. Keep separate Fish projects and manifests. Use the authorized website-credit MCP for generation, quote before spending, and poll project/block status while generation is pending instead of resubmitting it. Ship recordings with the app; no Fish credentials go to the browser.
- 2026-10-16 · **Settings access:** a sticky, labeled Settings button opens the parent gate directly to the settings tab. Voice choice supports preview and save per player. Settings ends the active session while preserving already saved answers; resuming the exact interrupted activity is not implemented.
- 2026-10-04 · Custom domain will be the subdomain `reading.mdragonsolutions.com` (owner's company domain; registrar + DNS at Cloudflare). CNAME to Vercel with Cloudflare proxy **off** (DNS only) so Vercel can issue SSL and the service worker isn't cached by Cloudflare. No code change needed (relative URLs, `start_url: '/'`). Browser data is per address, so each device moves by sync/backup and is re-installed. Vercel Hobby is non-commercial: switch to Pro if this ever becomes a Mdragon Solutions product.
- 2026-10-04 · Supabase ↔ Vercel integration requires a paid plan: keys are added to Vercel by hand. Vercel warns that `VITE_` values reach the browser; correct and intended for the URL and publishable key (RLS protects data), so they're saved as Config. Never the secret key.
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

### 2026-10-16 · S9 — Fish voices, independent iPad practice and flexible reading

- **Shipped:** `2e6017c` introduced independent practice and 968 Teacher recordings; `37455fc` added sentence-by-sentence Story Time, skip controls, immediate continuation after a correct new word, visible Settings, and Teacher/Josh selection. Three revised/new Teacher instructions bring each library to **969 clips**.
- **Verified:** 120 unit tests and 42 browser tests passed; typecheck/content/build passed. Offline tests physically stopped the origin server and confirmed both voices could play without device TTS. Voice choice survives reload. Skip tests cover no false grades, late mic answers and recording cleanup. A live WebKit check on the production URL selected/saved Josh and started its actual Fish preview with no page errors. Actual child/device acceptance and complete phonics listening review remain pending.
- **Published:** app commit `37455fc` pushed to `main`; Vercel reported deployment success. Production remains **https://learn-to-read-eight.vercel.app**. The custom-domain work planned in S8 was deferred, not performed.
- **Fish accounting:** 335 credits for updated Teacher instructions; 12,230 for the complete Josh library; **218,873 credits remaining** after generation. Teacher project: `a726aebf18ba4092ad3f05bf6a30668f`; separate Josh project: `54c6ae34ada147c7a40c998290c7b9be`. Automatic approval review rejected recasting the original project; a separate Josh project preserved Teacher and completed the requested addition.
- **Recovery references:** committed MP3s and `src/data/audio-manifest.json` / `src/data/audio-josh-manifest.json` are the durable app assets. Local generation receipts and plans are under `/tmp/goal-reader-voices/` (temporary; do not rely on them surviving cleanup). The importer supports a separate `--manifest` for Josh; see SETUP §4.
- **Handoff:** complete the S10 iPad/phonics checks, verify account sync, then resume the domain migration checklist. Earlier tracker history and the existing domain plan were preserved.

### Earlier sessions

- **2026-10-04 · S8** — Supabase ↔ Vercel integration turned out to be paid → manual keys (SETUP §3 rewritten, explained step by step with examples; Vercel `VITE_` warning answered: save as Config, publishable key only). Planned the custom domain `reading.mdragonsolutions.com`: checked DNS (Cloudflare, no conflicting records, no CAA), main site not live, app has no absolute URLs → docs/DOMAIN.md. Tracker refreshed (snapshot, milestones, waiting-on-owner, next session). Next: S9 domain.
- **2026-10-04 · S7** — Repo pushed to GitHub (`mondragon-developer/learn-to-read`). Owner connected Supabase ↔ GitHub (Deploy to production on `main`): commit 297c859 reported "Supabase Preview: success" and a Vercel production deploy. The Supabase ↔ Vercel integration needs a paid plan, so the two keys go into Vercel by hand (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Still manual: the email-code template (`{{ .Token }}`). Dependabot opened a PR bumping @vitest/mocker (test-only) — review before merging.
- **2026-10-04 · S6** — Practice a skill (3 phases): topic catalog + planner.planTopic + recommendation; standards mapping + dashboard; Sound boxes; one-minute read; retell; moral; homework week. Tests 111/111; e2e 12/12 (new: practice menu → sound boxes → one-minute read → summary).
- **2026-10-04 · S5** — Final-checker pass: 11 fixes with regression tests (outbox interleavings, sequence plays all clips, malformed backup, transport pause/commands/leak, gate rejects wrong answer). Tests 93/93; e2e 9/9.
- **2026-10-04 · S4** — Reading coach (4-step sentence flow, transport with pause/replay/next, assessment events + dashboard). Recording fix (shared AudioEngine, audio session, take checks, error messages, level meter), spike card 3c. Tests 85/85; e2e 6/6 (adds blocked-mic test; fake recorder now emits a real WAV).
- **2026-10-04 · S3** — Parent feedback round 1 (instructions, record & hear, pointer reading, harder words, word bank). Units 9–14, 25 challenge words, 4 stories. ReadAloud record/mic/buttons modes; AudioPort.follow; VoiceRecorder port. E2E stubs mic/recorder/speech per engine; runs with reduced motion (pulsing buttons never settle for Playwright).
- **2026-10-04 · S1** — Plan approved. M0 research (FL B.E.S.T. verified via agent; Fish API + iOS speech via agent). Built domain (71 tests), content units 1–8 + 6 stories, all activities, parent area, Supabase adapter, spike page, icons, e2e on 3 sizes. Next: owner steps above, then M1 device results.
