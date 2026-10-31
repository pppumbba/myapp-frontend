import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowNarrowLeft,
  ArrowNarrowRight,
  ArrowUp,
  CheckCircle,
  Edit01,
  Eye,
  InfoCircle,
  LinkExternal01,
  Plus,
  Star01,
  Trash01,
} from '@untitledui/icons';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../../lib/api';
import {
  siteApi,
  SOCIAL_NETWORKS,
  type CheckLevel,
  type Site,
  type SiteDomain,
  type SiteForm,
  type SiteIssue,
  type SitePage,
  type SitePageInput,
  type SiteRelease,
  type SiteSettings,
  type SiteFooterStyle,
  type SiteHeaderStyle,
  type SiteStats,
} from '../../lib/siteApi';
import { themeApi, type ThemeMeta } from '../../lib/theme';
import { SITE_LOOKS, siteLook } from './looks';
import { SOCIAL_EXAMPLES, SOCIAL_NAMES } from './SiteSocial';
import { PageHeader } from '../../components/AppShell';
import { ConfirmDialog } from '../../components/Modal';
import { Alert, IconAction } from '../../components/ui';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { ButtonGroup, ButtonGroupItem } from '@/components/base/button-group/button-group';
import { Input } from '@/components/base/input/input';
import { NativeSelect } from '@/components/base/select/select-native';
import { TextArea } from '@/components/base/textarea/textarea';
import { Toggle } from '@/components/base/toggle/toggle';
import { cx } from '@/utils/cx';
import { t } from '@/i18n';

type Tab = 'pages' | 'settings' | 'domains' | 'forms' | 'visits';

const message = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** A page as the manager edits it before saving; key stays the same while param_id is still unknown. */
interface DraftPage extends SitePageInput {
  key: string;
  status: SitePage['status'] | 'new';
  path: string;
  page: SitePage['page'];
  scheduled: SitePage['scheduled'];
  published_at: string | null;
  children: DraftPage[];
}

let newKey = 0;
const toDraft = (p: SitePage): DraftPage => ({
  key: `p${p.param_id}`,
  param_id: p.param_id,
  page_meta_id: p.page_meta_id,
  label: p.label,
  slug: p.slug,
  title: p.title,
  description: p.description,
  image: p.image,
  in_menu: p.in_menu,
  in_footer: p.in_footer,
  status: p.status,
  path: p.path,
  page: p.page,
  scheduled: p.scheduled,
  published_at: p.published_at,
  children: p.children.map(toDraft),
});
const toInput = (p: DraftPage): SitePageInput => ({
  param_id: p.param_id,
  page_meta_id: p.page_meta_id,
  new_page: p.new_page,
  label: p.label,
  slug: p.slug,
  title: p.title,
  description: p.description,
  image: p.image,
  in_menu: p.in_menu,
  in_footer: p.in_footer,
  children: p.children.map(toInput),
});

/** Every page with its depth, in menu order. */
function flatten(pages: DraftPage[], depth = 0): { page: DraftPage; depth: number }[] {
  return pages.flatMap((p) => [{ page: p, depth }, ...flatten(p.children, depth + 1)]);
}

/** The list a page sits in and its place there. */
function locate(pages: DraftPage[], key: string): { list: DraftPage[]; index: number; parent: DraftPage | null } | null {
  const walk = (list: DraftPage[], parent: DraftPage | null): ReturnType<typeof locate> => {
    for (let i = 0; i < list.length; i++) {
      if (list[i].key === key) return { list, index: i, parent };
      const found = walk(list[i].children, list[i]);
      if (found) return found;
    }
    return null;
  };
  return walk(pages, null);
}

const clone = (pages: DraftPage[]): DraftPage[] => pages.map((p) => ({ ...p, children: clone(p.children) }));

const STATUS: Record<DraftPage['status'], { label: string; color: 'gray' | 'success' | 'warning' | 'error' | 'brand' }> = {
  new: { label: 'Not saved', color: 'gray' },
  draft: { label: 'Draft', color: 'gray' },
  live: { label: 'Live', color: 'success' },
  changed: { label: 'Live · changed', color: 'warning' },
  down: { label: 'Taken down', color: 'error' },
};

const LEVELS: Record<CheckLevel, { label: string; hint: string; icon: typeof AlertCircle; ink: string }> = {
  floor: { label: 'Must fix', hint: 'These stop the page from going out.', icon: AlertCircle, ink: 'text-fg-error-primary' },
  reflex: { label: 'Needs a reason', hint: 'Fix them, or say why the page goes out as it is.', icon: AlertTriangle, ink: 'text-fg-warning-primary' },
  finish: { label: 'Worth a look', hint: 'These never stop anything.', icon: InfoCircle, ink: 'text-fg-quaternary' },
};

/** /sites/:id — one website: its pages (addresses, menu, publishing), settings, domains, forms and visits. */
export default function SiteManagerPage() {
  const id = Number(useParams().id);
  const [site, setSite] = useState<Site | null>(null);
  const [pages, setPages] = useState<DraftPage[]>([]);
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [name, setName] = useState('');
  const [domains, setDomains] = useState<SiteDomain[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('pages');
  const [selected, setSelected] = useState<string | null>(null);

  const apply = useCallback((s: Site) => {
    setSite(s);
    setPages(s.pages.map(toDraft));
    setSettings(s.site);
    setName(s.meta.name);
    setDomains(s.domains);
    setDirty(false);
    setSelected((key) => key ?? (s.pages[0] ? `p${s.pages[0].param_id}` : null));
  }, []);

  const load = useCallback(() => siteApi.get(id).then(apply, (err) => setError(message(err, t('The website could not be loaded.')))), [id, apply]);
  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const selectedPath = flatten(pages).find((f) => f.page.key === selected)?.page;
      const saved = await siteApi.save(id, { name, site: settings, domains, pages: pages.map(toInput) });
      apply(saved);
      // A new page has its param_id now: find it again by its address.
      if (selectedPath && !selectedPath.param_id) {
        const match = flatten(saved.pages.map(toDraft)).find((f) => f.page.label === selectedPath.label);
        if (match) setSelected(match.page.key);
      }
    } catch (err) {
      setError(message(err, t('The website could not be saved.')));
    } finally {
      setSaving(false);
    }
  }

  const change = (next: DraftPage[]) => {
    setPages(next);
    setDirty(true);
  };

  if (!site || !settings) {
    return (
      <>
        {error ? <Alert>{error}</Alert> : <div className="h-64 animate-pulse rounded-xl bg-primary ring-1 ring-secondary motion-reduce:animate-none" />}
      </>
    );
  }

  const primary = site.domains.find((d) => d.is_primary)?.host ?? site.domains[0]?.host;

  return (
    <>
      <Link to="/sites" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-tertiary hover:text-secondary">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t('Websites')}
      </Link>
      <PageHeader
        title={site.meta.name}
        subtitle={primary ?? `/site/${site.meta.code}`}
        actions={
          <>
            <Button size="sm" color="secondary" iconLeading={Eye} href={`/site-preview/${id}`} target="_blank">
              {t('Preview drafts')}
            </Button>
            <Button size="sm" color="secondary" iconLeading={LinkExternal01} href={`/site/${site.meta.code}`} target="_blank">
              {t('Open site')}
            </Button>
            <Button size="sm" isDisabled={!dirty} isLoading={saving} showTextWhileLoading onPress={save}>
              {t('Save')}
            </Button>
          </>
        }
      />
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      {site.issues.length > 0 && <IssueList issues={site.issues} compact className="mb-5" />}

      <ButtonGroup
        size="sm"
        aria-label={t('Website')}
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={[tab]}
        onSelectionChange={(keys) => setTab(([...keys][0] as Tab) ?? 'pages')}
        className="mb-4"
      >
        <ButtonGroupItem id="pages">{t('Pages')}</ButtonGroupItem>
        <ButtonGroupItem id="settings">{t('Settings')}</ButtonGroupItem>
        <ButtonGroupItem id="domains">{t('Domains')}</ButtonGroupItem>
        <ButtonGroupItem id="forms">{t('Forms')}</ButtonGroupItem>
        <ButtonGroupItem id="visits">{t('Visits')}</ButtonGroupItem>
      </ButtonGroup>

      {tab === 'pages' && (
        <PagesTab siteId={id} pages={pages} onChange={change} selected={selected} onSelect={setSelected} dirty={dirty} onPublished={load} />
      )}
      {tab === 'settings' && (
        <SettingsTab
          name={name}
          settings={settings}
          onChange={(n, s) => {
            setName(n);
            setSettings(s);
            setDirty(true);
          }}
        />
      )}
      {tab === 'domains' && (
        <DomainsTab
          code={site.meta.code}
          domains={domains}
          onChange={(d) => {
            setDomains(d);
            setDirty(true);
          }}
        />
      )}
      {tab === 'forms' && <FormsTab siteId={id} />}
      {tab === 'visits' && <VisitsTab siteId={id} />}
    </>
  );
}

function PagesTab({
  siteId,
  pages,
  onChange,
  selected,
  onSelect,
  dirty,
  onPublished,
}: {
  siteId: number;
  pages: DraftPage[];
  onChange: (pages: DraftPage[]) => void;
  selected: string | null;
  onSelect: (key: string | null) => void;
  dirty: boolean;
  onPublished: () => Promise<unknown>;
}) {
  const rows = flatten(pages);
  const current = rows.find((r) => r.page.key === selected)?.page ?? null;
  const [removing, setRemoving] = useState<DraftPage | null>(null);

  const edit = (key: string, op: (at: NonNullable<ReturnType<typeof locate>>, next: DraftPage[]) => void) => {
    const next = clone(pages);
    const at = locate(next, key);
    if (!at) return;
    op(at, next);
    onChange(next);
  };
  const update = (key: string, fields: Partial<DraftPage>) => edit(key, (at) => Object.assign(at.list[at.index], fields));
  const move = (key: string, by: -1 | 1) =>
    edit(key, ({ list, index }) => {
      const to = index + by;
      if (to < 0 || to >= list.length) return;
      [list[index], list[to]] = [list[to], list[index]];
    });
  const indent = (key: string) =>
    edit(key, ({ list, index }) => {
      if (index === 0) return;
      const [page] = list.splice(index, 1);
      list[index - 1].children.push(page);
    });
  const outdent = (key: string) =>
    edit(key, ({ list, index }, next) => {
      const at = locate(next, key);
      if (!at?.parent) return;
      const [page] = list.splice(index, 1);
      const parentAt = locate(next, at.parent.key)!;
      parentAt.list.splice(parentAt.index + 1, 0, page);
    });
  /** Puts a page under another (last among its pages), or at the top level with null. */
  const reparent = (key: string, parentKey: string | null) =>
    edit(key, ({ list, index }, next) => {
      const [page] = list.splice(index, 1);
      if (!parentKey) {
        next.push(page);
        return;
      }
      const parentAt = locate(next, parentKey)!;
      parentAt.list[parentAt.index].children.push(page);
    });
  // Sub pages go one level deep (the header shows one), so the parents are the top-level pages
  // other than the home page; the page's own parent stays listed if it sits deeper.
  const parentKey = current ? (locate(pages, current.key)?.parent?.key ?? null) : null;
  const parents = rows.filter(({ page, depth }) => page.key !== current?.key && ((depth === 0 && page.slug !== '') || page.key === parentKey)).map(({ page }) => page);
  const add = () => {
    const key = `n${++newKey}`;
    onChange([...clone(pages), { key, new_page: true, label: t('New page'), slug: `new-page-${newKey}`, in_menu: true, in_footer: true, status: 'new', path: '', page: null, scheduled: [], published_at: null, children: [] }]);
    onSelect(key);
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="self-start rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
        <ul className="divide-y divide-secondary" aria-label={t('Pages')}>
          {rows.map(({ page, depth }) => {
            const status = STATUS[page.status];
            return (
              <li key={page.key} className={cx('flex items-center gap-2 py-2 pr-2', selected === page.key && 'bg-active')} style={{ paddingLeft: 12 + depth * 20 }}>
                <button type="button" onClick={() => onSelect(page.key)} className="min-w-0 flex-1 rounded-md py-1 text-left outline-focus-ring focus-visible:outline-2" aria-current={selected === page.key}>
                  <span className="flex items-center gap-1.5">
                    {page.slug === '' && depth === 0 && <Star01 className="size-4 shrink-0 text-fg-brand-primary" aria-label={t('Home page')} />}
                    <span className="truncate text-sm font-semibold text-primary">{page.label || t('Untitled')}</span>
                    {!page.in_menu && !page.in_footer && <span className="text-xs text-tertiary">{t('(not in menu)')}</span>}
                    {page.in_menu && !page.in_footer && <span className="text-xs text-tertiary">{t('(header only)')}</span>}
                    {!page.in_menu && page.in_footer && <span className="text-xs text-tertiary">{t('(footer only)')}</span>}
                  </span>
                  <span className="block truncate font-mono text-xs text-tertiary">{page.path || '—'}</span>
                </button>
                <Badge type="color" size="sm" color={status.color}>
                  {t(status.label)}
                </Badge>
                {page.scheduled.length > 0 && (
                  <Badge type="color" size="sm" color="brand">
                    {t('Scheduled')}
                  </Badge>
                )}
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-center gap-1 border-t border-secondary p-2">
          <Button size="sm" color="link-color" iconLeading={Plus} onPress={add}>
            {t('Add page')}
          </Button>
          {current && (
            <span className="ml-auto flex items-center gap-0.5">
              <IconAction icon={ArrowUp} label={t('Move up')} onPress={() => move(current.key, -1)} />
              <IconAction icon={ArrowDown} label={t('Move down')} onPress={() => move(current.key, 1)} />
              <IconAction icon={ArrowNarrowLeft} label={t('Move out a level')} onPress={() => outdent(current.key)} />
              <IconAction icon={ArrowNarrowRight} label={t('Put under the page above')} onPress={() => indent(current.key)} />
              <IconAction icon={Trash01} danger label={t('Take off the site')} onPress={() => setRemoving(current)} />
            </span>
          )}
        </div>
      </div>

      {current ? (
        <PagePanel
          key={current.key}
          siteId={siteId}
          page={current}
          dirty={dirty}
          parents={parents}
          parentKey={parentKey}
          onParent={(key) => reparent(current.key, key)}
          onChange={(fields) => update(current.key, fields)}
          onPublished={onPublished}
        />
      ) : (
        <p className="text-sm text-tertiary">{t('Pick a page to edit it.')}</p>
      )}

      {removing && (
        <ConfirmDialog
          title={t('Take "{name}" off the site?', { name: removing.label ?? '' })}
          message={t('Its address stops working after you save. The page itself stays in the builder, and so does its release history.')}
          confirmLabel={t('Take it off')}
          onConfirm={() => {
            edit(removing.key, ({ list, index }) => list.splice(index, 1));
            onSelect(null);
            setRemoving(null);
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  );
}

function Counter({ value, max }: { value: string | null | undefined; max: number }) {
  const n = (value ?? '').length;
  return <span className={cx('tabular-nums', n > max ? 'text-error-primary' : 'text-tertiary')}>{t('{n} of about {max} characters', { n, max })}</span>;
}

function PagePanel({
  siteId,
  page,
  dirty,
  parents,
  parentKey,
  onParent,
  onChange,
  onPublished,
}: {
  siteId: number;
  page: DraftPage;
  dirty: boolean;
  /** The pages this one can go under. */
  parents: DraftPage[];
  parentKey: string | null;
  onParent: (key: string | null) => void;
  onChange: (fields: Partial<DraftPage>) => void;
  onPublished: () => Promise<unknown>;
}) {
  const saved = !!page.param_id;
  const isHome = page.slug === '' && !parentKey;
  const parent = parents.find((p) => p.key === parentKey);
  const parentHint = isHome
    ? t('The home page can’t go under another page.')
    : page.children.length > 0
      ? t('This page has pages under it, so it stays at the top. Move those out first.')
      : parent
        ? t('Its address becomes {path} when you save.', { path: `/${parent.slug}/${page.slug}` })
        : t('Pick a page to show this one in its dropdown and under its address.');
  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-xl bg-primary p-5 shadow-xs ring-1 ring-secondary">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-md font-semibold text-primary">{t('Page')}</h2>
          {page.page_meta_id ? (
            <Button size="sm" color="secondary" iconLeading={Edit01} href={`/metas/${page.page_meta_id}`}>
              {t('Design in the page builder')}
            </Button>
          ) : (
            <span className="text-sm text-tertiary">{t('Save to make its page, then design it.')}</span>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label={t('Menu label')} value={page.label ?? ''} onChange={(v) => onChange({ label: v })} />
          <Input
            label={t('Address')}
            value={page.slug}
            onChange={(v) => onChange({ slug: v })}
            hint={page.slug === '' ? t('Empty: this is the home page.') : t('Lower case, words joined by hyphens.')}
          />
        </div>
        <NativeSelect
          label={t('Parent page')}
          value={parentKey ?? ''}
          disabled={isHome || page.children.length > 0}
          onChange={(e) => onParent(e.target.value || null)}
          options={[{ label: t('None (a top-level page)'), value: '' }, ...parents.map((p) => ({ label: p.label || p.path || t('Untitled'), value: p.key }))]}
          hint={parentHint}
        />
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Toggle label={t('In the header')} size="sm" isSelected={page.in_menu} onChange={(on) => onChange({ in_menu: on })} />
          <Toggle label={t('In the footer')} size="sm" isSelected={page.in_footer} onChange={(on) => onChange({ in_footer: on })} />
        </div>
      </section>

      <section className="space-y-4 rounded-xl bg-primary p-5 shadow-xs ring-1 ring-secondary">
        <div>
          <h2 className="text-md font-semibold text-primary">{t('Search engines and shared links')}</h2>
          <p className="text-sm text-tertiary">{t('Published with the page; change them, then publish again.')}</p>
        </div>
        <div>
          <Input label={t('Title')} value={page.title ?? ''} onChange={(v) => onChange({ title: v })} placeholder={page.label ?? ''} />
          <p className="mt-1 text-xs">
            <Counter value={page.title || page.label} max={60} />
          </p>
        </div>
        <div>
          <TextArea label={t('Description')} rows={3} value={page.description ?? ''} onChange={(v) => onChange({ description: v })} />
          <p className="mt-1 text-xs">
            <Counter value={page.description} max={160} />
          </p>
        </div>
        <Input label={t('Image for shared links')} value={page.image ?? ''} onChange={(v) => onChange({ image: v })} placeholder="https://…" />
      </section>

      {saved ? (
        <PublishPanel siteId={siteId} page={page} dirty={dirty} onPublished={onPublished} />
      ) : (
        <p className="rounded-xl bg-secondary p-4 text-sm text-tertiary">{t('Save the site to check and publish this page.')}</p>
      )}
    </div>
  );
}

function PublishPanel({ siteId, page, dirty, onPublished }: { siteId: number; page: DraftPage; dirty: boolean; onPublished: () => Promise<unknown> }) {
  const paramId = page.param_id!;
  const [issues, setIssues] = useState<SiteIssue[] | null>(null);
  const [releases, setReleases] = useState<SiteRelease[] | null>(null);
  const [scheduleAt, setScheduleAt] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [checked, history] = await Promise.all([siteApi.check(siteId, paramId), siteApi.releases(siteId, paramId)]);
    setIssues(checked.issues);
    setReleases(history);
  }, [siteId, paramId]);
  useEffect(() => {
    refresh().catch((err) => setError(message(err, t('The checks could not run.'))));
  }, [refresh]);

  const run = async (key: string, action: () => Promise<unknown>, success: string) => {
    setBusy(key);
    setError(null);
    setDone(null);
    try {
      await action();
      setDone(success);
      setNote('');
      setScheduleAt('');
      await Promise.all([refresh(), onPublished()]);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        const found = err.body?.issues;
        if (Array.isArray(found)) setIssues(found as SiteIssue[]);
      }
      setError(message(err, t('That did not work.')));
    } finally {
      setBusy(null);
    }
  };

  const counts = useMemo(() => {
    const c: Record<CheckLevel, number> = { floor: 0, reflex: 0, finish: 0 };
    issues?.forEach((i) => c[i.level]++);
    return c;
  }, [issues]);
  const blocked = counts.floor > 0;
  const needsReason = counts.reflex > 0 && !note.trim();
  const isLive = page.status === 'live' || page.status === 'changed';

  return (
    <section className="space-y-4 rounded-xl bg-primary p-5 shadow-xs ring-1 ring-secondary">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-md font-semibold text-primary">{t('Publishing')}</h2>
          <p className="text-sm text-tertiary">
            {page.published_at ? t('Visitors see the version from {when}.', { when: when(page.published_at) }) : t('Visitors can’t see this page yet.')}
          </p>
        </div>
        <Button size="sm" color="link-color" onPress={() => refresh().catch(() => undefined)}>
          {t('Check again')}
        </Button>
      </div>

      {dirty && <Alert>{t('Save your changes first: publishing sends what is saved.')}</Alert>}
      {error && <Alert>{error}</Alert>}
      {done && (
        <p className="flex items-center gap-2 text-sm font-medium text-success-primary" role="status">
          <CheckCircle className="size-4" aria-hidden="true" />
          {done}
        </p>
      )}

      {!issues ? (
        <div className="h-16 animate-pulse rounded-lg bg-secondary motion-reduce:animate-none" />
      ) : issues.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-secondary">
          <CheckCircle className="size-4 text-fg-success-primary" aria-hidden="true" />
          {t('The checks found nothing.')}
        </p>
      ) : (
        <IssueList issues={issues} />
      )}

      {counts.reflex > 0 && !blocked && (
        <TextArea
          label={t('Why it goes out as it is')}
          rows={2}
          value={note}
          onChange={setNote}
          hint={t('Kept with the release, so others know it was on purpose.')}
        />
      )}

      <div className="flex flex-wrap items-end gap-2">
        <Button
          size="sm"
          isDisabled={dirty || blocked || needsReason || !!busy}
          isLoading={busy === 'publish'}
          showTextWhileLoading
          onPress={() => run('publish', () => siteApi.publish(siteId, paramId, { note: note.trim() || null }), t('Published.'))}
        >
          {t('Publish now')}
        </Button>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-secondary">
          {t('Or at')}
          <input
            type="datetime-local"
            value={scheduleAt}
            min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
            onChange={(e) => setScheduleAt(e.target.value)}
            className="h-9 rounded-lg bg-primary px-3 text-sm text-primary shadow-xs ring-1 ring-primary outline-none ring-inset focus:ring-2 focus:ring-brand"
          />
        </label>
        <Button
          size="sm"
          color="secondary"
          isDisabled={dirty || blocked || needsReason || !scheduleAt || !!busy}
          isLoading={busy === 'schedule'}
          showTextWhileLoading
          onPress={() =>
            run('schedule', () => siteApi.publish(siteId, paramId, { publish_at: new Date(scheduleAt).toISOString(), note: note.trim() || null }), t('Scheduled for {when}.', { when: when(new Date(scheduleAt).toISOString()) }))
          }
        >
          {t('Schedule')}
        </Button>
        {isLive && (
          <Button size="sm" color="secondary-destructive" className="ml-auto" isDisabled={!!busy} isLoading={busy === 'down'} onPress={() => run('down', () => siteApi.unpublish(siteId, paramId), t('Taken down.'))}>
            {t('Take down')}
          </Button>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-primary">{t('Releases')}</h3>
        {!releases ? null : releases.length === 0 ? (
          <p className="text-sm text-tertiary">{t('Never published.')}</p>
        ) : (
          <ul className="divide-y divide-secondary rounded-lg ring-1 ring-secondary">
            {releases.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-primary">{when(r.publish_at)}</span>
                  <span className="text-tertiary"> · {r.publisher ?? t('someone')}</span>
                  {r.note && <span className="block text-tertiary">{r.note}</span>}
                </span>
                {r.current && (
                  <Badge type="color" size="sm" color={r.live ? 'success' : 'error'}>
                    {r.live ? t('Showing now') : t('Taken down')}
                  </Badge>
                )}
                {r.scheduled && (
                  <Badge type="color" size="sm" color="brand">
                    {r.live ? t('Scheduled') : t('Take-down scheduled')}
                  </Badge>
                )}
                {!r.current && !r.scheduled && !r.live && (
                  <Badge type="color" size="sm" color="gray">
                    {t('Take-down')}
                  </Badge>
                )}
                {r.scheduled ? (
                  <Button size="sm" color="link-gray" isDisabled={!!busy} onPress={() => run(`cancel${r.id}`, () => siteApi.cancel(r.id), t('Cancelled.'))}>
                    {t('Cancel')}
                  </Button>
                ) : (
                  r.live &&
                  !r.current && (
                    <Button size="sm" color="link-color" isDisabled={!!busy} isLoading={busy === `restore${r.id}`} onPress={() => run(`restore${r.id}`, () => siteApi.restore(r.id), t('Restored.'))}>
                      {t('Restore')}
                    </Button>
                  )
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}


function IssueList({ issues, compact, className }: { issues: SiteIssue[]; compact?: boolean; className?: string }) {
  return (
    <div className={cx('space-y-3', className)}>
      {(['floor', 'reflex', 'finish'] as CheckLevel[]).map((level) => {
        const found = issues.filter((i) => i.level === level);
        if (!found.length) return null;
        const { label, hint, icon: Icon, ink } = LEVELS[level];
        return (
          <div key={level} className={cx(compact && 'rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary')}>
            <p className="flex items-center gap-2 text-sm font-semibold text-primary">
              <Icon className={cx('size-4 shrink-0', ink)} aria-hidden="true" />
              {t(label)} <span className="font-normal text-tertiary">· {t(hint)}</span>
            </p>
            <ul className="mt-1 ml-6 list-disc space-y-0.5 text-sm text-secondary">
              {found.map((i, n) => (
                <li key={n}>{i.message}</li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function SettingsTab({ name, settings, onChange }: { name: string; settings: SiteSettings; onChange: (name: string, s: SiteSettings) => void }) {
  const [themes, setThemes] = useState<ThemeMeta[]>([]);
  useEffect(() => {
    themeApi.list().then((l) => setThemes(l.themes), () => setThemes([]));
  }, []);
  const set = (fields: Partial<SiteSettings>) => onChange(name, { ...settings, ...fields });

  return (
    <div className="max-w-2xl space-y-4 rounded-xl bg-primary p-5 shadow-xs ring-1 ring-secondary">
      <Input label={t('Name in the builder')} value={name} onChange={(v) => onChange(v, settings)} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label={t('Site title')} value={settings.title ?? ''} onChange={(v) => set({ title: v })} hint={t('In the header and after each page title.')} />
        <Input label={t('Tagline')} value={settings.tagline ?? ''} onChange={(v) => set({ tagline: v })} />
      </div>
      <TextArea label={t('Description')} rows={2} value={settings.description ?? ''} onChange={(v) => set({ description: v })} hint={t('Used where a page has none of its own.')} />
      <Input label={t('Logo')} value={settings.logo ?? ''} onChange={(v) => set({ logo: v })} placeholder="https://…/logo.svg" />
      <NativeSelect
        label={t('Look')}
        value={siteLook(settings.look).slug}
        onChange={(e) => set({ look: e.target.value })}
        options={SITE_LOOKS.map((l) => ({ label: `${l.name} (${l.genre}${l.dark ? `, ${t('dark')}` : ''})`, value: l.slug }))}
        hint={siteLook(settings.look).material}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <NativeSelect
          label={t('Header')}
          value={settings.header ?? 'masthead'}
          onChange={(e) => set({ header: e.target.value as SiteHeaderStyle })}
          options={[
            { label: t('Masthead: name centred, menu beneath'), value: 'masthead' },
            { label: t('Edge: name left, menu right'), value: 'edge' },
            { label: t('Floating pill, stays in view'), value: 'pill' },
            { label: t('Slab: a heavy dark bar'), value: 'slab' },
            { label: t('Banner: a line of news over the bar'), value: 'banner' },
          ]}
        />
        <NativeSelect
          label={t('Footer style')}
          value={settings.footer_style ?? 'letter'}
          onChange={(e) => set({ footer_style: e.target.value as SiteFooterStyle })}
          options={[
            { label: t('Letter: name, footer text, links'), value: 'letter' },
            { label: t('Mast: the name set huge'), value: 'mast' },
            { label: t('Statement: the first line large'), value: 'statement' },
            { label: t('Colophon: one quiet line'), value: 'colophon' },
            { label: t('Columns: the menu in columns'), value: 'columns' },
          ]}
        />
      </div>
      {settings.header === 'banner' && (
        <Input label={t('Banner line')} value={settings.announcement ?? ''} onChange={(v) => set({ announcement: v })} placeholder={t('Closed for Naadam, 11 to 15 July')} hint={t('One short line over the header, on every page.')} />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <NativeSelect
          label={t('Theme')}
          value={settings.theme_meta_id ? String(settings.theme_meta_id) : ''}
          onChange={(e) => set({ theme_meta_id: e.target.value ? Number(e.target.value) : null })}
          options={[{ label: t('The default theme'), value: '' }, ...themes.map((th) => ({ label: th.name, value: String(th.id) }))]}
          hint={t('White button text must read on its brand colour; the checks test it.')}
        />
        <Input label={t('Language')} value={settings.lang} onChange={(v) => set({ lang: v })} hint={t('A code like en or mn.')} />
      </div>
      {settings.theme_meta_id && (
        <Toggle label={t('Buttons in the theme’s brand colour instead of the look’s own')} size="sm" isSelected={settings.brand_accent} onChange={(on) => set({ brand_accent: on })} />
      )}
      <TextArea label={t('Footer')} rows={3} value={settings.footer ?? ''} onChange={(v) => set({ footer: v })} hint={t('Address, opening hours. Line breaks are kept.')} />
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-primary">{t('Social pages')}</legend>
        <p className="text-sm text-tertiary">{t('Shown as icons in the header and footer, and by the Social links widget. Leave the ones you don’t use empty.')}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {SOCIAL_NETWORKS.map((network) => (
            <Input
              key={network}
              label={SOCIAL_NAMES[network]}
              type="url"
              value={settings.social?.[network] ?? ''}
              onChange={(v) => set({ social: { ...settings.social, [network]: v } })}
              placeholder={SOCIAL_EXAMPLES[network]}
            />
          ))}
        </div>
      </fieldset>
    </div>
  );
}

function DomainsTab({ code, domains, onChange }: { code: string; domains: SiteDomain[]; onChange: (d: SiteDomain[]) => void }) {
  const [host, setHost] = useState('');
  const addHost = () => {
    const h = host.trim().toLowerCase();
    if (!h || domains.some((d) => d.host === h)) return;
    onChange([...domains, { host: h, is_primary: domains.length === 0 }]);
    setHost('');
  };

  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
        {domains.length === 0 ? (
          <p className="p-4 text-sm text-tertiary">{t('No domains yet. The site opens at /site/{code}.', { code })}</p>
        ) : (
          <ul className="divide-y divide-secondary">
            {domains.map((d) => (
              <li key={d.host} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1 truncate font-mono text-sm text-primary">{d.host}</span>
                {d.is_primary ? (
                  <Badge type="color" size="sm" color="brand">
                    {t('Primary')}
                  </Badge>
                ) : (
                  <Button size="sm" color="link-color" onPress={() => onChange(domains.map((x) => ({ ...x, is_primary: x.host === d.host })))}>
                    {t('Make primary')}
                  </Button>
                )}
                <IconAction
                  icon={Trash01}
                  danger
                  label={t('Remove {host}', { host: d.host })}
                  onPress={() => {
                    const rest = domains.filter((x) => x.host !== d.host);
                    if (d.is_primary && rest[0]) rest[0] = { ...rest[0], is_primary: true };
                    onChange(rest);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-end gap-2 border-t border-secondary p-4">
          <Input label={t('Add a domain')} size="sm" value={host} onChange={setHost} placeholder="www.company.mn" className="flex-1" />
          <Button size="sm" color="secondary" iconLeading={Plus} isDisabled={!host.trim()} onPress={addHost}>
            {t('Add')}
          </Button>
        </div>
      </div>
      <div className="rounded-xl bg-secondary p-4 text-sm text-secondary">
        <p className="font-semibold text-primary">{t('Pointing a domain at the site')}</p>
        <ol className="mt-2 ml-5 list-decimal space-y-1">
          <li>{t('At your DNS provider, point the domain (A or CNAME record) at the server that serves this app’s frontend.')}</li>
          <li>{t('Give that server an HTTPS certificate for the domain.')}</li>
          <li>{t('List the app’s own host names in VITE_APP_HOSTS when building the frontend; every other host then shows its website.')}</li>
        </ol>
        <p className="mt-2 text-tertiary">{t('The primary domain is the address search engines are given for each page.')}</p>
      </div>
    </div>
  );
}

function FormsTab({ siteId }: { siteId: number }) {
  const [forms, setForms] = useState<SiteForm[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    siteApi.forms(siteId).then(setForms, (err) => setError(message(err, t('The forms could not be loaded.'))));
  }, [siteId]);

  if (error) return <Alert>{error}</Alert>;
  if (!forms) return <div className="h-32 animate-pulse rounded-xl bg-primary ring-1 ring-secondary motion-reduce:animate-none" />;
  if (forms.length === 0) {
    return (
      <div className="max-w-2xl rounded-xl bg-primary p-6 text-sm text-tertiary ring-1 ring-secondary">
        {t('No page has a form yet. In the page builder, add a Form widget and pick a form; make the form public so visitors can send it.')}
      </div>
    );
  }
  return (
    <ul className="grid max-w-4xl gap-4">
      {forms.map((f) => (
        <li key={f.id} className="rounded-xl bg-primary p-5 shadow-xs ring-1 ring-secondary">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/metas/${f.id}`} className="text-md font-semibold text-primary hover:underline">
              {f.name}
            </Link>
            <Badge type="color" size="sm" color={f.is_public ? 'success' : 'error'}>
              {f.is_public ? t('Public') : t('Not public: visitors can’t send it')}
            </Badge>
            <span className="ml-auto font-mono text-xs text-tertiary">{f.pages.join(', ')}</span>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Figure label={t('Sent, last 30 days')} value={f.sent_30_days ?? '—'} />
            <Figure label={t('Sent in all')} value={f.sent_total ?? '—'} />
            <Figure label={t('Last sent')} value={f.last_sent_at ? when(f.last_sent_at) : '—'} />
            <Figure label={t('Notifications watching it')} value={f.notifications} />
          </dl>
          {f.notifications === 0 && (
            <p className="mt-3 flex items-center gap-2 text-sm text-tertiary">
              <InfoCircle className="size-4 shrink-0" aria-hidden="true" />
              {t('Nobody is told when it is sent. Make a notification meta that watches this form, on "added".')}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

function Figure({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-tertiary">{label}</dt>
      <dd className="font-semibold text-primary tabular-nums">{value}</dd>
    </div>
  );
}

function VisitsTab({ siteId }: { siteId: number }) {
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<SiteStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    siteApi.stats(siteId, days).then(setStats, (err) => setError(message(err, t('The visits could not be loaded.'))));
  }, [siteId, days]);

  if (error) return <Alert>{error}</Alert>;
  const max = Math.max(1, ...(stats?.daily.map((d) => d.views) ?? [1]));
  const change = stats && stats.previous > 0 ? Math.round(((stats.total - stats.previous) / stats.previous) * 100) : null;
  const shortDay = (day: string) => new Date(`${day}T00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

  return (
    <div className="max-w-4xl space-y-4">
      <ButtonGroup size="sm" aria-label={t('Period')} selectionMode="single" disallowEmptySelection selectedKeys={[String(days)]} onSelectionChange={(k) => setDays(Number([...k][0]) || 30)}>
        <ButtonGroupItem id="7">{t('7 days')}</ButtonGroupItem>
        <ButtonGroupItem id="30">{t('30 days')}</ButtonGroupItem>
        <ButtonGroupItem id="90">{t('90 days')}</ButtonGroupItem>
      </ButtonGroup>
      {!stats ? (
        <div className="h-64 animate-pulse rounded-xl bg-primary ring-1 ring-secondary motion-reduce:animate-none" />
      ) : (
        <>
          <div className="rounded-xl bg-primary p-5 shadow-xs ring-1 ring-secondary">
            <p className="text-sm font-medium text-tertiary">{t('Page views, last {n} days', { n: stats.days })}</p>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-3 text-display-sm font-semibold text-primary tabular-nums">
              {stats.total.toLocaleString()}
              {change !== null && (
                <span className="text-sm font-medium text-tertiary">{t('{change}% on the {n} days before', { change: change > 0 ? `+${change}` : change, n: stats.days })}</span>
              )}
            </p>
            {/* One series: bars in the brand colour, each with its own hover readout; the numbers are in the table below too. */}
            <div className="relative mt-5">
              <div className="flex h-40 items-end gap-0.5" role="img" aria-label={t('Page views per day')}>
                {stats.daily.map((d, i) => (
                  <div
                    key={d.day}
                    className="flex h-full flex-1 items-end"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover((h) => (h === i ? null : h))}
                  >
                    <div
                      className={cx('w-full rounded-t-[4px] bg-brand-solid transition-opacity motion-reduce:transition-none', hover !== null && hover !== i && 'opacity-50')}
                      style={{ height: `${d.views ? Math.max(2, (d.views / max) * 100) : 0}%` }}
                    />
                  </div>
                ))}
              </div>
              <div className="border-t border-secondary" />
              {hover !== null && stats.daily[hover] && (
                <div
                  className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-primary px-2.5 py-1.5 text-xs shadow-lg ring-1 ring-secondary"
                  style={{ left: `${((hover + 0.5) / stats.daily.length) * 100}%` }}
                >
                  <span className="font-semibold text-primary tabular-nums">{stats.daily[hover].views.toLocaleString()}</span>
                  <span className="text-tertiary"> · {shortDay(stats.daily[hover].day)}</span>
                </div>
              )}
              <div className="mt-1 flex justify-between text-xs text-tertiary">
                <span>{shortDay(stats.daily[0].day)}</span>
                <span>{shortDay(stats.daily[stats.daily.length - 1].day)}</span>
              </div>
            </div>
          </div>
          <div className="rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
            <table className="w-full text-sm">
              <caption className="px-4 pt-4 text-left text-sm font-semibold text-primary">{t('Busiest pages')}</caption>
              <thead>
                <tr className="text-left text-xs text-tertiary">
                  <th className="px-4 py-2 font-medium">{t('Address')}</th>
                  <th className="px-4 py-2 text-right font-medium">{t('Views')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary">
                {stats.pages.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-4 py-3 text-tertiary">
                      {t('No visits in this period.')}
                    </td>
                  </tr>
                ) : (
                  stats.pages.map((p) => (
                    <tr key={p.path}>
                      <td className="px-4 py-2 font-mono text-primary">{p.path}</td>
                      <td className="px-4 py-2 text-right text-primary tabular-nums">{p.views.toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
