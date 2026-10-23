/** Device-local reading position, separate from assessments and mastery. */
export interface StoryBookmark { storyId: string; sentence: number; mode: 'listen' | 'read' }
const key = (profileId: string): string => `goal-reader.story.${profileId}`;
export function readBookmark(profileId: string): StoryBookmark | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key(profileId)) ?? 'null');
    const b = value as Partial<StoryBookmark> | null;
    return b && typeof b.storyId === 'string' && Number.isInteger(b.sentence) && (b.sentence ?? -1) >= 0
      && (b.mode === 'listen' || b.mode === 'read') ? b as StoryBookmark : null;
  } catch { return null; }
}
export function saveBookmark(profileId: string, bookmark: StoryBookmark): void {
  try { localStorage.setItem(key(profileId), JSON.stringify(bookmark)); } catch { /* Private browsing still permits reading. */ }
}
