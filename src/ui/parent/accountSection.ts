import type { AppContext } from '../context';
import { h, toast } from '../dom';

/** Cuenta y respaldo: email-code sign-in, sync now, backup file download/import. */
export async function accountSection(ctx: AppContext, refresh: () => void): Promise<HTMLElement> {
  const { i18n: t, account, log, sync, backup } = ctx;
  const status = h('p', { class: 'muted', 'aria-live': 'polite' });
  let panel: HTMLElement;
  if (!account) {
    panel = h('p', { class: 'muted' }, t.t('acct.off'));
  } else if (account.signedInEmail) {
    status.textContent = t.t('acct.pending', { n: await log.pending() });
    panel = h('div', {},
      h('p', {}, t.t('acct.signedIn', { email: account.signedInEmail })), status,
      h('div', { class: 'row' },
        h('button', { class: 'btn ok', onClick: async () => {
          const r = await sync.sync();
          status.textContent = r.ok ? t.t('acct.synced', { up: r.pushed, down: r.pulled }) : t.t('acct.syncError', { e: r.error ?? '' });
        } }, t.t('acct.sync')),
        h('button', { class: 'btn soft', onClick: async () => { await account.signOut(); sync.setRemote(null); refresh(); } }, t.t('acct.signOut'))));
  } else {
    const email = h('input', { type: 'email', autocomplete: 'email', inputmode: 'email' });
    const code = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', pattern: '[0-9]*' });
    const step2 = h('div', { hidden: true }, h('label', {}, t.t('acct.code'), code),
      h('button', { class: 'btn ok', onClick: async () => {
        try {
          await account.verifyCode(email.value.trim(), code.value.trim());
          sync.setRemote(account.remote());
          await sync.sync();
          refresh();
        } catch (e) { status.textContent = e instanceof Error ? e.message : String(e); }
      } }, t.t('acct.verify')));
    panel = h('div', {},
      h('label', {}, t.t('acct.email'), email),
      h('button', { class: 'btn', onClick: async () => {
        try { await account.sendCode(email.value.trim()); status.textContent = t.t('acct.sent', { email: email.value.trim() }); step2.hidden = false; code.focus(); }
        catch (e) { status.textContent = e instanceof Error ? e.message : String(e); }
      } }, t.t('acct.send')),
      step2, status);
  }
  const file = h('input', { type: 'file', accept: 'application/json,.json', class: 'visually-hidden', onChange: async (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    try { const r = await backup.importJson(await f.text()); toast(t.t('backup.imported', { n: r.events })); }
    catch (err) { toast(err instanceof Error ? err.message : String(err)); }
  } });
  return h('div', { class: 'parent-section' },
    h('h3', {}, t.t('acct.title')), panel,
    h('h3', {}, t.t('backup.title')),
    h('div', { class: 'row' },
      h('button', { class: 'btn', onClick: async () => {
        const blob = new Blob([await backup.exportJson()], { type: 'application/json' });
        const a = h('a', { href: URL.createObjectURL(blob), download: `goal-reader-${new Date().toISOString().slice(0, 10)}.json` });
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      } }, t.t('backup.export')),
      h('label', { class: 'btn soft' }, t.t('backup.import'), file)));
}
