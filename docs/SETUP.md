# Setup — the steps only the owner can do

Everything below is free except Fish Audio (pennies: the full clip set is ≈ $0.18 before retries).

## 1. GitHub + Vercel (hosting)
1. Repo: https://github.com/mondragon-developer/learn-to-read (this folder's `origin`; `git push` publishes).
   Local-only files (`CLAUDE.md`, `docs/private/`, `.env.local`) are excluded in `.git/info/exclude` and never leave this Mac.
2. vercel.com → **Add New → Project** → import the repo. Vercel reads `vercel.json` (Vite, `npm run build`, `dist`). Deploy.
3. You get `https://learn-to-read-xxxx.vercel.app`. Every push to `main` redeploys.
4. Custom address `reading.mdragonsolutions.com`: see **docs/DOMAIN.md** (planned for the next session).

## 2. Device check (milestone M1) — do this first
On the **iPad, iPhone and Mac**, open `https://<your-app>.vercel.app/spike.html`:
1. In a normal Safari tab, run cards 1–5 with your son (3b: the voice says a word, then the mic listens; 3c: record and hear yourself).
2. Add it to the Home Screen (Share → Add to Home Screen), open it from the icon, and run cards 3 and 3b again.
3. Tap **Copy report** and paste it into the chat. It decides whether the free mic check is reliable on each device or use listen-and-repeat in independent mode. Automatic recognition still needs a real-device check; browser tests simulate audio.

## 3. Supabase (sync between iPad, iPhone and Mac)

### Tables: Supabase ↔ GitHub integration (free, connected 2026-10-04)
- Project → **Settings → Integrations → GitHub** → `mondragon-developer/learn-to-read`, working directory `.`, production branch `main`, **Deploy to production** on.
- Every push to `main` applies new files in `supabase/migrations/` (the check "Supabase Preview" appears on the commit in GitHub). Confirm in **Database → Tables**: `profiles` and `events`.
- If the tables are ever missing: **SQL Editor** → paste and run `supabase/migrations/20261004000000_init.sql` (safe to run more than once).

### Keys: add them to Vercel by hand (the Supabase ↔ Vercel integration is a paid feature)
1. Supabase → **Project Settings → API** (or **API Keys**): copy the **Project URL** and the **anon / publishable** key. Never the `service_role` / secret key.
2. Vercel project → **Settings → Environment Variables** (All Environments):
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = anon / publishable key
3. **Deployments → ⋯ → Redeploy** (keys are baked in at build time).
4. Locally (optional): the same two lines in `.env.local`.

The app would also read `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` if a paid integration ever sets them (`supabasePublicEnv` in `vite.config.ts`); either way the secret key is never exposed.

### Always manual: the sign-in email must send a code
The GitHub integration ignores Auth settings. In **Authentication → Emails (Templates)**, replace the body of **Magic Link** and **Confirm signup** with:
```html
<h2>Goal Reader</h2>
<p>Your code / Su código: <strong>{{ .Token }}</strong></p>
```
and in **Authentication → Providers → Email** check Email is enabled and **Email OTP Length = 6**. (A link would open Safari outside the installed app and the sign-in would be lost.)

### Then, on each device
🔒 → **Cuenta y respaldo** → your email → the 6-digit code. Once per device (iPad, iPhone, Mac).

Free plan notes: a project with no activity for a week is paused (daily practice keeps it awake; after a long break, click **Restore** in the dashboard). The built-in email sender allows only a few emails per hour; if a code doesn't arrive, wait a few minutes.

## 4. Fish Audio (natural voice for all clips)

The app includes **Teacher** (`73b5c16a6e504d6a97868581ada2b8d3`) and **Josh** (`c646b42922ff446691f685aa4297755b`) recordings from Fish `s2.1-pro`. Fish's OAuth MCP connection uses the website plan credits; the separate developer API generator below requires an API balance. No Fish credentials are shipped to the app.

For website credits, export the catalog with `npm run audio -- --export=/tmp/goal-reader-voice-plan.json`. Generate matching blocks through Fish MCP, using the same voice and exact `ttsText`. Obtain a `studio_generate(dry_run=true)` quote before generation. Save a receipt JSON with `voice`, `model`, and `clips: [{key, text, audio_url}]` from the completed blocks. Then run:

```bash
python3 scripts/import-fish-audio.py /tmp/goal-reader-voice-plan.json /tmp/fish-receipts.json --ffmpeg /path/to/ffmpeg
```

The importer validates the text-to-key mapping, downloads recordings, uses FFmpeg `atempo` to apply each catalog speed without lowering pitch, and registers versioned MP3 filenames in `src/data/audio-manifest.json`. It resumes completed files without another Fish charge. Keep the receipts locally for future imports. Commit the MP3s and manifest together, build, and deploy. The installed app precaches the files for offline replay.

### Alternative: developer API credits

1. fish.audio → API keys → create a key.
2. Pick a voice: browse fish.audio, or list voices:
   ```bash
   curl -s "https://api.fish.audio/model?page_size=20&language=en&title=kids" -H "Authorization: Bearer $FISH_API_KEY" | jq '.items[] | {_id, title}'
   ```
   Choose a clear, warm US-English voice; the `_id` is the voice id.
3. Create `.env.local`:
   ```
   FISH_API_KEY=...
   FISH_VOICE_ID=...
   ```
4. Preview: `npm run audio -- --dry --only=prompt --limit=5`, then `npm run audio -- --only=prompt --limit=5`. Listen before generating the rest with `npm run audio`. The same voice ID is required for every batch. `--redo=sound:a,sound:t` regenerates only those keys; `--only=sound` selects the phonics batch.
5. Open the app → ⚙️ Settings → Ayuda → **Revisar los audios**. Listen to the *sound* tab first (isolated sounds are the hard ones). Mark bad clips; for each, adjust its hint in `SOUND_HINTS` (`src/domain/audio/AudioCatalog.ts`) and run `npm run audio -- --redo=sound:a,sound:t`.
6. Commit the MP3s in `public/audio/` and `src/data/audio-manifest.json` so Vercel serves them (the key never ships).

Any missing or unavailable clip falls back to the device voice.

**Where the voice is chosen:** open **⚙️ Settings** from any screen, complete the parent gate, and choose **Reading voice / Voz de lectura**. Preview Teacher or Josh, then Save. Both Fish libraries are bundled and cached for offline replay; switching voices costs no credits. English voices installed on the device are also listed. An unavailable device voice falls back to Teacher. Each player keeps their own choice.

To add or update Josh recordings, pass `--manifest=src/data/audio-josh-manifest.json` to the importer with Josh receipts. Keep Teacher and Josh in separate Fish projects and manifests. Poll `studio_project` / `studio_read_blocks` while generation runs; avoid submitting another generation request for pending blocks. Speaking speeds: words 0.85, sentences/stories 0.8, challenge slow clips 0.6 (catalog settings, applied with pitch-preserving `atempo`).

**Flexible practice:** Story Time defaults to one sentence with **Continue**, optional sentence audio, and **Skip to questions**. Continue is unverified practice, never a pronunciation pass. Guided reading remains available in Settings. **Skip this part** advances past the current intro, round, attempt, sentence, question or retell part; **Skip section** skips the current group of activities. Skips create no incorrect answers. Completed word checks are saved immediately, and a correct new word can continue without three repetitions. Settings stay visible during practice; opening them ends the current session but retains already saved answers.


## 5. On the iPad for daily use
- Add to Home Screen, open from the icon.
- Settings → Accessibility → **Guided Access** keeps him inside the app.
- Existing player: 🔒 → **Ajustes** → **Preparar práctica independiente en iPad**. This saves five-minute sessions, tracing, no challenge word, and independent reading. New players use these defaults.
- Return to the game. One **Kick off!** tap starts practice. The child hears instructions, taps the mic to read, or chooses **Listen & repeat**, then **I said it!**. If recognition fails, repetition stays available without adult approval.
- Unchecked repetitions appear under **Practicado · sin verificar** in the parent summary. They do not count as correct answers, goals, mastery, or mistakes. New words enter the review deck; unchecked reviews leave the card’s box and due date unchanged.
- The microphone mode uses the browser’s speech service. With no network or no mic permission, listen-and-repeat still works; generated MP3s are cached by the installed app after a successful install/update.
- Start with five minutes. Ten-minute sessions include stories, spoken answer choices and child-led retelling. Adult-assessed one-minute fluency remains a parent-selected activity.
- Previous assisted modes remain available under **Cómo revisar la lectura**. Test the actual iPad microphone and listen to the 39 phonics clips before relying on sound instruction.
- 🔒 → Ajustes → FAST scores: enter the fall screening score to see the gap to Level 3.

## Soccer Story Time (2026-10-23)

The home screen opens the story shelf directly. Listen plays a title and all sentences in the selected voice; Read together offers a sentence speaker, tappable words, Previous and Continue. Pause or a play break retains the sentence; a resumed sentence starts from its beginning. Bookmarks are device-local per player, separate from cloud assessment history. Questions are optional after the story.

The soccer shelf contains eighteen stories of six to eight sentences, including the six accounts preserved from the concurrent remote update. Four are labeled original fiction; factual accounts link their sources under For grown-ups. Both Fish voice libraries now contain 1,652 clips, including titles, sentences, question/answer clips and individual words. No API calls happen during playback. The installed app precaches all recordings; wait for a successful online install/update before using new stories offline.

New-generation projects: Teacher `cec479eeae914a11a33b4dc9b6e327d4`, Josh `20d7dd7a9d4042f28fcd552e79959ee0`. Generation used 17,478 credits; balance afterward: 201,395. Durable MP3s and manifests are in the repository. Temporary generation plans and receipts were saved in `/private/tmp/soccer-story-audio/`; recover lost receipts by reading the two Fish projects, not by regenerating audio. `npx vite-node scripts/export-missing-audio.ts /tmp/audio-plan` exports absent files without spending credits.

Automatic breaks still follow the parent setting. The separate always-visible Play button is available on student screens even when automatic breaks are off. Anytime play opens in a focus-trapped dialog and does not earn learning rewards. Closing it resumes the interrupted sentence/attempt; writing strokes and the one-minute reading clock are preserved.

Merge-completion projects: Teacher `aea7ea9eae494bae80567fbc73c7dc8d`, Josh `ad8ecf551fb14b84b00a44043386b7b2`. These add 187 clips per voice for 5,806 credits total; verified balance afterward: 195,589. Temporary receipts are in `/private/tmp/merged-story-audio/`; use the Fish projects to recover them without regenerating.

The game retains the concurrent update's easier goalkeeper, hold-to-charge/drag-to-aim controls, and separate synced soccer totals. The home Story Time option and global play dialog replace its duplicate story entry and in-session pause button.

Audio grows the installed MP3 library from 24.6 to 44.95 MiB. Only 24 recently used recordings stay decoded in memory; other clips reload from the offline cache. Game code is loaded on demand, and its animation loop stops when hidden or closed. Physical iPad swipe feel, pronunciation listening review and low-power performance still require device acceptance.
