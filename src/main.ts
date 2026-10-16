/**
 * Composition root - the only file that knows concrete implementations.
 * Swap WebSpeechChecker for a paid checker, or add Supabase keys, and nothing else changes.
 */
import '@fontsource/andika/latin-400.css';
import '@fontsource/andika/latin-700.css';
import './ui/styles.css';
import { registerSW } from 'virtual:pwa-register';
import { systemClock } from '@domain/time/Clock';
import { ContentLibrary } from '@domain/content/ContentLibrary';
import { JsonContentSource } from '@domain/content/JsonContentSource';
import { SessionPlanner } from '@domain/session/SessionPlanner';
import { IndexedDbStore } from '@domain/storage/IndexedDbStore';
import { PracticeLog } from '@domain/storage/PracticeLog';
import { ProfileRepository } from '@domain/storage/ProfileRepository';
import { SyncService } from '@domain/storage/SyncService';
import { BackupService } from '@domain/storage/BackupService';
import { Outbox } from '@domain/storage/Outbox';
import { AnswerMatcher } from '@domain/speech/AnswerMatcher';
import { SentenceMatcher } from '@domain/speech/SentenceMatcher';
import { buildCatalog } from '@domain/audio/AudioCatalog';
import { I18n } from '@domain/i18n/i18n';
import type { Profile } from '@domain/profiles/Profile';
import prompts from '@data/prompts.json';
import syllables from '@data/syllables.json';
import manifest from '@data/audio-manifest.json';
import { WebAudioPlayer } from '@platform/WebAudioPlayer';
import { WebSpeechChecker } from '@platform/WebSpeechChecker';
import { WebVoiceRecorder } from '@platform/WebVoiceRecorder';
import { AudioEngine } from '@platform/AudioEngine';
import { Account } from '@platform/Account';
import { AppShell } from '@ui/AppShell';
import { PlayersScreen } from '@ui/screens/PlayersScreen';
import { HomeScreen } from '@ui/screens/HomeScreen';
import { SessionScreen } from '@ui/screens/SessionScreen';
import { StadiumScreen } from '@ui/screens/StadiumScreen';
import { WordBankScreen } from '@ui/screens/WordBankScreen';
import { PracticeScreen } from '@ui/screens/PracticeScreen';
import { ParentScreen } from '@ui/parent/ParentScreen';
import { AudioReviewScreen } from '@ui/parent/AudioReviewScreen';
import type { AppContext } from '@ui/context';

const PLAYER_KEY = 'goal-reader.player';
const LOCALE_KEY = 'goal-reader.parentLocale';

async function boot(): Promise<void> {
  registerSW({ immediate: true });

  const clock = systemClock;
  const store = new IndexedDbStore();
  void store.requestPersistence();
  // One outbox for everyone who queues or clears uploads (see Outbox for why it must be shared).
  const outbox = new Outbox(store);
  const log = new PracticeLog(store, outbox, clock);
  const profileRepo = new ProfileRepository(store, clock);
  const sync = new SyncService(store, outbox, profileRepo);
  const backup = new BackupService(store, outbox, profileRepo, clock);

  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  const account = url && key ? new Account(url, key) : null;
  if (account && await account.init().catch(() => null)) sync.setRemote(account.remote());

  const library = new ContentLibrary(new JsonContentSource());
  const catalog = buildCatalog(library, prompts, syllables.words.map((w) => w.text));
  // One audio engine for clips and his recordings (see AudioEngine for why).
  const engine = new AudioEngine();
  // Recorded files have content-versioned names so an iPad never reuses an older voice.
  const recordings: Record<string, { file: string; hash: string }> = manifest;
  const playbackCatalog = catalog.map((clip) => ({ ...clip, file: recordings[clip.key]?.file ?? clip.file }));
  const audio = new WebAudioPlayer(engine, playbackCatalog, new Set(Object.keys(recordings)));

  const profiles = await profileRepo.list();
  let player: Profile | null = profiles.find((p) => p.id === readPlayer()) ?? (profiles.length === 1 ? profiles[0] ?? null : null);

  // Parent area is Spanish by default (for mom); a parent who switches to English is remembered.
  const i18n = new I18n(readLocale());
  i18n.onChange(writeLocale);

  let shell: AppShell;
  const ctx: AppContext = {
    library, planner: new SessionPlanner(), log, profiles: profileRepo, sync, backup, clock, audio,
    checker: new WebSpeechChecker(), recorder: new WebVoiceRecorder(engine), matcher: new AnswerMatcher(), sentences: new SentenceMatcher(),
    i18n,
    account,
    player: () => player,
    setPlayer: (p) => { player = p; writePlayer(p?.id ?? null); shell?.paintChip(); },
    navigate: (id, params) => void shell.navigate(id, params),
  };
  shell = new AppShell(ctx, {
    players: new PlayersScreen(ctx),
    home: new HomeScreen(ctx),
    session: new SessionScreen(ctx),
    stadium: new StadiumScreen(ctx),
    words: new WordBankScreen(ctx),
    practice: new PracticeScreen(ctx),
    parent: new ParentScreen(ctx),
    'audio-review': new AudioReviewScreen(ctx, catalog),
  });
  shell.mount(document.getElementById('app') as HTMLElement);
  await shell.navigate(player ? 'home' : 'players');

  // Pull other devices' practice when the app opens and whenever it comes back online.
  const syncSoon = (): void => { void sync.sync().then(async (r) => {
    if (r.ok && r.pulled && shell.screenId === 'home') await shell.navigate('home');
  }); };
  if (sync.hasRemote) syncSoon();
  window.addEventListener('online', syncSoon);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && sync.hasRemote) syncSoon(); });
}

function readLocale(): 'es' | 'en' { try { return localStorage.getItem(LOCALE_KEY) === 'en' ? 'en' : 'es'; } catch { return 'es'; } }
function writeLocale(l: 'es' | 'en'): void { try { localStorage.setItem(LOCALE_KEY, l); } catch { /* private mode */ } }
function readPlayer(): string | null { try { return localStorage.getItem(PLAYER_KEY); } catch { return null; } }
function writePlayer(id: string | null): void {
  try { if (id) localStorage.setItem(PLAYER_KEY, id); else localStorage.removeItem(PLAYER_KEY); } catch { /* private mode */ }
}

void boot();
