import type { DragEvent, ReactNode } from 'react';
import { ArrowRight, Calendar, CheckSquare, ChevronDown, Circle, Columns03, Edit01, EyeOff, FilterLines, Folder, Paperclip, PenTool01, Plus, SearchLg, Trash01, UploadCloud02, Zap } from '@untitledui/icons';
import { cx } from '@/utils/cx';
import { pointOf, type MenuPoint } from '../../components/ContextMenu';
import { MENU_ICONS } from '../../render/AppView';
import { ChartCard, DashboardGrid, cardHeight, spanClass } from '../../render/DashboardView';
import { DrilldownHost } from '../../render/DrilldownHost';
import { MetaView } from '../../render/MetaView';
import { actionsOf, isContainer, nodeLabel, paramsOf, type ActionNode, type ParamNode, type StudioMode, type StudioNode } from './tree';
import { t } from '@/i18n';

export type DropWhere = 'before' | 'after' | 'into' | 'end';
export interface DropHint {
  key: string | null;
  where: DropWhere;
}

/** What the canvas needs from the studio to select, drag, drop and open screens. */
export interface CanvasCtx {
  mode: StudioMode;
  selected: string | null;
  select: (key: string | null) => void;
  /** Something (a node or a palette item) is being dragged. */
  active: boolean;
  draggingKey: string | null;
  hint: DropHint | null;
  startNode: (key: string) => void;
  end: () => void;
  over: (key: string | null, where: DropWhere) => void;
  drop: () => void;
  /** The name of the meta a param opens or looks up, or a button's form; new ones included. */
  targetName: (n: StudioNode) => string | null;
  /** Can this node's screen be designed here (a datagrid, form or tab set)? */
  canOpen: (n: StudioNode) => boolean;
  open: (n: StudioNode) => void;
  /** Opens the right-click menu for a node, or for the canvas itself (null). */
  menu: (key: string | null, at: MenuPoint) => void;
}

type Axis = 'x' | 'y';

/** One node on the canvas: picked by a click, opened by a double click, dragged, and a drop target before or after it. */
function Frame({ node, ctx, axis, className, children, label = true }: { node: StudioNode; ctx: CanvasCtx; axis: Axis; className?: string; children: ReactNode; label?: boolean }) {
  const picked = ctx.selected === node.key;
  const hint = ctx.hint?.key === node.key ? ctx.hint.where : null;

  return (
    <div
      draggable
      role="button"
      tabIndex={0}
      aria-pressed={picked}
      aria-label={nodeLabel(node)}
      onDragStart={(e) => {
        e.stopPropagation();
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', node.key);
        ctx.startNode(node.key);
      }}
      onDragEnd={ctx.end}
      onDragOver={(e) => {
        if (!ctx.active) return;
        e.preventDefault();
        e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        const first = axis === 'x' ? e.clientX < r.left + r.width / 2 : e.clientY < r.top + r.height / 2;
        ctx.over(node.key, first ? 'before' : 'after');
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        ctx.drop();
      }}
      onClick={(e) => {
        e.stopPropagation();
        ctx.select(node.key);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        ctx.menu(node.key, pointOf(e));
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (ctx.canOpen(node)) ctx.open(node);
      }}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          ctx.select(node.key);
        }
      }}
      className={cx(
        'group/frame relative cursor-grab rounded-lg outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2',
        picked ? 'ring-2 ring-brand' : 'ring-1 ring-transparent hover:ring-secondary',
        ctx.draggingKey === node.key && 'opacity-40',
        className,
      )}
    >
      {hint === 'before' && <span className={cx('pointer-events-none absolute z-20 rounded-full bg-brand-solid', axis === 'x' ? 'inset-y-0 -left-1.5 w-1' : 'inset-x-0 -top-1.5 h-1')} />}
      {hint === 'after' && <span className={cx('pointer-events-none absolute z-20 rounded-full bg-brand-solid', axis === 'x' ? 'inset-y-0 -right-1.5 w-1' : 'inset-x-0 -bottom-1.5 h-1')} />}
      {label && picked && (
        <span className="absolute -top-2.5 left-2 z-10 rounded-md bg-brand-solid px-1.5 text-[11px] leading-5 font-medium text-white">{nodeLabel(node)}</span>
      )}
      {children}
    </div>
  );
}

/** Opens the screen a menu item or tab points at, to design it. */
function OpenButton({ node, ctx }: { node: StudioNode; ctx: CanvasCtx }) {
  if (!ctx.canOpen(node)) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        ctx.open(node);
      }}
      className="flex shrink-0 items-center gap-1 rounded-md bg-brand-solid px-2 py-0.5 text-xs font-semibold text-white opacity-0 outline-focus-ring group-hover/frame:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 group-aria-pressed/frame:opacity-100"
    >
      {t('Open')}
      <ArrowRight className="size-3.5" />
    </button>
  );
}

/** Where a container takes drops into itself (its empty body or the space after its children). */
function Inside({ node, ctx, empty, children, className }: { node: StudioNode; ctx: CanvasCtx; empty: string; children?: ReactNode; className?: string }) {
  const on = ctx.hint?.key === node.key && ctx.hint.where === 'into';
  return (
    <div
      onDragOver={(e) => {
        if (!ctx.active) return;
        e.preventDefault();
        e.stopPropagation();
        ctx.over(node.key, 'into');
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        ctx.drop();
      }}
      className={className}
    >
      {children}
      {(!node.children.length || ctx.active) && (
        <div className={cx('mt-1 rounded-md border border-dashed px-3 py-2 text-center text-xs', on ? 'border-brand bg-brand-primary_alt text-brand-secondary' : 'border-primary text-quaternary')}>{empty}</div>
      )}
    </div>
  );
}

/** The canvas's free space: a drop there goes at the end; a click there picks the meta itself. */
export function CanvasRoot({ ctx, children, className }: { ctx: CanvasCtx; children: ReactNode; className?: string }) {
  const on = (e: DragEvent) => {
    if (!ctx.active) return;
    e.preventDefault();
    ctx.over(null, 'end');
  };
  return (
    <div
      className={className}
      onClick={() => ctx.select(null)}
      onContextMenu={(e) => {
        e.preventDefault();
        ctx.menu(null, pointOf(e));
      }}
      onDragOver={on}
      onDrop={(e) => {
        e.preventDefault();
        ctx.drop();
      }}
    >
      {children}
    </div>
  );
}

function EndSlot({ ctx, text, className }: { ctx: CanvasCtx; text: string; className?: string }) {
  const on = ctx.hint?.key === null && ctx.hint.where === 'end';
  return (
    <div className={cx('rounded-lg border border-dashed px-4 py-4 text-center text-sm', on ? 'border-brand bg-brand-primary_alt text-brand-secondary' : 'border-primary text-tertiary', className)}>
      <Plus className="mr-1 inline size-4" />
      {text}
    </div>
  );
}

export function StudioCanvas({ ctx, nodes, title }: { ctx: CanvasCtx; nodes: StudioNode[]; title: string }) {
  switch (ctx.mode) {
    case 'app':
      return <MenuCanvas ctx={ctx} nodes={nodes} title={title} />;
    case 'datagrid':
      return <GridCanvas ctx={ctx} nodes={nodes} title={title} />;
    case 'form':
      return <FormCanvas ctx={ctx} nodes={nodes} title={title} />;
    case 'tabs':
      return <TabsCanvas ctx={ctx} nodes={nodes} title={title} />;
    case 'dashboard':
      return <DashboardCanvas ctx={ctx} nodes={nodes} title={title} />;
    case 'page':
      // Pages are designed on PageCanvas, not here.
      return null;
  }
}

// ---- Menu (an app): a sidebar of items and groups. ----

function MenuCanvas({ ctx, nodes, title }: { ctx: CanvasCtx; nodes: StudioNode[]; title: string }) {
  const items = (list: StudioNode[], depth: number): ReactNode =>
    paramsOf(list).map((p) => {
      const Icon = (p.values.icon_cls && MENU_ICONS[p.values.icon_cls]) || (isContainer('app', p) ? Folder : Circle);
      const opens = ctx.targetName(p);
      return (
        <Frame key={p.key} node={p} ctx={ctx} axis="y" label={false} className="mb-1">
          <div className={cx('flex items-center gap-2.5 rounded-lg px-3 py-2', depth === 0 ? 'bg-primary' : '', p.values.is_show === false && 'opacity-50')}>
            {depth === 0 && <Icon className="size-5 shrink-0 text-fg-quaternary" />}
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-secondary">{nodeLabel(p)}</span>
            {opens ? <span className="max-w-[40%] truncate text-xs text-tertiary">→ {opens}</span> : isContainer('app', p) && <ChevronDown className="size-4 text-fg-quaternary" />}
            <OpenButton node={p} ctx={ctx} />
          </div>
          {isContainer('app', p) && (
            <Inside node={p} ctx={ctx} empty={t('Drop items into this group')} className="ml-6 border-l border-secondary pl-2">
              {items(p.children, depth + 1)}
            </Inside>
          )}
        </Frame>
      );
    });

  return (
    <CanvasRoot ctx={ctx} className="flex min-h-full gap-6 p-6">
      <div className="w-96 shrink-0 rounded-xl bg-secondary_alt p-3 shadow-xs ring-1 ring-secondary">
        <div className="mb-4 flex items-center gap-2.5 px-2 pt-1">
          <span className="flex size-8 items-center justify-center rounded-lg bg-brand-solid text-sm font-semibold text-white">{title.charAt(0).toUpperCase()}</span>
          <span className="truncate text-sm font-semibold text-primary">{title}</span>
        </div>
        {items(nodes, 0)}
        <EndSlot ctx={ctx} text={t('Drag menu items or new screens here')} className="mt-2" />
      </div>
      <div className="hidden flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-secondary px-6 text-center text-sm text-quaternary lg:flex">
        <p>{t('Drop a new datagrid, form or tab set on the menu: it is made with the app and opens here to design.')}</p>
        <p>{t('Double-click a menu item, or press Open, to design the screen it opens.')}</p>
      </div>
    </CanvasRoot>
  );
}

// ---- Datagrid: its buttons, then columns side by side with sample rows. ----

function sample(p: ParamNode, row: number): ReactNode {
  const v = p.values;
  const options = (v.json_config as { options?: unknown })?.options;
  if (Array.isArray(options) && options.length) return String(options[row % options.length]);
  switch (v.data_type) {
    case 'integer':
      return v.is_select ? `${t('Record')} ${row + 1}` : String((row + 1) * 12);
    case 'decimal':
      return ((row + 1) * 1234.5).toLocaleString(undefined, { minimumFractionDigits: 2 });
    case 'date':
      return `2026-10-${String(10 + row).padStart(2, '0')}`;
    case 'datetime':
      return `2026-10-${String(10 + row).padStart(2, '0')} 09:30`;
    case 'boolean':
      return <CheckSquare className={cx('size-4', row % 2 ? 'text-fg-quaternary' : 'text-fg-brand-primary')} />;
    case 'subgrid':
    case 'detail':
      return <span className="text-brand-secondary">▸ {t('{n} rows', { n: row + 2 })}</span>;
    default:
      return `${nodeLabel(p)} ${row + 1}`;
  }
}

const BUTTON_ICONS = { add: Plus, edit: Edit01, delete: Trash01 } as Record<string, typeof Plus>;

function ButtonChip({ a, ctx }: { a: ActionNode; ctx: CanvasCtx }) {
  const Icon = BUTTON_ICONS[a.values.action] ?? Zap;
  const form = ctx.targetName(a);
  return (
    <Frame node={a} ctx={ctx} axis="x" label={false} className="shrink-0">
      <span
        title={form ? t('Opens {name}', { name: form }) : t('Pick its form in Properties')}
        className={cx(
          'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold',
          a.values.action === 'add' ? 'bg-brand-solid text-white' : a.values.action === 'delete' ? 'text-error-primary ring-1 ring-error_subtle ring-inset' : 'text-secondary ring-1 ring-primary ring-inset',
          !form && 'outline-2 outline-offset-1 outline-warning-500 outline-dashed',
        )}
      >
        <Icon className="size-4" />
        {nodeLabel(a)}
        {!a.values.show_in_toolbar && <span className="text-xs font-normal opacity-70">({t('on rows')})</span>}
      </span>
    </Frame>
  );
}

function GridCanvas({ ctx, nodes, title }: { ctx: CanvasCtx; nodes: StudioNode[]; title: string }) {
  const columns = paramsOf(nodes);
  const buttons = actionsOf(nodes);
  return (
    <CanvasRoot ctx={ctx} className="min-h-full p-6">
      <div className="rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-secondary px-4 py-3">
          <p className="text-md font-semibold text-primary">{title}</p>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-tertiary ring-1 ring-primary"><SearchLg className="size-4" />{t('Search')}</span>
            {buttons.map((a) => <ButtonChip key={a.key} a={a} ctx={ctx} />)}
            {!buttons.length && <span className="rounded-lg border border-dashed border-primary px-3 py-1.5 text-xs text-quaternary">{t('Drop buttons or forms here')}</span>}
          </div>
        </div>
        <div className="flex overflow-x-auto p-3">
          {columns.map((c) => {
            const width = Number.parseInt(String(c.values.column_width ?? ''), 10);
            return (
              <Frame key={c.key} node={c} ctx={ctx} axis="x" className={cx('mx-0.5 shrink-0', c.values.is_show === false && 'opacity-50')}>
                <div style={{ width: width > 40 ? width : 160 }}>
                  <div className="flex items-center gap-1.5 rounded-t-lg bg-secondary px-3 py-2.5 text-xs font-semibold text-tertiary">
                    <span className="min-w-0 flex-1 truncate">{nodeLabel(c)}</span>
                    {c.values.is_criteria && <FilterLines className="size-3.5 shrink-0" aria-label={t('Filter')} />}
                    {c.values.is_show === false && <EyeOff className="size-3.5 shrink-0" aria-label={t('Hidden')} />}
                  </div>
                  {[0, 1, 2].map((row) => (
                    <div key={row} className="truncate border-b border-secondary px-3 py-3 text-sm text-secondary">{sample(c, row)}</div>
                  ))}
                </div>
              </Frame>
            );
          })}
          <EndSlot ctx={ctx} text={t('Drop a column')} className="ml-2 flex w-40 shrink-0 items-center justify-center" />
        </div>
      </div>
    </CanvasRoot>
  );
}

// ---- Form: fields in two columns, drawn by type. ----

const WIDE = ['text', 'detail', 'subgrid', 'multifile', 'signature', 'document'];

function FieldMock({ p, ctx }: { p: ParamNode; ctx: CanvasCtx }) {
  const v = p.values;
  const box = 'flex h-10 items-center gap-2 rounded-lg bg-primary px-3 text-sm text-placeholder shadow-xs ring-1 ring-primary ring-inset';
  const options = (v.json_config as { options?: unknown })?.options;
  switch (v.data_type) {
    case 'boolean':
      return (
        <span className="flex items-center gap-2 py-2 text-sm text-secondary">
          <span className="size-4 rounded ring-1 ring-primary" />
          {nodeLabel(p)}
        </span>
      );
    case 'text':
      return <div className={cx(box, 'h-20 items-start pt-2')}>{v.default_value || t('Write here…')}</div>;
    case 'date':
    case 'datetime':
      return <div className={box}><Calendar className="size-4 text-fg-quaternary" />{v.data_type === 'date' ? 'yyyy-mm-dd' : 'yyyy-mm-dd hh:mm'}</div>;
    case 'singlefile':
    case 'multifile':
      return <div className={cx(box, 'h-16 justify-center border-dashed')}><UploadCloud02 className="size-4" />{t('Drop files or browse')}</div>;
    case 'signature':
      return <div className={cx(box, 'h-20 justify-center')}><PenTool01 className="size-4" />{t('Sign here')}</div>;
    case 'detail':
    case 'subgrid':
      return (
        <div className="overflow-hidden rounded-lg ring-1 ring-secondary">
          <div className="flex items-center gap-2 bg-secondary px-3 py-2 text-xs font-semibold text-tertiary"><Columns03 className="size-4" />{ctx.targetName(p) ?? t('Pick the line form in Properties')}</div>
          <div className="px-3 py-2 text-xs text-quaternary">{t('Lines are added here')}</div>
        </div>
      );
    default:
      if (v.is_select || (Array.isArray(options) && options.length)) {
        return (
          <div className={cx(box, 'justify-between')}>
            <span className="truncate">{Array.isArray(options) && options.length ? String(options[0]) : (ctx.targetName(p) ?? t('Choose…'))}</span>
            {v.is_select ? <SearchLg className="size-4 text-fg-quaternary" /> : <ChevronDown className="size-4 text-fg-quaternary" />}
          </div>
        );
      }
      return <div className={box}>{v.default_value || (v.data_type === 'integer' || v.data_type === 'decimal' ? '0' : '')}</div>;
  }
}

function FormCanvas({ ctx, nodes, title }: { ctx: CanvasCtx; nodes: StudioNode[]; title: string }) {
  return (
    <CanvasRoot ctx={ctx} className="min-h-full p-6">
      <div className="mx-auto max-w-3xl rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
        <div className="border-b border-secondary px-6 py-4">
          <p className="text-lg font-semibold text-primary">{title}</p>
        </div>
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 p-6 sm:grid-cols-2">
          {paramsOf(nodes).map((f) => (
            <Frame key={f.key} node={f} ctx={ctx} axis="x" label={false} className={cx('p-2', WIDE.includes(String(f.values.data_type)) && 'sm:col-span-2', f.values.is_show === false && 'opacity-50')}>
              {f.values.data_type !== 'boolean' && (
                <p className="mb-1.5 flex items-center gap-1 text-sm font-medium text-secondary">
                  {nodeLabel(f)}
                  {f.values.is_required && <span className="text-brand-tertiary">*</span>}
                  {f.values.is_show === false && <EyeOff className="ml-1 size-3.5 text-fg-quaternary" />}
                  {(f.values.data_type === 'singlefile' || f.values.data_type === 'multifile') && <Paperclip className="ml-1 size-3.5 text-fg-quaternary" />}
                </p>
              )}
              <div className="pointer-events-none">
                <FieldMock p={f} ctx={ctx} />
              </div>
            </Frame>
          ))}
          <EndSlot ctx={ctx} text={t('Drop a field')} className="sm:col-span-2" />
        </div>
        <div className="flex justify-end gap-3 border-t border-secondary px-6 py-4 text-sm font-semibold">
          <span className="rounded-lg px-3.5 py-2 text-secondary ring-1 ring-primary">{t('Cancel')}</span>
          <span className="rounded-lg bg-brand-solid px-3.5 py-2 text-white">{t('Save')}</span>
        </div>
      </div>
    </CanvasRoot>
  );
}

// ---- Dashboard: its charts, live, at their size on the 12-column grid. ----

function DashboardCanvas({ ctx, nodes, title }: { ctx: CanvasCtx; nodes: StudioNode[]; title: string }) {
  return (
    <CanvasRoot ctx={ctx} className="min-h-full p-6">
      <p className="mb-4 text-lg font-semibold text-primary">{title}</p>
      <DashboardGrid>
        {paramsOf(nodes).map((p) => {
          const config = (p.values.json_config ?? {}) as { w?: unknown; h?: unknown };
          const w = Number(config.w) || 6;
          const h = Number(config.h) || 2;
          const chart = p.values.ref_meta_id ? Number(p.values.ref_meta_id) : null;
          return (
            <Frame key={p.key} node={p} ctx={ctx} axis="x" label={false} className={cx(spanClass(w), p.values.is_show === false && 'opacity-50')}>
              {chart ? (
                // The chart as saved; it doesn't react while it's being placed.
                <div className="pointer-events-none select-none" inert>
                  <ChartCard key={chart} metaId={chart} title={p.values.label_name} height={cardHeight(h)} />
                </div>
              ) : (
                <div className="flex items-center justify-center rounded-xl border border-dashed border-primary bg-primary px-4 text-center text-sm text-tertiary" style={{ height: cardHeight(h) }}>
                  {t('Pick the chart in Properties')}
                </div>
              )}
            </Frame>
          );
        })}
        <EndSlot ctx={ctx} text={t('Drag charts here')} className="md:col-span-12" />
      </DashboardGrid>
    </CanvasRoot>
  );
}

// ---- Tabs: the tab strip, and the picked tab's screen below it. ----

function TabsCanvas({ ctx, nodes, title }: { ctx: CanvasCtx; nodes: StudioNode[]; title: string }) {
  const tabs = paramsOf(nodes);
  const shown = tabs.find((n) => n.key === ctx.selected) ?? tabs[0];
  const screen = shown && !shown.refKey && shown.values.ref_meta_id ? Number(shown.values.ref_meta_id) : null;

  return (
    <CanvasRoot ctx={ctx} className="min-h-full p-6">
      <div className="rounded-xl bg-primary p-5 shadow-xs ring-1 ring-secondary">
        <p className="mb-4 text-md font-semibold text-primary">{title}</p>
        <div className="flex items-end gap-1 overflow-x-auto border-b border-secondary">
          {tabs.map((n) => (
            <Frame key={n.key} node={n} ctx={ctx} axis="x" label={false} className="shrink-0 rounded-b-none">
              <span className={cx('flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold', shown?.key === n.key ? 'border-fg-brand-primary_alt text-brand-secondary' : 'border-transparent text-quaternary', n.values.is_show === false && 'opacity-50')}>
                {nodeLabel(n)}
                <OpenButton node={n} ctx={ctx} />
              </span>
            </Frame>
          ))}
          <EndSlot ctx={ctx} text={t('Drop a tab')} className="mb-1 ml-2 shrink-0 px-3 py-1.5" />
        </div>
        <div className="mt-5">
          {screen ? (
            // The tab's screen as last saved; it doesn't react while it's being designed.
            <div className="pointer-events-none max-h-[60vh] overflow-hidden select-none" inert>
              <DrilldownHost>
                <MetaView key={screen} metaId={screen} />
              </DrilldownHost>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-primary px-6 py-12 text-center text-sm text-tertiary">
              {shown?.refKey
                ? t('{name} is new. Open it to design it; it is made at Save.', { name: ctx.targetName(shown) ?? '' })
                : shown
                  ? t('Pick the screen this tab shows in Properties, or drag a screen from the left onto the tab strip.')
                  : t('Drag tabs from the left.')}
            </p>
          )}
        </div>
      </div>
    </CanvasRoot>
  );
}
