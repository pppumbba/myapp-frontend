import { useMemo, useState } from 'react';
import { ChevronRight, Folder, SearchLg } from '@untitledui/icons';
import type { MetaMenuItem, MetaTreeData, RoleMeta } from '../lib/accessApi';
import { Checkbox } from '@/components/base/checkbox/checkbox';
import { cx } from '@/utils/cx';
import { t } from '@/i18n';

/** A row of the tree: a meta, or a menu group of an app (no meta of its own). */
interface Node {
  key: string;
  label: string;
  metaId: number | null;
  children: () => Node[];
}

/**
 * Metas as a tree to pick from: apps, their menus and the screens those open (tabs, grids,
 * forms, dashboards…), and under each meta the metas it uses (a grid's forms, a form's lookups
 * and line forms). Ticking a row ticks everything under it. Metas the role already has show
 * ticked and can't be picked again. Metas in no app are listed after the apps.
 */
export function MetaTreePicker({
  metas,
  tree,
  granted,
  picked,
  onChange,
}: {
  metas: RoleMeta[];
  tree: MetaTreeData;
  granted: Set<number>;
  picked: number[];
  onChange: (ids: number[]) => void;
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const byId = useMemo(() => new Map(metas.map((m) => [m.id, m])), [metas]);
  const pickedSet = useMemo(() => new Set(picked), [picked]);

  const model = useMemo(() => {
    const kids = (id: number) => (tree.children[String(id)] ?? []).filter((c) => byId.has(c));
    const menuIds = (items: MetaMenuItem[]): number[] => items.flatMap((i) => [...(i.meta_id ? [i.meta_id] : []), ...menuIds(i.children)]);

    // Every meta under one, through its menu (an app) and what it uses, each once.
    const closures = new Map<number, number[]>();
    const closure = (id: number): number[] => {
      const known = closures.get(id);
      if (known) return known;
      const seen = new Set<number>();
      const walk = (m: number) => {
        if (seen.has(m) || !byId.has(m)) return;
        seen.add(m);
        for (const c of [...kids(m), ...menuIds(tree.menus[String(m)] ?? [])]) walk(c);
      };
      walk(id);
      const all = [...seen];
      closures.set(id, all);
      return all;
    };

    const metaNode = (id: number, path: number[], key: string): Node => ({
      key,
      label: byId.get(id)!.name,
      metaId: id,
      children: () => {
        const below = [...path, id];
        const menu = tree.menus[String(id)];
        const inMenu = new Set(menu ? menuIds(menu) : []);
        return [
          ...(menu ? menuNodes(menu, below, key) : []),
          // What it uses that its menu doesn't show; never a meta it is itself under.
          ...kids(id)
            .filter((c) => !inMenu.has(c) && !below.includes(c))
            .map((c) => metaNode(c, below, `${key}/${c}`)),
        ];
      },
    });
    const menuNodes = (items: MetaMenuItem[], path: number[], key: string): Node[] =>
      items
        .filter((i) => (i.meta_id ? byId.has(i.meta_id) && !path.includes(i.meta_id) : i.children.length))
        .map((i, n) =>
          i.meta_id
            ? { ...metaNode(i.meta_id, path, `${key}/${i.meta_id}`), label: i.label || byId.get(i.meta_id)!.name }
            : { key: `${key}/g${n}`, label: i.label, metaId: null, children: () => menuNodes(i.children, path, `${key}/g${n}`) },
        );

    const apps = metas.filter((m) => m.type?.code === 'app');
    const inApps = new Set(apps.flatMap((a) => closure(a.id)));
    // Outside every app: the metas nothing else outside uses, with theirs under them.
    const rest = metas.filter((m) => !inApps.has(m.id));
    const usedByRest = new Set(rest.flatMap((m) => kids(m.id)));
    const restRoots = rest.filter((m) => !usedByRest.has(m.id));
    const reached = new Set(restRoots.flatMap((m) => closure(m.id)));
    const roots = [...restRoots, ...rest.filter((m) => !reached.has(m.id))];

    const metaIdsOf = (node: Node): number[] => (node.metaId ? closure(node.metaId) : node.children().flatMap(metaIdsOf));
    return {
      apps: apps.map((a) => metaNode(a.id, [], `a${a.id}`)),
      rest: roots.map((m) => metaNode(m.id, [], `r${m.id}`)),
      metaIdsOf,
    };
  }, [metas, tree, byId]);

  const q = search.trim().toLowerCase();
  const found = q
    ? metas.filter((m) => `${m.name} ${m.code} ${m.type?.name ?? ''}`.toLowerCase().includes(q)).slice(0, 100).map((m) => ({ key: `s${m.id}`, label: m.name, metaId: m.id, children: () => [] }) as Node)
    : null;

  function row(node: Node, depth: number): React.ReactNode {
    const ids = model.metaIdsOf(node);
    const free = ids.filter((id) => !granted.has(id));
    const chosen = free.filter((id) => pickedSet.has(id)).length;
    const all = free.length === 0 ? ids.length > 0 : chosen === free.length;
    const children = found ? [] : node.children();
    const expanded = open.has(node.key);
    const meta = node.metaId ? byId.get(node.metaId) : null;
    const toggle = () => {
      const next = new Set(open);
      if (expanded) next.delete(node.key);
      else next.add(node.key);
      setOpen(next);
    };

    return (
      <li key={node.key}>
        <div className={cx('flex items-center gap-2 py-1.5 pr-3', chosen > 0 && 'bg-brand-primary_alt')} style={{ paddingLeft: 8 + depth * 20 }}>
          {children.length ? (
            <button type="button" onClick={toggle} aria-label={expanded ? t('Collapse {name}', { name: node.label }) : t('Expand {name}', { name: node.label })} aria-expanded={expanded} className="rounded p-0.5 text-fg-quaternary hover:bg-primary_hover">
              <ChevronRight className={cx('size-4 transition-transform', expanded && 'rotate-90')} />
            </button>
          ) : (
            <span className="w-5" aria-hidden="true" />
          )}
          <Checkbox
            aria-label={node.label}
            isSelected={all}
            isIndeterminate={!all && chosen > 0}
            isDisabled={free.length === 0}
            onChange={(on) => onChange(on ? [...new Set([...picked, ...free])] : picked.filter((id) => !free.includes(id)))}
          />
          {!meta && <Folder className="size-4 shrink-0 text-fg-quaternary" aria-hidden="true" />}
          <button type="button" onClick={children.length ? toggle : undefined} className="min-w-0 flex-1 text-left">
            <span className="block truncate text-sm font-medium text-primary">{node.label}</span>
            {meta && meta.name !== node.label && <span className="block truncate text-xs text-tertiary">{meta.name}</span>}
          </button>
          {meta && free.length === 0 && <span className="shrink-0 text-xs text-quaternary">{t('has it')}</span>}
          {meta?.type && <span className="shrink-0 text-xs text-tertiary">{meta.type.name}</span>}
        </div>
        {expanded && children.length > 0 && <ul>{children.map((c) => row(c, depth + 1))}</ul>}
      </li>
    );
  }

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 rounded-lg px-3 py-2 ring-1 ring-primary">
        <SearchLg className="size-4 text-fg-quaternary" aria-hidden="true" />
        <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Find metas')} aria-label={t('Find metas')} className="w-full bg-transparent text-sm text-primary outline-none placeholder:text-placeholder" />
      </label>
      <div className="max-h-80 overflow-auto rounded-lg ring-1 ring-secondary">
        {found ? (
          <ul aria-label={t('Metas')}>{found.length ? found.map((n) => row(n, 0)) : <li className="px-3 py-4 text-sm text-tertiary">{t('No meta matches.')}</li>}</ul>
        ) : (
          <>
            {model.apps.length > 0 && (
              <>
                <p className="border-b border-secondary bg-secondary_subtle px-3 py-1.5 text-xs font-semibold text-tertiary">{t('Apps')}</p>
                <ul aria-label={t('Apps')}>{model.apps.map((n) => row(n, 0))}</ul>
              </>
            )}
            {model.rest.length > 0 && (
              <>
                <p className="border-y border-secondary bg-secondary_subtle px-3 py-1.5 text-xs font-semibold text-tertiary">{t('Not in any app')}</p>
                <ul aria-label={t('Not in any app')}>{model.rest.map((n) => row(n, 0))}</ul>
              </>
            )}
          </>
        )}
      </div>
      <p className="text-xs text-tertiary">
        {picked.length ? t('{n} metas picked, with everything under what was ticked.', { n: picked.length }) : t('Ticking an app, menu or screen ticks everything under it.')}
      </p>
    </div>
  );
}
