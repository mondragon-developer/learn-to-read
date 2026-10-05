# Setup — the steps only the owner can do

Everything below is free except Fish Audio (pennies: the full clip set is ≈ $0.17).

## 1. GitHub + Vercel (hosting)
1. Repo: https://github.com/mondragon-developer/learn-to-read (this folder's `origin`; `git push` publishes).
   Local-only files (`CLAUDE.md`, `docs/private/`, `.env.local`) are excluded in `.git/info/exclude` and never leave this Mac.
2. vercel.com → **Add New → Project** → import the repo. Vercel reads `vercel.json` (Vite, `npm run build`, `dist`). Deploy.
3. You get `https://learn-to-read-xxxx.vercel.app`. Every push to `main` redeploys.

## 2. Device check (milestone M1) — do this first
On the **iPad, iPhone and Mac**, open `https://<your-app>.vercel.app/spike.html`:
1. In a normal Safari tab, run cards 1–5 with your son (3b: the voice says a word, then the mic listens; 3c: record and hear yourself).
2. Add it to the Home Screen (Share → Add to Home Screen), open it from the icon, and run cards 3 and 3b again.
3. Tap **Copy report** and paste it into the chat. It decides whether the free mic check is reliable on each device or whether those devices go straight to Grown-up ✓ mode.

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
4. Generate: `npm run audio -- --dry` (plan + cost), then `npm run audio`.
5. Open the app → 🔒 → Ayuda → **Revisar los audios**. Listen to the *sound* tab first (isolated sounds are the hard ones). Mark bad clips; for each, adjust its hint in `SOUND_HINTS` (`src/domain/audio/AudioCatalog.ts`) and run `npm run audio -- --redo=sound:a,sound:t`.
6. Commit the MP3s in `public/audio/` and `src/data/audio-manifest.json` so Vercel serves them (the key never ships).

Until the clips exist, the app uses the device voice for everything.

**Where the voice is chosen:** only here, on the Mac. The generator bakes the chosen Fish voice into MP3 files that deploy with the app; the iPad/iPhone just play them, so there is no voice setting on the devices. To change the voice: put a new `FISH_VOICE_ID` in `.env.local`, run `npm run audio` (every clip regenerates because the voice is part of each clip's hash, ≈ $0.16), commit and push. Speeds: words 0.85, sentences/stories 0.8, challenge "slow" clips 0.6 (set in `src/domain/audio/AudioCatalog.ts`).

## 5. On the iPad for daily use
- Add to Home Screen, open from the icon.
- Settings → Accessibility → **Guided Access** keeps him inside the app.
- 🔒 → Ajustes: 10 minutes (words + story), writing "Calcar" if he practices at a table, "No" if not.
- 🔒 → Ajustes → FAST scores: enter the fall screening score to see the gap to Level 3.
