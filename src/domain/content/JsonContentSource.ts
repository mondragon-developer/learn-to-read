import type { ContentSource } from './ContentLibrary';
import type { ChallengeFile, HeartWordFile, Story, Unit } from './types';
import heart from '../../data/heartwords.json';
import challenge from '../../data/challenge.json';

// Vite bundles every unit/story file at build time; adding u09.json needs no code change.
const unitFiles = import.meta.glob<Unit>('../../data/units/*.json', { eager: true, import: 'default' });
const storyFiles = import.meta.glob<Story>('../../data/stories/*.json', { eager: true, import: 'default' });

export class JsonContentSource implements ContentSource {
  units(): Unit[] { return Object.values(unitFiles); }
  heartWords() { return (heart as HeartWordFile).words; }
  stories(): Story[] { return Object.values(storyFiles); }
  challengeWords() { return (challenge as ChallengeFile).words; }
}
