import type { ContentLibrary } from '@domain/content/ContentLibrary';
import type { SessionPlanner } from '@domain/session/SessionPlanner';
import type { PracticeLog } from '@domain/storage/PracticeLog';
import type { ProfileRepository } from '@domain/storage/ProfileRepository';
import type { SyncService } from '@domain/storage/SyncService';
import type { BackupService } from '@domain/storage/BackupService';
import type { Clock } from '@domain/time/Clock';
import type { AudioPort } from '@domain/audio/AudioPort';
import type { VoiceRecorder } from '@domain/audio/VoiceRecorder';
import type { PronunciationChecker } from '@domain/speech/PronunciationChecker';
import type { AnswerMatcher } from '@domain/speech/AnswerMatcher';
import type { SentenceMatcher } from '@domain/speech/SentenceMatcher';
import type { I18n } from '@domain/i18n/i18n';
import type { Profile } from '@domain/profiles/Profile';
import type { Account } from '@platform/Account';

export type ScreenId = 'players' | 'home' | 'session' | 'stadium' | 'words' | 'practice' | 'parent' | 'audio-review';

export interface NavParams {
  settings?: boolean;
  extra?: boolean;
  /** Audio was unlocked by the home button in the same tap. */
  ready?: boolean;
  /** A chosen topic for this session, as encodeChoice() writes it ('phonics:5', 'story:compare'). */
  topic?: string;
}

/** Everything a screen may depend on - built once in main.ts (composition root). */
export interface AppContext {
  readonly library: ContentLibrary;
  readonly planner: SessionPlanner;
  readonly log: PracticeLog;
  readonly profiles: ProfileRepository;
  readonly sync: SyncService;
  readonly backup: BackupService;
  readonly clock: Clock;
  readonly audio: AudioPort;
  /** Speech recognizer for this device; screens still check the player's mic setting. */
  readonly checker: PronunciationChecker;
  /** Records the child so he can hear himself next to the model (memory only). */
  readonly recorder: VoiceRecorder;
  readonly matcher: AnswerMatcher;
  readonly sentences: SentenceMatcher;
  readonly i18n: I18n;
  /** Cloud account (Supabase). null when the app was built without Supabase keys. */
  readonly account: Account | null;
  player(): Profile | null;
  setPlayer(p: Profile | null): void;
  navigate(screen: ScreenId, params?: NavParams): void;
}

export interface Screen {
  render(host: HTMLElement, params?: NavParams): void | Promise<void>;
  dispose?(): void;
}
