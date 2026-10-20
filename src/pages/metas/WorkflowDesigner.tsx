import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Plus } from '@untitledui/icons';
import { ApiError } from '../../lib/api';
import type { Meta, MetaOption } from '../../lib/metaApi';
import { workflowApi, type Point, type WfmStatus, type WfmTransition, type WorkflowLayout } from '../../lib/workflowApi';
import { Alert } from '../../components/ui';
import { ConfirmDialog, Modal } from '../../components/Modal';
import { Section } from '../../components/form';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { NativeSelect } from '@/components/base/select/select-native';
import { TextArea } from '@/components/base/textarea/textarea';
import { Toggle } from '@/components/base/toggle/toggle';
import { palette } from '../../render/palette';

const NODE_W = 176;
const NODE_H = 56;
const START = 40;
const COLORS = Object.keys(palette);

type Rect = { x: number; y: number; w: number; h: number };

/** Where the line from a box's centre towards (tx, ty) leaves the box. */
function edgePoint(r: Rect, tx: number, ty: number): Point {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const s = 1 / Math.max(Math.abs(dx) / (r.w / 2), Math.abs(dy) / (r.h / 2));
  return { x: cx + dx * s, y: cy + dy * s };
}

/** A default spot for a status the layout doesn't place yet: a grid, four across. */
const defaultSpot = (i: number): Point => ({ x: 130 + (i % 4) * 220, y: 50 + Math.floor(i / 4) * 140 });

/**
 * The workflow designer. Statuses are boxes you drag around; drag from a box's dot (or the
 * start circle's) onto another box to add a transition. Double-click a box or an arrow to
 * edit it. Positions are saved in the workflow meta's json_config.layout.
 */
export function WorkflowDesigner({ meta, options }: { meta: Meta; options: MetaOption[] }) {
  const [statuses, setStatuses] = useState<WfmStatus[]>([]);
  const [transitions, setTransitions] = useState<WfmTransition[]>([]);
  const [layout, setLayout] = useState<WorkflowLayout>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<'saving' | 'saved' | null>(null);

  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number | 'start'; dx: number; dy: number; moved: boolean } | null>(null);
  const [drawing, setDrawing] = useState<{ from: number | null; to: Point } | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  const [editingStatus, setEditingStatus] = useState<WfmStatus | 'new' | null>(null);
  const [editingTransition, setEditingTransition] = useState<WfmTransition | null>(null);

  const load = useCallback(async () => {
    try {
      const def = await workflowApi.get(meta.id);
      setStatuses(def.statuses);
      setTransitions(def.transitions);
      setLayout(Array.isArray(def.layout) ? {} : def.layout);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The workflow could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [meta.id]);

  useEffect(() => {
    load();
  }, [load]);

  const pos = useCallback((s: WfmStatus, i: number): Point => layout.statuses?.[s.id] ?? defaultSpot(i), [layout]);
  const start = layout.start ?? { x: 30, y: 58 };
  const rects = useMemo(() => new Map(statuses.map((s, i) => [s.id, { ...pos(s, i), w: NODE_W, h: NODE_H }])), [statuses, pos]);
  const startRect: Rect = { ...start, w: START, h: START };
  const size = useMemo(() => {
    const all = [...rects.values(), startRect];
    return { w: Math.max(960, ...all.map((r) => r.x + r.w + 80)), h: Math.max(440, ...all.map((r) => r.y + r.h + 80)) };
    // startRect is derived from layout, which rects already follow.
  }, [rects, start.x, start.y]);

  async function saveLayout(next: WorkflowLayout) {
    setSaved('saving');
    try {
      await workflowApi.saveLayout(meta.id, next);
      setSaved('saved');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The layout could not be saved.');
      setSaved(null);
    }
  }

  /** Pointer position inside the canvas, scroll included. */
  function point(e: { clientX: number; clientY: number }): Point {
    const el = canvas.current!;
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left + el.scrollLeft, y: e.clientY - r.top + el.scrollTop };
  }

  function startDrag(e: ReactPointerEvent, id: number | 'start', at: Point) {
    if (e.button !== 0) return;
    const p = point(e);
    drag.current = { id, dx: p.x - at.x, dy: p.y - at.y, moved: false };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }

  function onDragMove(e: ReactPointerEvent) {
    const d = drag.current;
    if (!d) return;
    const p = point(e);
    const at = { x: Math.max(0, Math.round(p.x - d.dx)), y: Math.max(0, Math.round(p.y - d.dy)) };
    d.moved = true;
    setLayout((l) => (d.id === 'start' ? { ...l, start: at } : { ...l, statuses: { ...l.statuses, [d.id]: at } }));
  }

  function endDrag() {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) {
      // Save every box's spot, including ones still on their default spot.
      setLayout((l) => {
        const next = { start: l.start ?? start, statuses: Object.fromEntries(statuses.map((s, i) => [s.id, l.statuses?.[s.id] ?? defaultSpot(i)])) };
        saveLayout(next);
        return next;
      });
    }
  }

  function startDrawing(e: ReactPointerEvent, from: number | null) {
    if (e.button !== 0) return;
    e.stopPropagation();
    setDrawing({ from, to: point(e) });
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }

  async function endDrawing(e: ReactPointerEvent) {
    const d = drawing;
    setDrawing(null);
    if (!d) return;
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-status-id]');
    const to = target ? Number(target.getAttribute('data-status-id')) : null;
    if (!to || to === d.from) return;
    try {
      const t = await workflowApi.createTransition(meta.id, { prev_status_id: d.from, next_status_id: to, is_transition: true });
      setTransitions((list) => [...list, t]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The transition could not be added.');
    }
  }

  // Arrows between boxes; a pair joined both ways bends apart so both stay visible.
  const edges = transitions.flatMap((t) => {
    const from = t.prev_status_id ? rects.get(t.prev_status_id) : startRect;
    const to = rects.get(t.next_status_id);
    if (!from || !to) return [];
    const fc = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
    const tc = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
    const both = transitions.some((o) => o.prev_status_id === t.next_status_id && o.next_status_id === t.prev_status_id);
    const len = Math.hypot(tc.x - fc.x, tc.y - fc.y) || 1;
    const normal = { x: -(tc.y - fc.y) / len, y: (tc.x - fc.x) / len };
    const bend = both ? 26 : 0;
    const mid = { x: (fc.x + tc.x) / 2 + normal.x * bend, y: (fc.y + tc.y) / 2 + normal.y * bend };
    const a = edgePoint(from, mid.x, mid.y);
    const b = edgePoint(to, mid.x, mid.y);
    const ctrl = { x: 2 * mid.x - (a.x + b.x) / 2, y: 2 * mid.y - (a.y + b.y) / 2 };
    return [{ t, d: `M ${a.x} ${a.y} Q ${ctrl.x} ${ctrl.y} ${b.x} ${b.y}`, mid }];
  });

  async function addStatus(input: { code: string; name: string; label_name: string | null; color: string | null; meta_id: number | null }) {
    const s = await workflowApi.createStatus(meta.id, input);
    const next = {
      start: layout.start ?? start,
      statuses: { ...Object.fromEntries(statuses.map((x, i) => [x.id, layout.statuses?.[x.id] ?? defaultSpot(i)])), [s.id]: defaultSpot(statuses.length) },
    };
    setStatuses((list) => [...list, s]);
    setLayout(next);
    saveLayout(next);
  }

  if (loading) return <div className="h-96 animate-pulse rounded-xl bg-primary ring-1 ring-secondary motion-reduce:animate-none" />;

  const forms = options.filter((o) => o.type === 'form');
  const grids = options.filter((o) => o.type === 'datagrid');
  const statusName = (id: number | null) => (id ? (statuses.find((s) => s.id === id)?.name ?? `#${id}`) : 'Start');

  return (
    <section aria-labelledby="workflow-heading" className="mb-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="workflow-heading" className="text-lg font-semibold text-primary">
            Workflow
          </h2>
          <p className="text-sm text-tertiary">
            Drag boxes to arrange them. Drag from a box’s dot onto another box to add a transition. Double-click a box or an arrow to edit it.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="text-xs text-tertiary">{saved === 'saving' ? 'Saving layout…' : 'Layout saved'}</span>}
          <Button size="sm" iconLeading={Plus} onPress={() => setEditingStatus('new')}>
            Add status
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      )}
      {!meta.table_name && (
        <div className="mb-3">
          <Alert>Set this workflow’s table (Edit at the top) to the table its records live in. That table needs a status_id column.</Alert>
        </div>
      )}

      <div
        ref={canvas}
        className="relative h-[30rem] overflow-auto rounded-xl bg-primary shadow-xs ring-1 ring-secondary select-none"
        style={{ backgroundImage: 'radial-gradient(var(--color-border-secondary) 1px, transparent 1px)', backgroundSize: '20px 20px' }}
      >
        <div className="relative" style={{ width: size.w, height: size.h }}>
          <svg className="pointer-events-none absolute inset-0" width={size.w} height={size.h} aria-hidden="true">
            <defs>
              <marker id="wf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0 10 5 0 10z" className="fill-fg-quaternary" />
              </marker>
              <marker id="wf-arrow-on" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0 10 5 0 10z" className="fill-fg-brand-primary" />
              </marker>
            </defs>
            {edges.map(({ t, d }) => (
              <g key={t.id}>
                <path
                  d={d}
                  fill="none"
                  strokeWidth={hovered === t.id ? 2.25 : 1.75}
                  strokeDasharray={t.is_transition ? undefined : '6 5'}
                  markerEnd={`url(#${hovered === t.id ? 'wf-arrow-on' : 'wf-arrow'})`}
                  className={hovered === t.id ? 'stroke-fg-brand-primary' : 'stroke-fg-quaternary'}
                />
                {/* A wide invisible stroke makes the arrow easy to hit. */}
                <path
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={14}
                  className="cursor-pointer"
                  style={{ pointerEvents: 'stroke' }}
                  onPointerEnter={() => setHovered(t.id)}
                  onPointerLeave={() => setHovered(null)}
                  onDoubleClick={() => setEditingTransition(t)}
                >
                  <title>{`${statusName(t.prev_status_id)} → ${statusName(t.next_status_id)}${t.criteria ? ` when ${t.criteria}` : ''}`}</title>
                </path>
              </g>
            ))}
            {drawing && (
              <line
                x1={drawing.from ? rects.get(drawing.from)!.x + NODE_W : start.x + START}
                y1={drawing.from ? rects.get(drawing.from)!.y + NODE_H / 2 : start.y + START / 2}
                x2={drawing.to.x}
                y2={drawing.to.y}
                strokeWidth={2}
                strokeDasharray="4 4"
                markerEnd="url(#wf-arrow-on)"
                className="stroke-fg-brand-primary"
              />
            )}
          </svg>

          {edges
            .filter(({ t }) => t.criteria)
            .map(({ t, mid }) => (
              <button
                key={`label-${t.id}`}
                type="button"
                onDoubleClick={() => setEditingTransition(t)}
                onPointerEnter={() => setHovered(t.id)}
                onPointerLeave={() => setHovered(null)}
                className="absolute max-w-44 -translate-x-1/2 -translate-y-1/2 truncate rounded-md bg-primary px-1.5 py-0.5 font-mono text-[11px] text-tertiary shadow-xs ring-1 ring-secondary"
                style={{ left: mid.x, top: mid.y }}
                title={t.criteria ?? undefined}
              >
                {t.criteria}
              </button>
            ))}

          {/* Start: records without a status leave from here. */}
          <div
            className="absolute flex cursor-grab items-center justify-center rounded-full bg-brand-solid text-[10px] font-semibold text-white shadow-sm active:cursor-grabbing"
            style={{ left: start.x, top: start.y, width: START, height: START, touchAction: 'none' }}
            onPointerDown={(e) => startDrag(e, 'start', start)}
            onPointerMove={onDragMove}
            onPointerUp={endDrag}
            title="Start: where records without a status begin"
          >
            Start
            <span
              role="button"
              aria-label="Draw a transition from Start"
              className="absolute top-1/2 -right-1.5 size-3 -translate-y-1/2 cursor-crosshair rounded-full bg-primary ring-2 ring-brand"
              style={{ touchAction: 'none' }}
              onPointerDown={(e) => startDrawing(e, null)}
              onPointerMove={(e) => setDrawing((d) => d && { ...d, to: point(e) })}
              onPointerUp={endDrawing}
            />
          </div>

          {statuses.map((s, i) => {
            const at = pos(s, i);
            const swatch = palette[(s.color ?? 'gray') as keyof typeof palette] ?? palette.gray;
            return (
              <div
                key={s.id}
                data-status-id={s.id}
                className={`absolute flex cursor-grab items-center overflow-hidden rounded-lg bg-primary shadow-sm ring-1 active:cursor-grabbing ${
                  drawing && drawing.from !== s.id ? 'ring-2 ring-brand' : 'ring-secondary'
                }`}
                style={{ left: at.x, top: at.y, width: NODE_W, height: NODE_H, touchAction: 'none' }}
                onPointerDown={(e) => startDrag(e, s.id, at)}
                onPointerMove={onDragMove}
                onPointerUp={endDrag}
                onDoubleClick={() => setEditingStatus(s)}
              >
                <span className={`h-full w-1.5 shrink-0 ${swatch.dot}`} aria-hidden="true" />
                <span className="min-w-0 flex-1 px-3">
                  <span className="block truncate text-sm font-semibold text-primary">{s.label_name || s.name}</span>
                  <span className="block truncate font-mono text-[11px] text-quaternary">
                    {s.code}
                    {s.meta_id ? ' · asks a form' : ''}
                  </span>
                </span>
                <span
                  role="button"
                  aria-label={`Draw a transition from ${s.name}`}
                  className="absolute top-1/2 right-1 size-3 -translate-y-1/2 cursor-crosshair rounded-full bg-primary ring-2 ring-fg-quaternary hover:ring-brand"
                  style={{ touchAction: 'none' }}
                  onPointerDown={(e) => startDrawing(e, s.id)}
                  onPointerMove={(e) => setDrawing((d) => d && { ...d, to: point(e) })}
                  onPointerUp={endDrawing}
                />
              </div>
            );
          })}

          {!statuses.length && (
            <p className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-sm text-tertiary">Add the first status to start drawing.</p>
          )}
        </div>
      </div>

      {editingStatus && (
        <StatusEditor
          status={editingStatus === 'new' ? null : editingStatus}
          forms={forms}
          onClose={() => setEditingStatus(null)}
          onSave={async (input) => {
            if (editingStatus === 'new') await addStatus(input);
            else {
              const s = await workflowApi.updateStatus(editingStatus.id, input);
              setStatuses((list) => list.map((x) => (x.id === s.id ? s : x)));
            }
            setEditingStatus(null);
          }}
          onDelete={async () => {
            if (editingStatus === 'new') return;
            await workflowApi.removeStatus(editingStatus.id);
            setEditingStatus(null);
            await load();
          }}
        />
      )}

      {editingTransition && (
        <TransitionEditor
          transition={editingTransition}
          statuses={statuses}
          transitions={transitions}
          grids={grids}
          statusName={statusName}
          onClose={() => setEditingTransition(null)}
          onSave={async (input) => {
            const t = await workflowApi.updateTransition(editingTransition.id, input);
            setTransitions((list) => list.map((x) => (x.id === t.id ? t : x)));
            setEditingTransition(null);
          }}
          onDelete={async () => {
            await workflowApi.removeTransition(editingTransition.id);
            setTransitions((list) => list.filter((x) => x.id !== editingTransition.id));
            setEditingTransition(null);
          }}
        />
      )}
    </section>
  );
}

/** Runs a save, sorting the API's answer into field errors or a general error. */
function useSave() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  async function run(save: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      await save();
    } catch (err) {
      if (err instanceof ApiError && err.errors) setFieldErrors(err.errors);
      else setError(err instanceof ApiError ? err.message : 'This could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, run, fe: (k: string) => fieldErrors[k]?.[0] };
}

function StatusEditor({
  status,
  forms,
  onClose,
  onSave,
  onDelete,
}: {
  status: WfmStatus | null;
  forms: MetaOption[];
  onClose: () => void;
  onSave: (input: { code: string; name: string; label_name: string | null; color: string | null; meta_id: number | null }) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [name, setName] = useState(status?.name ?? '');
  const [code, setCode] = useState(status?.code ?? '');
  const [label, setLabel] = useState(status?.label_name ?? '');
  const [color, setColor] = useState(status?.color ?? 'blue');
  const [formId, setFormId] = useState(status?.meta_id ? String(status.meta_id) : '');
  const [confirming, setConfirming] = useState(false);
  const save = useSave();
  const remove = useSave();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    save.run(() => onSave({ code: code.trim(), name: name.trim(), label_name: label || null, color, meta_id: formId ? Number(formId) : null }));
  }

  return (
    <>
      <Modal title={status ? `Edit ${status.name}` : 'Add a status'} onClose={onClose} size="md">
        <form onSubmit={onSubmit} className="space-y-5">
          {(save.error || remove.error) && <Alert>{save.error ?? remove.error}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Name"
              isRequired
              value={name}
              onChange={(v) => {
                setName(v);
                if (!status && (!code || code === toCode(name))) setCode(toCode(v));
              }}
              isInvalid={!!save.fe('name')}
              hint={save.fe('name')}
            />
            <Input label="Code" isRequired value={code} onChange={setCode} isInvalid={!!save.fe('code')} hint={save.fe('code') ?? 'Unique in this workflow.'} />
            <Input label="Display label" value={label} onChange={setLabel} hint="Shown to people instead of the name. Optional." />
            <div>
              <p className="mb-1.5 text-sm font-medium text-secondary">Colour</p>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={color === c}
                    aria-label={c}
                    onClick={() => setColor(c)}
                    className={`size-7 rounded-full ${palette[c as keyof typeof palette].dot} outline-focus-ring ring-offset-2 focus-visible:outline-2 ${color === c ? 'ring-2 ring-fg-primary' : ''}`}
                  />
                ))}
              </div>
            </div>
          </div>
          <NativeSelect
            label="Form on entering"
            value={formId}
            onChange={(e) => setFormId(e.target.value)}
            hint={save.fe('meta_id') ?? 'Opened for the record when it moves into this status, e.g. to ask why it was rejected. Saving it completes the move.'}
            options={[{ label: 'None: move straight away', value: '' }, ...forms.map((f) => ({ label: f.name, value: String(f.id) }))]}
          />
          <div className="flex items-center justify-between gap-3 border-t border-secondary pt-4">
            {status ? (
              <Button size="sm" color="tertiary-destructive" onPress={() => setConfirming(true)}>
                Delete status
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button size="sm" color="secondary" onPress={onClose}>
                Cancel
              </Button>
              <Button size="sm" type="submit" isLoading={save.busy} showTextWhileLoading>
                {status ? 'Save changes' : 'Add status'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>
      {confirming && status && (
        <ConfirmDialog
          title={`Delete ${status.name}?`}
          message="Its transitions go too. A status records have already been in stays, to keep their history."
          confirmLabel="Delete status"
          busy={remove.busy}
          onConfirm={() => remove.run(onDelete).then(() => setConfirming(false))}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}

function TransitionEditor({
  transition,
  statuses,
  transitions,
  grids,
  statusName,
  onClose,
  onSave,
  onDelete,
}: {
  transition: WfmTransition;
  statuses: WfmStatus[];
  transitions: WfmTransition[];
  grids: MetaOption[];
  statusName: (id: number | null) => string;
  onClose: () => void;
  onSave: (input: Partial<WfmTransition>) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [from, setFrom] = useState(transition.prev_status_id ? String(transition.prev_status_id) : '');
  const [to, setTo] = useState(String(transition.next_status_id));
  const [criteria, setCriteria] = useState(transition.criteria ?? '');
  const [usable, setUsable] = useState(transition.is_transition);
  const [source, setSource] = useState(transition.source_id ? String(transition.source_id) : '');
  const [prevId, setPrevId] = useState(transition.prev_id ? String(transition.prev_id) : '');
  const [nextId, setNextId] = useState(transition.next_id ? String(transition.next_id) : '');
  const save = useSave();
  const remove = useSave();

  const others = transitions
    .filter((t) => t.id !== transition.id)
    .map((t) => ({ label: `${statusName(t.prev_status_id)} → ${statusName(t.next_status_id)}`, value: String(t.id) }));
  const statusOptions = statuses.map((s) => ({ label: s.name, value: String(s.id) }));
  const num = (v: string) => (v ? Number(v) : null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    save.run(() =>
      onSave({
        prev_status_id: num(from),
        next_status_id: Number(to),
        criteria: criteria.trim() || null,
        is_transition: usable,
        source_id: num(source),
        prev_id: num(prevId),
        next_id: num(nextId),
      }),
    );
  }

  return (
    <Modal title={`${statusName(transition.prev_status_id)} → ${statusName(transition.next_status_id)}`} onClose={onClose} size="lg">
      <form onSubmit={onSubmit} className="space-y-5">
        {(save.error || remove.error) && <Alert>{save.error ?? remove.error}</Alert>}
        <Section title="Move">
          <div className="grid gap-4 sm:grid-cols-2">
            <NativeSelect label="From" value={from} onChange={(e) => setFrom(e.target.value)} hint={save.fe('prev_status_id')} options={[{ label: 'Start (no status yet)', value: '' }, ...statusOptions]} />
            <NativeSelect label="To" value={to} onChange={(e) => setTo(e.target.value)} hint={save.fe('next_status_id')} options={statusOptions} />
          </div>
          <TextArea
            label="Criteria"
            rows={2}
            value={criteria}
            onChange={setCriteria}
            textAreaClassName="font-mono text-sm"
            placeholder="totalAmount > 100000 && sessionUserId == createdUserId"
            isInvalid={!!save.fe('criteria')}
            hint={
              save.fe('criteria') ??
              'Only offered when this holds. Use the record’s fields (totalAmount or total_amount), sessionUserId, sessionUserName, sessionUserEmail, today, now; == != > < >= <=, && || !, + - * /. Empty: always.'
            }
          />
          <Toggle label="People can use it" hint="Off: only drawn in the diagram, as a dashed line." isSelected={usable} onChange={setUsable} />
        </Section>
        <Section title="Where and how it's drawn">
          <NativeSelect
            label="Offered in"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            hint="The grid this move shows in. Everywhere: every grid run by this workflow."
            options={[{ label: 'Everywhere', value: '' }, ...grids.map((g) => ({ label: g.name, value: String(g.id) }))]}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <NativeSelect label="Previous in the diagram" value={prevId} onChange={(e) => setPrevId(e.target.value)} options={[{ label: 'None', value: '' }, ...others]} />
            <NativeSelect label="Next in the diagram" value={nextId} onChange={(e) => setNextId(e.target.value)} options={[{ label: 'None', value: '' }, ...others]} />
          </div>
        </Section>
        <div className="flex items-center justify-between gap-3 border-t border-secondary pt-4">
          <Button size="sm" color="tertiary-destructive" isLoading={remove.busy} onPress={() => remove.run(onDelete)}>
            Delete transition
          </Button>
          <div className="flex gap-2">
            <Button size="sm" color="secondary" onPress={onClose}>
              Cancel
            </Button>
            <Button size="sm" type="submit" isLoading={save.busy} showTextWhileLoading>
              Save changes
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

/** "Pending approval" -> "pending_approval". */
function toCode(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
