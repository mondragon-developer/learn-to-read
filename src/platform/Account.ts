import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { toProfile, type Profile } from '@domain/profiles/Profile';
import { isPracticeEvent, type PracticeEvent } from '@domain/storage/events';
import type { RemoteStore } from '@domain/storage/RemoteStore';

const PAGE = 1000;

/**
 * The family's cloud account (Supabase). The parent signs in with a 6-digit email code, not a
 * magic link: a link would open in Safari, outside the installed app, and the session would be lost.
 */
export class Account {
  private readonly client: SupabaseClient;
  private email: string | null = null;

  constructor(url: string, anonKey: string) {
    this.client = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  }

  async init(): Promise<string | null> {
    const { data } = await this.client.auth.getSession();
    this.email = data.session?.user.email ?? null;
    return this.email;
  }

  get signedInEmail(): string | null { return this.email; }

  async sendCode(email: string): Promise<void> {
    const { error } = await this.client.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) throw error;
  }

  async verifyCode(email: string, token: string): Promise<void> {
    const { data, error } = await this.client.auth.verifyOtp({ email, token, type: 'email' });
    if (error) throw error;
    this.email = data.user?.email ?? email;
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
    this.email = null;
  }

  remote(): RemoteStore { return new SupabaseRemote(this.client); }
}

/** RemoteStore over Supabase tables (see supabase/migrations/0001_init.sql). */
export class SupabaseRemote implements RemoteStore {
  constructor(private readonly db: SupabaseClient) {}

  async pushEvents(events: PracticeEvent[]): Promise<void> {
    for (let i = 0; i < events.length; i += PAGE) {
      const rows = events.slice(i, i + PAGE).map((e) => ({ id: e.id, profile_id: e.profileId, data: e }));
      const { error } = await this.db.from('events').upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    }
  }

  async pullEvents(cursor: string | null): Promise<{ events: PracticeEvent[]; cursor: string | null }> {
    let from = cursor ? Number(cursor) : 0;
    const out: PracticeEvent[] = [];
    for (;;) {
      const { data, error } = await this.db.from('events').select('seq,data').gt('seq', from).order('seq').limit(PAGE);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as { seq: number; data: unknown }[];
      for (const r of rows) if (isPracticeEvent(r.data)) out.push(r.data);
      if (rows.length) from = rows[rows.length - 1]?.seq ?? from;
      if (rows.length < PAGE) break;
    }
    return { events: out, cursor: String(from) };
  }

  async pushProfiles(profiles: Profile[]): Promise<void> {
    for (const p of profiles) {
      const { error } = await this.db.rpc('upsert_profile', { p_id: p.id, p_data: p, p_updated_at: p.updatedAt });
      if (error) throw new Error(error.message);
    }
  }

  async pullProfiles(): Promise<Profile[]> {
    const { data, error } = await this.db.from('profiles').select('data');
    if (error) throw new Error(error.message);
    return ((data ?? []) as { data: unknown }[]).map((r) => toProfile(r.data)).filter((p): p is Profile => p !== null);
  }
}
