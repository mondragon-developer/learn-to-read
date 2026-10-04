# Setup — the steps only the owner can do

Everything below is free except Fish Audio (pennies: the full clip set is ≈ $0.08).

## 1. GitHub + Vercel (hosting)
1. Create a **private** repo `goal-reader` on GitHub (account `mondragon-developer`).
2. In this folder:
   ```bash
   git add -A && git commit -m "Goal Reader v0: domain, content units 1-8, app, device check"
   git remote add origin git@github.com:mondragon-developer/goal-reader.git
   git push -u origin main
   ```
   Local-only files (`CLAUDE.md`, `docs/private/`, `.env.local`) are excluded in `.git/info/exclude` and never leave this Mac.
3. vercel.com → **Add New → Project** → import the repo. Vercel reads `vercel.json` (Vite, `npm run build`, `dist`). Deploy.
4. You get `https://goal-reader-xxxx.vercel.app`. Every push to `main` redeploys.

## 2. Device check (milestone M1) — do this first
On the **iPad, iPhone and Mac**, open `https://<your-app>.vercel.app/spike.html`:
1. In a normal Safari tab, run cards 1–5 with your son (3b is the important one: the voice says a word, then the mic listens).
2. Add it to the Home Screen (Share → Add to Home Screen), open it from the icon, and run cards 3 and 3b again.
3. Tap **Copy report** and paste it into the chat. It decides whether the free mic check is reliable on each device or whether those devices go straight to Grown-up ✓ mode.

## 3. Supabase (sync between iPad, iPhone and Mac)
1. supabase.com → New project (free tier). Region: East US.
2. **SQL Editor** → paste and run `supabase/migrations/0001_init.sql`.
3. **Authentication → Providers → Email**: enabled. Leave "Confirm email" on.
4. **Authentication → Email Templates → Magic Link**: replace the body so it sends a **code** instead of a link (the app asks for a 6-digit code, because a link would open in Safari outside the installed app):
   ```html
   <h2>Goal Reader</h2>
   <p>Your code / Su código: <strong>{{ .Token }}</strong></p>
   ```
   Do the same in **Confirm signup**.
5. **Project Settings → API**: copy the Project URL and the anon/publishable key.
6. Vercel → Project → Settings → Environment Variables:
   - `VITE_SUPABASE_URL` = project URL
   - `VITE_SUPABASE_ANON_KEY` = anon key (safe to ship: Row Level Security limits every family to its own rows)
   Redeploy. Locally, put the same two lines in `.env.local`.
7. In the app: 🔒 → Cuenta y respaldo → your email → code. Do this once on each device.

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
