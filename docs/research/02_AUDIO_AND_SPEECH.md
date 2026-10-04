# 02 — Audio (Fish Audio TTS) and Speech Recognition (Web Speech API)

Research for the learn-read PWA (TypeScript + Vite; iPad, iPhone, Mac Safari; 6-year-old reader).
Accessed **2026-10-04**. Anything not confirmed by a primary source (vendor docs, spec/compat data, browser bug tracker, browser source code) is marked **UNVERIFIED**.

---

## TL;DR

- **Fish Audio TTS:** `POST https://api.fish.audio/v1/tts`, headers `Authorization: Bearer <key>`, `Content-Type: application/json` (or `application/msgpack`), and `model: s2.1-pro` (or `s2.1-pro-free` / `s2-pro` / `s1`). Body `{ text, reference_id, format: "mp3", mp3_bitrate, latency, normalize, prosody: { speed, volume } }`. The response is the raw audio bytes, sent chunked. Price is $15 per million UTF-8 bytes of input text (`s2.1-pro-free` costs $0). Rate limits are concurrency-based: 5 requests at once on the Starter tier.
- **Generate audio at build time or through a server proxy, not from the browser.** The API key must stay secret. I also saw no CORS headers on the API (see A.8).
- **iOS/iPadOS speech recognition in a Home-Screen PWA:** treat it as **unreliable and not officially supported**. Apple's only statement (WebKit engineer, 2021) says it is *not available* in Home-Screen web apps, and that bug was closed "LATER" without a fix. Developer reports on the WebKit bug tracker from Aug–Sep 2026 show it *does* start in standalone mode on iOS 26.6 and 27.0, but with serious iOS 27 regressions. It may only work once per tab, it goes silent after `<audio>` or `speechSynthesis` playback, and it fails without firing `onerror` or `onend`. Our app plays audio between attempts, which is exactly the case that breaks. **You must build a fallback (for example tap-to-self-check, or recording plus server ASR) and test on real devices.**

---

## Part A — Fish Audio TTS REST API

### A.1 Endpoint and auth

| Item | Value | Source |
|---|---|---|
| URL | `POST https://api.fish.audio/v1/tts` | [TTS API ref][fish-tts-ref] |
| Auth | `Authorization: Bearer <API_KEY>` (OpenAPI `BearerAuth`, http bearer) | [TTS API ref][fish-tts-ref] |
| Body content types | `application/json` **or** `application/msgpack`. The docs say: "This endpoint only accepts `application/json` and `application/msgpack`." | [TTS API ref][fish-tts-ref] |
| Model selection | HTTP **header** `model`. Enum: `s1`, `s2-pro`, `s2.1-pro`, `s2.1-pro-free`, `drama-3-preview`. Default `s2.1-pro`. "If omitted or set to an unrecognized value, the request falls back to `s2.1-pro`." | [TTS API ref][fish-tts-ref] |
| Response 200 | Audio stream, `Transfer-Encoding: chunked`. The body is the raw encoded audio (mp3/wav/pcm/opus bytes), so you can write it straight to a `.mp3`. The official curl example uses `--output out.mp3`. | [TTS API ref][fish-tts-ref], [TTS guide][fish-tts-guide] |
| Errors | `401` (no permission), `402` (insufficient credits), `503` (overloaded), and `429` at the concurrency limit (no `Retry-After`). Error bodies are JSON `{ status, message, reason? }`. | [TTS API ref][fish-tts-ref], [Pricing & rate limits][fish-pricing] |

**About model names:** older names like `speech-1.5` and `speech-1.6` are **no longer in the documented enum** (2026-10-04). The current docs say an unrecognized value silently falls back to `s2.1-pro`, so sending `speech-1.6` is not an error, but you will not get that model. (Whether legacy names are still aliased is **UNVERIFIED**.) The JS SDK guide notes "the SDK default is `s1`", so always pass the model explicitly.

**Model notes** ([Models overview][fish-models]):
- `s2.1-pro` is the recommended production model: 83 languages, natural-language `[bracket]` cues such as `[whispers sweetly]`, and multi-speaker support.
- `s2.1-pro-free` is the same model for $0 "under fair-use limits", with no TTFA/DPA guarantees. The fair-use quota is not documented (**UNVERIFIED**).
- `s2-pro` is the previous S2 model.
- `s1` is the older model: 13 languages (including English and Spanish) and `(parenthesis)` emotion tags.

### A.2 Request body (`TTSRequest`)

All fields are from the OpenAPI schema in the [TTS API ref][fish-tts-ref]. JSON and MessagePack accept the same fields. The only exception is inline `references` audio, which **requires MessagePack**.

| Field | Type / allowed | Default | Notes |
|---|---|---|---|
| `text` | string | **required** | Text to synthesize. S2 models accept `[cue]` tags; S1 accepts `(emotion)` tags. |
| `reference_id` | string, or string[] for multi-speaker | `null` | **Voice model id** from the Voice Library or your own clone. |
| `references` | `ReferenceAudio[]` (or 2-D for multi-speaker) | `null` | Zero-shot cloning: `{ audio: bytes, text: transcript }`. **MessagePack only.** |
| `format` | `"mp3" \| "wav" \| "pcm" \| "opus"` | `"mp3"` | |
| `mp3_bitrate` | `64 \| 128 \| 192` (kbps) | `128` | Only used when `format` is mp3. |
| `sample_rate` | int or null | `null` (44100; 48000 for opus) | MP3 accepts 32000 or 44100. WAV/PCM accept 8k/16k/24k/32k/44.1k. Opus is 48k. Output is always mono. |
| `opus_bitrate` | `-1000` (auto), `24000`, `32000`, `48000`, `64000` | `-1000` | |
| `latency` | `"normal" \| "balanced" \| "low"` | `"normal"` per the OpenAPI schema | "normal: best quality, balanced: reduced latency, low: lowest latency". ⚠ The prose guide says `balanced` is the default (~300 ms TTFA). **The docs contradict each other, so set it explicitly.** |
| `normalize` | boolean | `true` | "Normalizes text for English and Chinese, improving stability for numbers." |
| `prosody` | `{ speed, volume, normalize_loudness }` | `null` | `speed` multiplier 0.5–2.0 (default 1). `volume` in dB (default 0). `normalize_loudness` default true, S2 family only (no effect on s1). |
| `temperature` | 0–1 | `0.7` | Higher is more expressive and varied. |
| `top_p` | 0–1 | `0.7` | |
| `chunk_length` | 100–300 | `300` (schema) | ⚠ The guide says the default is 200. **Another doc inconsistency.** |
| `min_chunk_length` | 0–100 | `50` | |
| `condition_on_previous_chunks` | boolean | `true` | Keeps the voice consistent across chunks. |
| `max_new_tokens` | int | `1024` | Audio tokens per text chunk. |
| `repetition_penalty` | number | `1.2` | |
| `early_stop_threshold` | 0–1 | `1` | |
| `features` | string[] | `[]` | For example `["quality-guard"]`. |
| `pronunciation_dictionary` | up to 3 dictionaries, either `{id, version}` refs **or** inline `{items:[{key, value, case_sensitive?}]}` | `null` | `value` is a **phoneme** form. Useful for forcing how a child-reader word is pronounced. |

Multi-speaker (S2 family and `drama-3-preview`, **not** `s1`): `"text": "<|speaker:0|>Hello!<|speaker:1|>Hi!"` with `reference_id: ["idA","idB"]`.

### A.3 Finding a voice id (list/search voice models)

`GET https://api.fish.audio/model` (Bearer auth). Source: [List Models][fish-list-models].

| Query param | Notes |
|---|---|
| `page_size` | 1–100, default 10 |
| `page_number` | default 1 |
| `title` | Free-text title filter. **Use this for "search".** |
| `tag` | string or string[] |
| `language` | string or string[], e.g. `en`, `es` |
| `title_language` | string or string[] |
| `self` | `true` returns only your workspace's models (your clones) |
| `author_id` | Filters public models by author |
| `licensed` | `true` returns only voices Fish licensed from the voice owner. **Recommended for a kids' product.** |
| `sort_by` | `score` (default) \| `task_count` \| `created_at` |

The response is `{ total, items: ModelEntity[], has_more, ... }`. Each item has `_id` (this is the **`reference_id`**), `title`, `type` (`tts`/`svc`), `state` (`trained`, ...), `languages`, `tags`, `visibility`, `samples[]` (preview audio URLs), `author`, `licensed`, `like_count`, `task_count`.

Related endpoints:
- `GET /model/{id}` to fetch one model.
- `POST /model` to create a voice clone.

You can also copy ids from the web Voice Library ([TTS guide][fish-tts-guide] "Use a specific voice"). The example id in the docs is `9a9cf47702da476aa4629e2506d4a857`.

```bash
curl -s "https://api.fish.audio/model?title=narrator&language=en&licensed=true&sort_by=score&page_size=20" \
  -H "Authorization: Bearer $FISH_API_KEY" | jq '.items[] | {id: ._id, title, languages, licensed}'
```

### A.4 Minimal Node 20+ `fetch` example (writes an mp3)

I syntax-checked this with `node --check` (Node 24). With an invalid key it gets `401 {"status":401,"message":"Invalid Token"}`, which confirms the endpoint, auth scheme and error shape. I did not run it with a real key, so the success path is **UNVERIFIED**, but it matches the documented curl example.

```js
// tts.mjs — Node 20+ (global fetch).
// Usage: FISH_API_KEY=... node tts.mjs "The cat sat on the mat." out.mp3 [voiceId]
import { writeFile } from "node:fs/promises";

const [text = "The cat sat on the mat.", outFile = "out.mp3", voiceId] = process.argv.slice(2);

const res = await fetch("https://api.fish.audio/v1/tts", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.FISH_API_KEY}`,
    "Content-Type": "application/json",
    model: "s2.1-pro", // or "s2.1-pro-free" (dev, $0), "s2-pro", "s1"
  },
  body: JSON.stringify({
    text,
    ...(voiceId ? { reference_id: voiceId } : {}),
    format: "mp3",
    mp3_bitrate: 128,   // 64 | 128 | 192
    sample_rate: 44100, // mp3: 32000 | 44100
    latency: "normal",  // "normal" | "balanced" | "low"
    normalize: true,
    prosody: { speed: 0.9, volume: 0 }, // speed 0.5–2.0 (slightly slow for early readers)
  }),
});

if (!res.ok) {
  // 401 / 402 / 429 / 503 -> JSON { status, message, reason? }
  throw new Error(`Fish TTS ${res.status}: ${await res.text()}`);
}

await writeFile(outFile, Buffer.from(await res.arrayBuffer()));
console.log(`wrote ${outFile} (${res.headers.get("content-type")})`);
```

For long text, stream instead of buffering: `import { Readable } from "node:stream"; Readable.fromWeb(res.body).pipe(fs.createWriteStream(outFile))`.

An official JS SDK also exists (`npm i fish-audio`, `new FishAudioClient({ apiKey }).textToSpeech.convert({ text }, "s2-pro")`). See the [TTS guide][fish-tts-guide].

### A.5 Pricing ([Pricing & rate limits][fish-pricing])

TTS is pay-as-you-go and billed on the **input text size in UTF-8 bytes** (not characters).

| Model | Price |
|---|---|
| `s2.1-pro` | $15.00 / 1M UTF-8 bytes |
| `s2.1-pro-free` | $0.00 (fair use) |
| `s2-pro` | $15.00 / 1M UTF-8 bytes |
| `s1` | $15.00 / 1M UTF-8 bytes |

The docs say: "1M UTF-8 bytes is approximately 180,000 English words, or about 12 hours of speech". Accented Spanish characters (á, ñ) take 2 bytes each in UTF-8. Pre-generating a few thousand short words and sentences will cost cents.

### A.6 Rate limits ([Pricing & rate limits][fish-pricing])

Limits are on **concurrent requests**, shared by all API keys on the account:

| Tier | Threshold (total prepaid) | Concurrent requests |
|---|---|---|
| Starter | < $100 | 5 |
| Elevated | ≥ $100 | 15 |
| High Volume | ≥ $1,000 | 50 |
| Enterprise | custom | custom |

When you are over the limit you get `429` with **no `Retry-After` header**. Retry with exponential backoff. For a build-time generation script, run at most about 4 requests in parallel on Starter.

### A.7 Other options

- **WebSocket streaming:** `tts-live` (see the [docs index][fish-llms]). It is not needed for pre-generated word audio.
- **MessagePack body:** use it to send reference audio bytes inline (zero-shot cloning) without base64 ([TTS guide][fish-tts-guide] "Direct API (MessagePack)").

### A.8 Implications for the PWA

1. **Do not call Fish from the browser.** It would expose the API key. Also, on 2026-10-04 I observed a CORS `OPTIONS` preflight to `/v1/tts` return `404 {"message":"no route serves this path"}`, and the `401` response had no `Access-Control-Allow-Origin` header. Browser calls would therefore probably fail CORS. (This is an observation, not documented, so **UNVERIFIED** as policy.)
2. **Recommended approach:** a build-time Node script generates the mp3 for every word and sentence, with `prosody.speed` around 0.85–0.95 for a 6-year-old. Commit the files or put them on a CDN, then precache them with the service worker. If you need dynamic text, use a tiny serverless proxy.
3. Use `licensed=true` voices or your own clone, and pin the `model` header explicitly.

---

## Part B — Web Speech API `SpeechRecognition` (as of 2026-10-04)

### B.0 Compatibility snapshot (primary data)

From MDN [browser-compat-data][bcd-json] (`api/SpeechRecognition.json`, main branch) and [caniuse][caniuse-json]:

| Feature | Chrome desktop | Chrome Android | Safari macOS | Safari iOS/iPadOS | Firefox | Edge |
|---|---|---|---|---|---|---|
| `SpeechRecognition` | **139** unprefixed; `webkit` prefix since 33 | same | `webkitSpeechRecognition` **14.1** | 14.5 (mirrors) | preview/flag only | caniuse: "no events fire" (note 3) |
| `continuous` | 33 | **Not supported**: "The property can be set, but has no effect." | **17** (14.1–16 partial: "Returns multiple results when set to `false`") | 17 | — | — |
| `interimResults` | 33 | 33 | 14.1 | 14.5 | — | — |
| `maxAlternatives` | 33 | 33 | 14.1 | 14.5 | — | — |
| `grammars` | 33 | 33 | **No** | **No** | — | — |
| `processLocally` | **139** (experimental) | **No** | **No** | **No** | — | — |
| `available()` / `install()` | **139** (experimental) | **No** | **No** | **No** | — | — |
| `phrases` (contextual biasing) | **142** (experimental) | **No** | **No** | **No** | — | — |

caniuse note 4 (verbatim): *"Safari 14.1 and TP 119+ include prefixed support for `webkitSpeechRecognition` without support for `SpeechGrammar` or `SpeechGrammarList`. Siri needs to be enabled. [Not available in SafariViewController and web apps added to Home Screen](https://bugs.webkit.org/show_bug.cgi?id=225298#c3)."* caniuse marks Safari as partial ("a x #4") through Safari 27.2 / iOS 27.2.

Safari 26.0 change: "Fixed making the SpeechRecognition interface available only within a secure context" ([WebKit Safari 26.0 notes][webkit-26]). HTTPS is required, so test on a LAN with a real certificate, not `http://192.168…`. The Safari 27.0 release notes contain **no** SpeechRecognition changes ([WebKit Safari 27.0 notes][webkit-27]).

### B.1 Safari on iOS/iPadOS

**Is `webkitSpeechRecognition` supported in Safari (browser tab)?** **Yes**, since iOS 14.5, prefixed ([BCD][bcd-json], [caniuse][caniuse-json]). Apple engineer Sihui Liu says it requires **Siri or Dictation to be enabled** in Settings, otherwise you get a `SpeechRecognitionErrorEvent` ([WebKit 225298 c1][wk-225298]).

**Does it work in a Home-Screen PWA (`display: standalone`)? The evidence conflicts. Plan for "no or unreliable."**

| Evidence | Date | Says |
|---|---|---|
| WebKit [bug 225298 comment 3][wk-225298] (Apple engineer Sihui Liu) | 2021-05-04 | "SpeechRecognition API is not available in SafariViewController and web apps added to Home Screen for now. There are some implementation details we need to figure out before we can enable it." The bug is **RESOLVED LATER**. It has had only "any update?" comments since; the last was 2025-03-02. Apple never said it was enabled. |
| caniuse note 4 | current | Repeats "Not available in … web apps added to Home Screen". |
| Apple Developer Forums [thread 748048][af-748048] | 2024-03 | A Vue PWA reports it works in Safari but fails when added to the Home Screen. No Apple reply. |
| WebKit [bug 321436][wk-321436] (developer report) | 2026-08-10 / 2026-09-28 | Tested "both plain Safari and installed/Add to Home Screen standalone mode" on **iOS 26.6**: recognition starts in standalone mode and the mic indicator turns on. A follow-up on **iOS 27.0, iPhone 17, `display-mode: standalone` = true** shows the first result arriving, with production use "worked on iOS 26.6.1". This implies **it now functions in standalone mode** in at least some cases. |
| GitHub issue [guchi-apps/aide-bot#179][gh-aidebot] | 2026-09-06 | iPhone Home-Screen PWA: the first recognition turn works, and later turns started from `setTimeout` fail. |
| GitHub issue [rcarmo/piclaw#487][gh-piclaw] | 2026-09-26 | Product decision to downgrade iOS standalone to "keyboard-dictation guidance". |

**Verdict:** recent reports suggest Apple quietly enabled it in standalone web apps at some point, roughly by iOS 26. **This is UNVERIFIED: there is no Apple release note or bug resolution.** The 2021 "not available" statement is the only official word. Even where it works, iOS 27 has active, unfixed regressions (below). For a 6-year-old's core reading loop, **do not make speech recognition a required path on iOS.** Feature-detect it, try it, and fall back gracefully.

**Known iOS bugs and quirks (primary sources):**

1. **Only works once per tab on iOS 27.** In later sessions the mic opens but receives silence. Only `start`/`audiostart` fire, then `aborted` ("No speech detected"). New instances and page reloads don't help; only closing the tab does. It worked on iOS 26. See [WebKit 326069][wk-326069] (2026-10-02, NEW).
2. **Dies after `<audio>`/`<video>` playback.** After a media element plays or pauses, `start()` appears to succeed but **no `onresult`, `onerror` or `onend` ever fires**, so there is nothing to detect. This happens in Safari and standalone mode on iOS 26.6 and 27.0. See [WebKit 321436][wk-321436] (NEW, rdar 185115251) and [WebAudio/web-speech-api#96][gh-wsa-96] (2021). **This hits a reading app directly: you play a word's audio, then ask the child to say it.**
3. **iOS 27 regression with `speechSynthesis`.** While recognition is active, `speechSynthesis.speak()` produces no audio and recognition stops delivering results. The recognizer hears nothing during TTS, so barge-in is impossible. A `getUserMedia` track running at the same time gets muted. See [WebKit 324436][wk-324436] (2026-09-17) and [321436 c2][wk-321436].
   - Workaround from those reports: call `abort()` before playback, then create a **new** `webkitSpeechRecognition` instance after audio `onend`. That worked for 21+ cycles in standalone mode on iOS 27.0.
   - A Web Audio `OscillatorNode` beep did *not* break recognition. **Prefer Web Audio API playback (AudioBufferSourceNode) over `<audio>` for prompts.** That suggestion is inferred from the beep test and is **UNVERIFIED** for decoded mp3 buffers.
4. **`continuous` semantics.** In WebKit's implementation (`WebSpeechRecognizerTask.mm`, [source][wk-src]):
   - When `continuous = false`, the task calls `stop()` after the **first final result**.
   - When `continuous = true`, it keeps going, up to a hard-coded maximum of 1 hour.
   - Safari ≤16 returned multiple results even when false ([BCD][bcd-json]).
   - Reports also say Safari "ends continuous sessions periodically", so you must re-create instances ([WebKit 324436][wk-324436]).
   - Older reports (iOS 15–16) say continuous mode on iPad/iPhone could leave the mic on forever with no result ([Apple Forums 699881][af-699881]).
   - A [WebKit 288963][wk-288963] reporter (2025) found that continuous mode accumulates the transcript and degrades accuracy after long pauses.
   - **Recommendation:** use `continuous = false`, one utterance per `start()`, from a user tap.
5. **`onend` and silence handling.** WebKit sends `end` when the SFSpeech task finishes or is cancelled ([source][wk-src]). There is **no WebKit-specific silence timeout** in the source; it relies on Apple's Speech framework. Some reports say a non-continuous session "does not always end by itself" (forum and blog reports only, **UNVERIFIED**). Add your own timeout, e.g. call `stop()` 4–6 s after `speechstart`/`audiostart`.
6. **Mic permission prompts.**
   - macOS Safari shows the speech-recognition prompt once (system TCC; reset with `tccutil reset SpeechRecognition com.apple.Safari`) ([addpipe deep dive][addpipe], 2025-04).
   - On iOS standalone, camera and mic permissions do **not** persist like they do in Safari. A WebKit engineer (2026-02-03) acknowledged that "persistent permission in PWA when persistent permission is set in Safari" is a separate, unfiled issue. Users still saw re-prompts on iOS 18.5 after a cold start. See [WebKit 215884][wk-215884], which also fixed an older bug where hash-change navigation reset permissions in standalone mode.
   - Expect **a prompt per app launch** in a Home-Screen PWA. This is **UNVERIFIED specifically for SpeechRecognition**; the evidence is for `getUserMedia`, which shares the capture permission.
   - Avoid hash routing.
7. **User activation.** Starting a session from `setTimeout` rather than from a tap fails in standalone mode ([aide-bot#179][gh-aidebot], hypothesis, **UNVERIFIED**). Always call `start()` synchronously inside a `pointerup`/`click` handler.
8. **Network / Siri.**
   - Siri or Dictation must be enabled ([WebKit 225298 c1][wk-225298]).
   - WebKit sets `requiresOnDeviceRecognition = YES` **when the recognizer supports on-device recognition for the locale** ([source][wk-src]), so supported languages (e.g. en-US) can work offline. addpipe confirmed offline English transcription on macOS Safari.
   - If on-device isn't supported for a locale, it uses Apple's server. Some locales are very slow; fr-BE took 30 s on macOS and over 3 min on iOS ([WebKit 276066][wk-276066]).
   - Test `es-MX`/`es-US`/`en-US` on target devices. Per-locale on-device availability is **UNVERIFIED**.
9. **Not available in SFSafariViewController or in other apps' WKWebViews** unless the host app declares `NSSpeechRecognitionUsageDescription`. In apps without it, `webkitSpeechRecognition` **is still exposed on `window` but fails** ("permission prompt never appears"), so feature detection lies ([WebKit 239816][wk-239816]).

### B.2 macOS Safari and Chrome

- **Safari (macOS):** `webkitSpeechRecognition` since 14.1; `continuous` is correct since 17 ([BCD][bcd-json]). It needs Siri or Dictation enabled, and the system speech-recognition permission is prompted once ([addpipe][addpipe]). It uses the same `SFSpeechRecognizer` code path as iOS, so on-device is used when the locale supports it ([source][wk-src]). There is no `processLocally`, `available()`, `install()`, `phrases` or `grammars`.
- **Chrome (desktop):** unprefixed `SpeechRecognition` since 139, `webkit`-prefixed since 33. **Server-based by default**: "Your audio is sent to a web service for recognition processing, so it won't work offline" ([MDN SpeechRecognition][mdn-sr]). On-device is available via `processLocally` since 139 (next section). `continuous` works on desktop. On **Chrome Android, `continuous` has no effect** ([BCD][bcd-json]).
- **Edge:** caniuse note 3 says "Edge and Opera appear to have support for the `SpeechRecognition` API but no events for it appear to fire."
- **Firefox:** behind a flag or preview only.

### B.3 Chrome on iOS

All iOS browsers run on WKWebView.
- WebKit engineers say the API works in a WKWebView app **only if that app includes `NSSpeechRecognitionUsageDescription`**. Otherwise the user gets `service-not-allowed` ([WebKit 239816][wk-239816], RESOLVED WORKSFORME, 2022).
- The bug was filed by a Chrome-iOS engineer (Ali Juma) because it did not work in Chrome iOS.
- A Chromium issue titled "Speech Recognition Browser API Service-Not-Allowed Error" exists ([crbug 40836681][crbug-40836681]). It requires sign-in, so I could not read its status.
- caniuse and BCD do not track Chrome-iOS separately.

**Verdict: assume it is NOT supported in Chrome/Edge/Firefox on iOS. UNVERIFIED for 2026.** I found no primary source showing Chrome iOS added the Info.plist key. Feature detection will report `true` anyway, so detect by actually trying a session and handling `service-not-allowed`/`not-allowed`.

### B.4 `maxAlternatives` and `interimResults` on Safari

- **`interimResults`:** **works**. WebKit maps it to `SFSpeechAudioBufferRecognitionRequest.shouldReportPartialResults` ([source][wk-src]). The [WebKit 288963][wk-288963] reporter confirmed on iOS 17/18 that "the interimResults property works as intended". Interim results can be sparse or missing in noise, at distance, with similar-sounding words, or with long pauses. (BCD: supported since 14.1.)
- **`maxAlternatives`:** **partially works** (source-level confirmation, [WebKit source][wk-src]):
  - **Interim** results always carry exactly **1** alternative, because only the single hypothesis is passed.
  - **Final** results carry up to `maxAlternatives` entries, taken from `SFSpeechRecognitionResult.transcriptions`. The default is 1.
  - `confidence` is the maximum segment confidence (code comment: "FIXME: get confidence of SFTranscription when possible").
  - How many alternatives Apple's recognizer actually returns for a single word, and whether interim confidence is 0, is **UNVERIFIED**; test it on a device.
  - **For a reading app,** match the target word against *all* final alternatives, case- and punctuation-insensitive and with number-word normalization. Don't depend on `confidence`.

### B.5 Newer on-device options

- **Chrome `processLocally` + `SpeechRecognition.available()` / `.install()`:** shipped in **Chrome 139** (Aug 2025) ([New in Chrome 139][chrome-139], [MDN processLocally][mdn-processlocally], [MDN Using the Web Speech API][mdn-using]).
  - Set `recognition.processLocally = true` before `start()`.
  - Call `available({langs, processLocally:true})`. It returns `"available"`, `"unavailable"` or a downloadable state; in the downloadable case, call `install({langs, processLocally:true})` to download the language pack.
  - If you start without the pack, you get `language-not-supported`.
  - Experimental. **Desktop only**: BCD shows Chrome Android has "No".
  - Known bug: `available({processLocally:true, langs:['en-US']})` is broken on macOS ([crbug 444393111][crbug-444393111]; status not checked, **UNVERIFIED**).
- **`quality` option** (`'command' | 'dictation' | 'conversation'`) for on-device: Intent to Ship for **Chrome 150, desktop only** (Windows/Mac/Linux; not Android/ChromeOS), dated 2026-05-05 ([blink-dev][blink-dev-quality]). Whether it actually shipped in 150 is **UNVERIFIED**.
- **`phrases` (contextual biasing):** Chrome 142, experimental ([BCD][bcd-json]). You could bias recognition toward the exact target word, which is very useful for a reading app, but **only in desktop Chrome**.
- **Safari:** has none of `processLocally`, `available()`, `install()` or `phrases` ([BCD][bcd-json]). It already prefers on-device internally when supported ([source][wk-src]), with no API to require or query it.
- **Spec:** the [Web Speech API spec][spec] and the [on-device explainer][explainer].

### B.6 Practical recommendation for learn-read

1. Treat speech recognition as a **progressive enhancement**, never the only way to advance. Keep a "I read it!" tap and/or a parent/teacher check.
2. On iOS: start sessions only from a tap, with `continuous=false` and `interimResults=true` (for a "listening…" animation) and `maxAlternatives=5`. Call `abort()` and drop the instance before any prompt audio plays. Create a **new** instance after playback ends. Add your own 5 s timeout and a watchdog for the "no events ever fire" hang. If 2 attempts fail, switch to fallback mode for the rest of the session.
3. If reliable child-speech scoring becomes a core feature, plan to record audio with `MediaRecorder` (supported on iOS 14.5+) and send it to a server ASR. Fish Audio has `POST /v1/asr` at $0.36 per audio hour ([Pricing][fish-pricing]). Note that `getUserMedia` has the same standalone permission-persistence caveats.
4. Check every target device under iOS 27.x before launch. Several of the bugs above are new in iOS 27 and may be fixed in point releases.

---

## Sources (accessed 2026-10-04)

**Fish Audio (primary)**
- [fish-tts-ref]: https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech (raw: `.md`)
- [fish-tts-guide]: https://docs.fish.audio/developer-guide/core-features/text-to-speech
- [fish-list-models]: https://docs.fish.audio/api-reference/endpoint/model/list-models
- [fish-pricing]: https://docs.fish.audio/developer-guide/models-pricing/pricing-and-rate-limits
- [fish-models]: https://docs.fish.audio/developer-guide/models-pricing/models-overview
- [fish-llms]: https://docs.fish.audio/llms.txt
- Live check: `POST https://api.fish.audio/v1/tts` with an invalid token returns `401 {"status":401,"message":"Invalid Token"}`. `OPTIONS` returns `404`, and there are no CORS headers (observed 2026-10-04).

**Web Speech API — compat and spec (primary)**
- [bcd-json]: https://github.com/mdn/browser-compat-data/blob/main/api/SpeechRecognition.json
- [caniuse-json]: https://caniuse.com/speech-recognition (data: https://github.com/Fyrd/caniuse/blob/main/features-json/speech-recognition.json)
- [mdn-sr]: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
- [mdn-processlocally]: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally
- [mdn-using]: https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API
- [spec]: https://webaudio.github.io/web-speech-api/
- [explainer]: https://github.com/WebAudio/web-speech-api/blob/main/explainers/on-device-speech-recognition.md

**WebKit (primary)**
- [wk-src]: https://github.com/WebKit/WebKit/blob/main/Source/WebCore/Modules/speech/cocoa/WebSpeechRecognizerTask.mm
- [wk-225298]: https://bugs.webkit.org/show_bug.cgi?id=225298 (not available in Home-Screen apps; RESOLVED LATER)
- [wk-239816]: https://bugs.webkit.org/show_bug.cgi?id=239816 (WKWebView / third-party browsers)
- [wk-321436]: https://bugs.webkit.org/show_bug.cgi?id=321436 (hang after media playback; standalone iOS 26.6/27.0)
- [wk-324436]: https://bugs.webkit.org/show_bug.cgi?id=324436 (iOS 27 regression with speechSynthesis)
- [wk-326069]: https://bugs.webkit.org/show_bug.cgi?id=326069 (iOS 27: works once per tab)
- [wk-288963]: https://bugs.webkit.org/show_bug.cgi?id=288963 (interimResults / continuous behavior)
- [wk-276066]: https://bugs.webkit.org/show_bug.cgi?id=276066 (slow locales)
- [wk-215884]: https://bugs.webkit.org/show_bug.cgi?id=215884 (standalone permission re-prompts)
- [webkit-26]: https://webkit.org/blog/17333/webkit-features-in-safari-26-0/
- [webkit-27]: https://webkit.org/blog/18325/webkit-features-for-safari-27-0/

**Chrome (primary)**
- [chrome-139]: https://developer.chrome.com/blog/new-in-chrome-139
- [blink-dev-quality]: https://groups.google.com/a/chromium.org/g/blink-dev/c/P8P-x7AnC6I
- [crbug-40836681]: https://issues.chromium.org/issues/40836681 (sign-in required; not read)
- [crbug-444393111]: https://issues.chromium.org/issues/444393111 (not read)

**Secondary / anecdotal**
- [af-748048]: https://developer.apple.com/forums/thread/748048
- [af-699881]: https://developer.apple.com/forums/thread/699881
- [gh-wsa-96]: https://github.com/WebAudio/web-speech-api/issues/96
- [gh-aidebot]: https://github.com/guchi-apps/aide-bot/issues/179
- [gh-piclaw]: https://github.com/rcarmo/piclaw/issues/487
- [addpipe]: https://blog.addpipe.com/a-deep-dive-into-the-web-speech-api/
- firt.dev iOS PWA compatibility table (lists "Web Speech Recognition ✅ 14.5" without a standalone-specific note; conflicts with WebKit 225298): https://firt.dev/notes/pwa-ios/

[fish-tts-ref]: https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech
[fish-tts-guide]: https://docs.fish.audio/developer-guide/core-features/text-to-speech
[fish-list-models]: https://docs.fish.audio/api-reference/endpoint/model/list-models
[fish-pricing]: https://docs.fish.audio/developer-guide/models-pricing/pricing-and-rate-limits
[fish-models]: https://docs.fish.audio/developer-guide/models-pricing/models-overview
[fish-llms]: https://docs.fish.audio/llms.txt
[bcd-json]: https://github.com/mdn/browser-compat-data/blob/main/api/SpeechRecognition.json
[caniuse-json]: https://caniuse.com/speech-recognition
[mdn-sr]: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
[mdn-processlocally]: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally
[mdn-using]: https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API
[spec]: https://webaudio.github.io/web-speech-api/
[explainer]: https://github.com/WebAudio/web-speech-api/blob/main/explainers/on-device-speech-recognition.md
[wk-src]: https://github.com/WebKit/WebKit/blob/main/Source/WebCore/Modules/speech/cocoa/WebSpeechRecognizerTask.mm
[wk-225298]: https://bugs.webkit.org/show_bug.cgi?id=225298
[wk-239816]: https://bugs.webkit.org/show_bug.cgi?id=239816
[wk-321436]: https://bugs.webkit.org/show_bug.cgi?id=321436
[wk-324436]: https://bugs.webkit.org/show_bug.cgi?id=324436
[wk-326069]: https://bugs.webkit.org/show_bug.cgi?id=326069
[wk-288963]: https://bugs.webkit.org/show_bug.cgi?id=288963
[wk-276066]: https://bugs.webkit.org/show_bug.cgi?id=276066
[wk-215884]: https://bugs.webkit.org/show_bug.cgi?id=215884
[webkit-26]: https://webkit.org/blog/17333/webkit-features-in-safari-26-0/
[webkit-27]: https://webkit.org/blog/18325/webkit-features-for-safari-27-0/
[chrome-139]: https://developer.chrome.com/blog/new-in-chrome-139
[blink-dev-quality]: https://groups.google.com/a/chromium.org/g/blink-dev/c/P8P-x7AnC6I
[crbug-40836681]: https://issues.chromium.org/issues/40836681
[crbug-444393111]: https://issues.chromium.org/issues/444393111
[af-748048]: https://developer.apple.com/forums/thread/748048
[af-699881]: https://developer.apple.com/forums/thread/699881
[gh-wsa-96]: https://github.com/WebAudio/web-speech-api/issues/96
[gh-aidebot]: https://github.com/guchi-apps/aide-bot/issues/179
[gh-piclaw]: https://github.com/rcarmo/piclaw/issues/487
[addpipe]: https://blog.addpipe.com/a-deep-dive-into-the-web-speech-api/
