import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Plus, Trash01, Zap } from '@untitledui/icons';
import { ApiError } from '../../lib/api';
import type { Meta, MetaOption } from '../../lib/metaApi';
import { processFlowApi, type ConditionOp, type ProcessCondition, type ProcessFlow, type ProcessPort, type ProcessPorts } from '../../lib/processFlowApi';
import { Alert, IconAction } from '../../components/ui';
import { Modal } from '../../components/Modal';
import { TypeIcon } from '../../components/TypeIcon';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { NativeSelect } from '@/components/base/select/select-native';
import { t, tLabels } from '@/i18n';

const OPS: { value: ConditionOp; label: string }[] = [
  { value: '=', label: 'is' },
  { value: '!=', label: 'is not' },
  { value: '>', label: '>' },
  { value: '<', label: '<' },
  { value: '>=', label: '≥' },
  { value: '<=', label: '≤' },
  { value: 'contains', label: 'contains' },
  { value: 'empty', label: 'is empty' },
  { value: 'not_empty', label: 'is not empty' },
];

/** The kinds of meta a step can be (backend: ProcessFlow::STEP_TYPES). */
const STEP_TYPES: Record<string, string> = { form: 'Form', stage_query: 'Stage query', get: 'Get' };

const NODE_W = 260;
const HEAD = 44;
const ROW = 26;
/** The main form's node. Step keys never take this name. */
const MAIN = 'main';
/** A value's source when it is fixed text rather than another node's output. */
const FIXED = '=';

type Spot = { x: number; y: number };

/** One input of a step and where its value comes from: MAIN, a step's key, or FIXED (field is then the text). */
interface Mapping {
  target: string;
  from: string;
  field: string;
}

interface StepDraft {
  key: string;
  process_id: string;
  at: Spot;
  values: Mapping[];
}

interface TransitionDraft {
  key: string;
  /** '' means the main form. */
  source: string;
  target: string;
  criteria: ProcessCondition[];
}

/** A line being dragged out: a transition from a node, or a value from one of its outputs. */
type Drawing = { kind: 'flow'; from: string; start: Spot; to: Spot } | { kind: 'value'; from: string; field: string; start: Spot; to: Spot };

let keySeq = 0;
const newKey = () => `n${++keySeq}`;

const stepSpot = (i: number): Spot => ({ x: 24 + (i + 1) * 400, y: 24 + (i % 2) * 48 });

/** A left-to-right curve between two points, and its middle. */
function curve(a: Spot, b: Spot): { d: string; mid: Spot } {
  const dx = Math.max(40, Math.abs(b.x - a.x) / 2);
  const c1 = { x: a.x + dx, y: a.y };
  const c2 = { x: b.x - dx, y: b.y };
  return {
    d: `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`,
    mid: { x: (a.x + 3 * c1.x + 3 * c2.x + b.x) / 8, y: (a.y + 3 * c1.y + 3 * c2.y + b.y) / 8 },
  };
}

/** The saved flow as the canvas edits it: a value's source_path becomes the node it comes from. */
function toDrafts(flow: ProcessFlow): { main: Spot; steps: StepDraft[]; transitions: TransitionDraft[] } {
  const key = (id: number) => `s${id}`;
  const byOrder = new Map(flow.steps.map((s, i) => [s.order_number ?? i, key(s.id)]));
  const transitions = flow.transitions.map((item) => ({ key: `t${item.id}`, source: item.source_id ? key(item.source_id) : '', target: key(item.target_id), criteria: item.criteria ?? [] }));
  const steps = flow.steps.map((s, i) => {
    // A bare field is the record of whatever led to this step: its first transition's source, else the main form.
    const ledBy = transitions.find((item) => item.target === key(s.id))?.source || MAIN;
    const values = s.behaviours.map(({ source_path, target_path }): Mapping => {
      const path = source_path.trim();
      const fromStep = /^step(\d+)\.(.+)$/.exec(path);
      if (path.startsWith(FIXED)) return { target: target_path, from: FIXED, field: path.slice(1) };
      if (path.startsWith('main.')) return { target: target_path, from: MAIN, field: path.slice(5) };
      if (fromStep) return { target: target_path, from: byOrder.get(Number(fromStep[1])) ?? MAIN, field: fromStep[2] };
      return { target: target_path, from: ledBy, field: path };
    });
    return { key: key(s.id), process_id: String(s.process_id), at: s.pos_x != null && s.pos_y != null ? { x: s.pos_x, y: s.pos_y } : stepSpot(i), values };
  });
  return { main: flow.main_at ?? { x: 24, y: 24 }, steps, transitions };
}

/**
 * A form's process flow as a canvas (backend: ProcessFlowController). The form is the first
 * node; each step is a form that saves a record, a stage query that runs, or a get that reads
 * one. A node takes values in on its left and passes values on from its right. Arrows between
 * nodes are transitions: a step runs after the node it comes from, only when its conditions
 * hold. A step with no arrow into it runs right after the form saves.
 */
export function ProcessFlowPanel({ meta, options }: { meta: Meta; options: MetaOption[] }) {
  const choices = useMemo(() => options.filter((o) => o.type && o.type in STEP_TYPES && o.id !== meta.id), [options, meta.id]);
  const optionOf = useMemo(() => new Map(options.map((o) => [String(o.id), o])), [options]);

  const [main, setMain] = useState<Spot>({ x: 24, y: 24 });
  const [steps, setSteps] = useState<StepDraft[] | null>(null);
  const [transitions, setTransitions] = useState<TransitionDraft[]>([]);
  const [ports, setPorts] = useState<ProcessPorts>({});
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState(false);

  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{ node: string; dx: number; dy: number; moved: boolean } | null>(null);
  const [drawing, setDrawing] = useState<Drawing | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const [editingStep, setEditingStep] = useState<StepDraft | 'new' | null>(null);
  const [editingTransition, setEditingTransition] = useState<TransitionDraft | null>(null);
  const [editingValue, setEditingValue] = useState<{ step: string; target: string } | null>(null);

  function load(flow: ProcessFlow) {
    const drafts = toDrafts(flow);
    setMain(drafts.main);
    setSteps(drafts.steps);
    setTransitions(drafts.transitions);
    setDirty(false);
  }

  useEffect(() => {
    processFlowApi.get(meta.id).then(load, (err) => setError(err instanceof ApiError ? err.message : t('The process flow could not be loaded.')));
  }, [meta.id]);

  // What each node takes in and passes on, fetched for metas not asked about yet.
  const missing = useMemo(
    () => [...new Set([String(meta.id), ...(steps ?? []).map((s) => s.process_id).filter(Boolean)])].filter((id) => !ports[id]).join(','),
    [meta.id, steps, ports],
  );
  useEffect(() => {
    if (!missing) return;
    processFlowApi.ports(meta.id, missing.split(',').map(Number)).then((p) => setPorts((prev) => ({ ...prev, ...p })), () => undefined);
  }, [meta.id, missing]);

  if (error && !steps) return <Alert>{error}</Alert>;
  if (!steps) return <div className="h-96 animate-pulse rounded-xl bg-primary ring-1 ring-secondary motion-reduce:animate-none" />;

  const touch = () => {
    setDirty(true);
    setSavedNote(false);
  };
  const stepByKey = new Map(steps.map((s) => [s.key, s]));
  const nodeName = (node: string) => (node === MAIN ? meta.name : (optionOf.get(stepByKey.get(node)?.process_id ?? '')?.name ?? t('Pick a step')));

  // A step's inputs, plus any it is given a value for that its meta no longer lists.
  const inputsOf = (s: StepDraft): ProcessPort[] => {
    const listed = ports[s.process_id]?.inputs ?? [];
    return [...listed, ...s.values.filter((v) => !listed.some((p) => p.field === v.target)).map((v) => ({ field: v.target, label: v.target }))];
  };
  const outputsOf = (node: string): ProcessPort[] => ports[node === MAIN ? String(meta.id) : (stepByKey.get(node)?.process_id ?? '')]?.outputs ?? [];
  const spotOf = (node: string): Spot => (node === MAIN ? main : (stepByKey.get(node)?.at ?? main));
  const rowsOf = (node: string) => Math.max(1, node === MAIN ? outputsOf(MAIN).length : Math.max(inputsOf(stepByKey.get(node)!).length, outputsOf(node).length));
  const outAt = (node: string, field: string): Spot => {
    const s = spotOf(node);
    return { x: s.x + NODE_W, y: s.y + HEAD + Math.max(0, outputsOf(node).findIndex((p) => p.field === field)) * ROW + ROW / 2 };
  };
  const inAt = (node: string, field: string): Spot => {
    const s = spotOf(node);
    return { x: s.x, y: s.y + HEAD + Math.max(0, inputsOf(stepByKey.get(node)!).findIndex((p) => p.field === field)) * ROW + ROW / 2 };
  };
  const flowOut = (node: string): Spot => ({ x: spotOf(node).x + NODE_W, y: spotOf(node).y + HEAD / 2 });
  const flowIn = (node: string): Spot => ({ x: spotOf(node).x, y: spotOf(node).y + HEAD / 2 });

  const nodes = [MAIN, ...steps.map((s) => s.key)];
  const size = {
    w: Math.max(960, ...nodes.map((n) => spotOf(n).x + NODE_W + 80)),
    h: Math.max(520, ...nodes.map((n) => spotOf(n).y + HEAD + rowsOf(n) * ROW + 88)),
  };

  /** Pointer position inside the canvas, scroll included. */
  function point(e: { clientX: number; clientY: number }): Spot {
    const el = canvas.current!;
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left + el.scrollLeft, y: e.clientY - r.top + el.scrollTop };
  }

  function startMove(e: ReactPointerEvent, node: string) {
    if (e.button !== 0) return;
    const p = point(e);
    const s = spotOf(node);
    drag.current = { node, dx: p.x - s.x, dy: p.y - s.y, moved: false };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }

  function onMove(e: ReactPointerEvent) {
    const d = drag.current;
    if (!d) return;
    const p = point(e);
    const at = { x: Math.max(0, Math.round(p.x - d.dx)), y: Math.max(0, Math.round(p.y - d.dy)) };
    d.moved = true;
    if (d.node === MAIN) setMain(at);
    else setSteps((list) => list!.map((s) => (s.key === d.node ? { ...s, at } : s)));
  }

  function endMove() {
    if (drag.current?.moved) touch();
    drag.current = null;
  }

  function startDraw(e: ReactPointerEvent, d: Drawing) {
    if (e.button !== 0) return;
    e.stopPropagation();
    setDrawing(d);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }

  const onDrawMove = (e: ReactPointerEvent) => setDrawing((d) => d && { ...d, to: point(e) });

  function endDraw(e: ReactPointerEvent) {
    const d = drawing;
    setDrawing(null);
    if (!d) return;
    const under = document.elementFromPoint(e.clientX, e.clientY);
    if (d.kind === 'flow') {
      const target = under?.closest('[data-node]')?.getAttribute('data-node');
      if (target && target !== MAIN && target !== d.from) connect(d.from, target);
      return;
    }
    const port = under?.closest('[data-in]')?.getAttribute('data-in');
    if (!port) return;
    const cut = port.indexOf('|');
    const node = port.slice(0, cut);
    if (node !== d.from) mapValue(node, port.slice(cut + 1), d.from, d.field);
  }

  function connect(from: string, to: string) {
    const source = from === MAIN ? '' : from;
    if (transitions.some((item) => item.source === source && item.target === to)) return;
    setTransitions((list) => [...list, { key: newKey(), source, target: to, criteria: [] }]);
    touch();
  }

  /** Gives a step's input a value from another node's output; a step that waits on nothing yet now waits on that node. */
  function mapValue(stepKey: string, target: string, from: string, field: string) {
    setSteps((list) => list!.map((s) => (s.key === stepKey ? { ...s, values: [...s.values.filter((v) => v.target !== target), { target, from, field }] } : s)));
    if (from !== MAIN && !transitions.some((item) => item.target === stepKey)) connect(from, stepKey);
    touch();
  }

  function setValue(stepKey: string, target: string, value: Mapping | null) {
    setSteps((list) => list!.map((s) => (s.key === stepKey ? { ...s, values: [...s.values.filter((v) => v.target !== target), ...(value ? [value] : [])] } : s)));
    touch();
  }

  function removeStep(key: string) {
    setSteps((list) => list!.filter((s) => s.key !== key).map((s) => ({ ...s, values: s.values.filter((v) => v.from !== key) })));
    setTransitions((list) => list.filter((item) => item.source !== key && item.target !== key));
    touch();
  }

  /** A step now runs another meta: what went into it and what it passed on no longer fit. */
  function changeStep(key: string, processId: string) {
    setSteps((list) =>
      list!.map((s) => (s.key === key ? { ...s, process_id: processId, values: [] } : { ...s, values: s.values.filter((v) => v.from !== key) })),
    );
    touch();
  }

  function addStep(processId: string) {
    const right = Math.max(...nodes.map((n) => spotOf(n).x + NODE_W));
    setSteps((list) => [...list!, { key: newKey(), process_id: processId, at: { x: right + 140, y: main.y }, values: [] }]);
    touch();
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      load(
        await processFlowApi.save(meta.id, {
          main_at: main,
          steps: steps!.map((s) => ({
            key: s.key,
            process_id: Number(s.process_id),
            x: s.at.x,
            y: s.at.y,
            behaviours: s.values
              .filter((v) => v.from === FIXED || v.field)
              .map((v) => ({ target_path: v.target, source_path: v.from === FIXED ? `=${v.field}` : v.from === MAIN ? `main.${v.field}` : `step:${v.from}.${v.field}` })),
          })),
          transitions: transitions.map((item) => ({ source: item.source || null, target: item.target, criteria: item.criteria.filter((c) => c.field.trim()) })),
        }),
      );
      setSavedNote(true);
    } catch (err) {
      if (err instanceof ApiError && err.errors) setError(Object.values(err.errors)[0]?.[0] ?? err.message);
      else setError(err instanceof ApiError ? err.message : t('The process flow could not be saved.'));
    } finally {
      setSaving(false);
    }
  }

  const flows = transitions.map((item) => ({ item, ...curve(flowOut(item.source || MAIN), flowIn(item.target)) }));
  const starters = steps.filter((s) => !transitions.some((item) => item.target === s.key));
  const lines = steps.flatMap((s) =>
    s.values
      .filter((v) => v.from === MAIN || stepByKey.has(v.from))
      .map((v) => ({ id: `${s.key}|${v.target}`, step: s.key, target: v.target, title: `${nodeName(v.from)} · ${v.field} → ${nodeName(s.key)} · ${v.target}`, ...curve(outAt(v.from, v.field), inAt(s.key, v.target)) })),
  );
  const criteriaText = (item: TransitionDraft) =>
    item.criteria
      .filter((c) => c.field)
      .map((c) => `${c.field} ${t(OPS.find((o) => o.value === c.op)?.label ?? c.op)}${c.op === 'empty' || c.op === 'not_empty' ? '' : ` ${c.value}`}`)
      .join(t(' and '));

  function renderNode(node: string) {
    const isMain = node === MAIN;
    const step = isMain ? null : stepByKey.get(node)!;
    const option = step ? optionOf.get(step.process_id) : undefined;
    const at = spotOf(node);
    const inputs = step ? inputsOf(step) : [];
    const outputs = outputsOf(node);
    const rows = Math.max(inputs.length, outputs.length);
    const known = !!ports[isMain ? String(meta.id) : (step?.process_id ?? '')];
    const flowTarget = drawing?.kind === 'flow' && !isMain && drawing.from !== node;
    const valueTarget = drawing?.kind === 'value' && !isMain && drawing.from !== node;
    return (
      <div
        key={node}
        data-node={node}
        className={`absolute rounded-xl bg-primary pb-2 shadow-sm ring-1 ${flowTarget ? 'ring-2 ring-brand' : 'ring-secondary'}`}
        style={{ left: at.x, top: at.y, width: NODE_W }}
      >
        <div
          className="relative flex cursor-grab items-center gap-2 border-b border-secondary px-3 active:cursor-grabbing"
          style={{ height: HEAD, touchAction: 'none' }}
          onPointerDown={(e) => startMove(e, node)}
          onPointerMove={onMove}
          onPointerUp={endMove}
          onDoubleClick={() => step && setEditingStep(step)}
          title={isMain ? undefined : t('Double-click to change or remove this step')}
        >
          <TypeIcon code={isMain ? 'form' : option?.type} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-primary">{nodeName(node)}</span>
            <span className="block truncate text-[11px] text-quaternary">
              {isMain ? t('Saved by people') : option?.type ? t(STEP_TYPES[option.type] ?? option.type) : t('Double-click to pick')}
            </span>
          </span>
          {!isMain && <span className="absolute top-1/2 -left-1.5 size-3 -translate-y-1/2 rounded-full bg-fg-quaternary ring-2 ring-bg-primary" aria-hidden="true" />}
          <span
            role="button"
            aria-label={t('Draw a transition from {name}', { name: nodeName(node) })}
            className="absolute top-1/2 -right-1.5 size-3 -translate-y-1/2 cursor-crosshair rounded-full bg-primary ring-2 ring-fg-brand-primary hover:bg-brand-solid"
            style={{ touchAction: 'none' }}
            onPointerDown={(e) => startDraw(e, { kind: 'flow', from: node, start: flowOut(node), to: point(e) })}
            onPointerMove={onDrawMove}
            onPointerUp={endDraw}
          />
        </div>

        {rows === 0 && (
          <p className="px-3 text-xs text-quaternary" style={{ lineHeight: `${ROW}px` }}>
            {!known ? t('Loading…') : isMain ? t('No fields') : step?.process_id ? t('Takes and passes nothing') : t('Double-click to pick')}
          </p>
        )}
        {Array.from({ length: rows }, (_, i) => {
          const input = inputs[i];
          const output = outputs[i];
          const value = input && step ? step.values.find((v) => v.target === input.field) : undefined;
          return (
            <div key={i} className="grid grid-cols-2 text-xs" style={{ height: ROW }}>
              {input ? (
                <div
                  data-in={`${node}|${input.field}`}
                  className={`relative flex min-w-0 items-center gap-1 pr-1 pl-3 ${valueTarget ? 'cursor-copy rounded-r-md bg-brand-primary' : 'cursor-pointer hover:bg-primary_hover'}`}
                  onDoubleClick={() => setEditingValue({ step: node, target: input.field })}
                  title={`${input.field}${value ? ` ← ${value.from === FIXED ? `=${value.field}` : `${nodeName(value.from)} · ${value.field}`}` : ''}\n${t('Double-click to set a fixed value or clear it')}`}
                >
                  <span className={`absolute top-1/2 -left-1.5 size-3 -translate-y-1/2 rounded-full ring-2 ${value ? 'bg-brand-solid ring-bg-primary' : 'bg-primary ring-fg-quaternary'}`} aria-hidden="true" />
                  <span className="truncate text-secondary">{input.label}</span>
                  {value?.from === FIXED && <span className="max-w-20 shrink-0 truncate rounded bg-secondary px-1 font-mono text-[10px] text-tertiary">={value.field}</span>}
                </div>
              ) : (
                <span />
              )}
              {output ? (
                <div className="relative flex min-w-0 items-center justify-end pr-3 pl-1" title={output.field}>
                  <span className="truncate text-tertiary">{output.label}</span>
                  <span
                    role="button"
                    aria-label={t('Pass on {field} from {name}', { field: output.label, name: nodeName(node) })}
                    className="absolute top-1/2 -right-1.5 size-3 -translate-y-1/2 cursor-crosshair rounded-full bg-primary ring-2 ring-fg-quaternary hover:ring-fg-brand-primary"
                    style={{ touchAction: 'none' }}
                    onPointerDown={(e) => startDraw(e, { kind: 'value', from: node, field: output.field, start: outAt(node, output.field), to: point(e) })}
                    onPointerMove={onDrawMove}
                    onPointerUp={endDraw}
                  />
                </div>
              ) : (
                <span />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  const editingValueStep = editingValue ? stepByKey.get(editingValue.step) : undefined;

  return (
    <section className="rounded-xl bg-primary shadow-xs ring-1 ring-secondary" aria-labelledby="process-flow-title">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-secondary px-4 py-4 sm:px-5">
        <div>
          <h2 id="process-flow-title" className="flex items-center gap-2 text-md font-semibold text-primary">
            <Zap className="size-5 text-fg-brand-primary" aria-hidden="true" />
            {t('Process flow')}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-tertiary">
            {t('When {name} saves a new record, these forms save one too, these stage queries run and these gets read a record, in the same go. If any of them refuses, nothing is saved.', { name: meta.name })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {savedNote && <span className="text-sm text-success-primary">{t('Saved.')}</span>}
          <Button size="sm" color="secondary" iconLeading={Plus} onPress={() => setEditingStep('new')}>
            {t('Add a step')}
          </Button>
          <Button size="sm" isDisabled={!dirty || steps.some((s) => !s.process_id)} isLoading={saving} showTextWhileLoading onPress={save}>
            {t('Save flow')}
          </Button>
        </div>
      </div>

      <div className="space-y-3 px-4 py-4 sm:px-5">
        {error && <Alert>{error}</Alert>}
        <p className="text-xs text-tertiary">
          {t('Drag a node by its title. Drag from the blue dot on its title onto another node to run that one after it. Drag from a value on the right of a node onto a value on the left of another to pass it on. Double-click a node, an arrow, an input or a value line to change it.')}
        </p>

        <div
          ref={canvas}
          className="relative h-[36rem] overflow-auto rounded-xl bg-secondary_alt ring-1 ring-secondary select-none"
          style={{ backgroundImage: 'radial-gradient(var(--color-border-secondary) 1px, transparent 1px)', backgroundSize: '20px 20px' }}
        >
          <div className="relative" style={{ width: size.w, height: size.h }}>
            <svg className="pointer-events-none absolute inset-0" width={size.w} height={size.h} aria-hidden="true">
              <defs>
                <marker id="pf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0 0 10 5 0 10z" className="fill-fg-quaternary" />
                </marker>
                <marker id="pf-arrow-on" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0 0 10 5 0 10z" className="fill-fg-brand-primary" />
                </marker>
              </defs>

              {/* Steps nothing leads to run right after the form saves. */}
              {starters.map((s) => (
                <path key={`start-${s.key}`} d={curve(flowOut(MAIN), flowIn(s.key)).d} fill="none" strokeWidth={1.5} strokeDasharray="5 5" markerEnd="url(#pf-arrow)" className="stroke-fg-quaternary/60" />
              ))}

              {lines.map((line) => (
                <g key={line.id}>
                  <path d={line.d} fill="none" strokeWidth={hovered === line.id ? 2.25 : 1.5} className={hovered === line.id ? 'stroke-fg-brand-primary' : 'stroke-fg-brand-secondary/70'} />
                  <path
                    d={line.d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={12}
                    className="cursor-pointer"
                    style={{ pointerEvents: 'stroke' }}
                    onPointerEnter={() => setHovered(line.id)}
                    onPointerLeave={() => setHovered(null)}
                    onDoubleClick={() => setValue(line.step, line.target, null)}
                  >
                    <title>{`${line.title}\n${t('Double-click to remove')}`}</title>
                  </path>
                </g>
              ))}

              {flows.map(({ item, d }) => (
                <g key={item.key}>
                  <path d={d} fill="none" strokeWidth={hovered === item.key ? 2.75 : 2.25} markerEnd={`url(#${hovered === item.key ? 'pf-arrow-on' : 'pf-arrow'})`} className={hovered === item.key ? 'stroke-fg-brand-primary' : 'stroke-fg-quaternary'} />
                  <path
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={14}
                    className="cursor-pointer"
                    style={{ pointerEvents: 'stroke' }}
                    onPointerEnter={() => setHovered(item.key)}
                    onPointerLeave={() => setHovered(null)}
                    onDoubleClick={() => setEditingTransition(item)}
                  >
                    <title>{`${nodeName(item.source || MAIN)} → ${nodeName(item.target)}${item.criteria.length ? ` · ${criteriaText(item)}` : ''}`}</title>
                  </path>
                </g>
              ))}

              {drawing && (
                <path d={curve(drawing.start, drawing.to).d} fill="none" strokeWidth={2} strokeDasharray="4 4" markerEnd={drawing.kind === 'flow' ? 'url(#pf-arrow-on)' : undefined} className="stroke-fg-brand-primary" />
              )}
            </svg>

            {flows.map(({ item, mid }) => (
              <button
                key={`label-${item.key}`}
                type="button"
                onDoubleClick={() => setEditingTransition(item)}
                onPointerEnter={() => setHovered(item.key)}
                onPointerLeave={() => setHovered(null)}
                className={`absolute z-10 max-w-48 -translate-x-1/2 -translate-y-1/2 truncate rounded-md px-1.5 py-0.5 text-[11px] shadow-xs ring-1 ${
                  item.criteria.length ? 'bg-primary font-mono text-tertiary ring-secondary' : 'bg-primary text-quaternary ring-secondary'
                }`}
                style={{ left: mid.x, top: mid.y }}
                title={t('Double-click to set conditions')}
              >
                {item.criteria.length ? criteriaText(item) : t('always')}
              </button>
            ))}

            {nodes.map(renderNode)}

            {!steps.length && (
              <p className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-sm text-tertiary">{t('Add a step to start building the flow.')}</p>
            )}
          </div>
        </div>
      </div>

      {editingStep && (
        <StepEditor
          step={editingStep === 'new' ? null : editingStep}
          choices={choices}
          onClose={() => setEditingStep(null)}
          onSave={(processId) => {
            if (editingStep === 'new') addStep(processId);
            else if (processId !== editingStep.process_id) changeStep(editingStep.key, processId);
            setEditingStep(null);
          }}
          onDelete={() => {
            if (editingStep !== 'new') removeStep(editingStep.key);
            setEditingStep(null);
          }}
        />
      )}

      {editingTransition && (
        <TransitionEditor
          title={`${nodeName(editingTransition.source || MAIN)} → ${nodeName(editingTransition.target)}`}
          transition={editingTransition}
          fields={outputsOf(editingTransition.source || MAIN)}
          onClose={() => setEditingTransition(null)}
          onSave={(criteria) => {
            setTransitions((list) => list.map((item) => (item.key === editingTransition.key ? { ...item, criteria } : item)));
            touch();
            setEditingTransition(null);
          }}
          onDelete={() => {
            setTransitions((list) => list.filter((item) => item.key !== editingTransition.key));
            touch();
            setEditingTransition(null);
          }}
        />
      )}

      {editingValue && editingValueStep && (
        <ValueEditor
          title={`${nodeName(editingValue.step)} · ${editingValue.target}`}
          value={editingValueStep.values.find((v) => v.target === editingValue.target)}
          describe={(v) => `${nodeName(v.from)} · ${v.field}`}
          onClose={() => setEditingValue(null)}
          onSave={(text) => {
            setValue(editingValue.step, editingValue.target, text === null ? null : { target: editingValue.target, from: FIXED, field: text });
            setEditingValue(null);
          }}
        />
      )}
    </section>
  );
}

function StepEditor({ step, choices, onClose, onSave, onDelete }: { step: StepDraft | null; choices: MetaOption[]; onClose: () => void; onSave: (processId: string) => void; onDelete: () => void }) {
  const [processId, setProcessId] = useState(step?.process_id ?? '');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (processId) onSave(processId);
  }

  return (
    <Modal title={step ? t('Change step') : t('Add a step')} onClose={onClose} size="md">
      <form onSubmit={onSubmit} className="space-y-5">
        <NativeSelect
          label={t('Form, stage query or get')}
          value={processId}
          onChange={(e) => setProcessId(e.target.value)}
          hint={step ? t('Picking another one clears the values going into it and coming out of it.') : t('A form saves a record, a stage query runs, a get reads a record whose values later steps can use.')}
          options={[
            { value: '', label: t('Pick one…') },
            ...choices.map((c) => ({ value: String(c.id), label: `${c.name} (${t(STEP_TYPES[c.type ?? ''] ?? c.type ?? '')})` })),
          ]}
        />
        <div className="flex items-center justify-between gap-3 border-t border-secondary pt-4">
          {step ? (
            <Button size="sm" color="tertiary-destructive" onPress={onDelete}>
              {t('Remove step')}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button size="sm" color="secondary" onPress={onClose}>
              {t('Cancel')}
            </Button>
            <Button size="sm" type="submit" isDisabled={!processId}>
              {step ? t('Done') : t('Add step')}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function TransitionEditor({
  title,
  transition,
  fields,
  onClose,
  onSave,
  onDelete,
}: {
  title: string;
  transition: TransitionDraft;
  fields: ProcessPort[];
  onClose: () => void;
  onSave: (criteria: ProcessCondition[]) => void;
  onDelete: () => void;
}) {
  const [criteria, setCriteria] = useState<ProcessCondition[]>(transition.criteria);
  const update = (j: number, patch: Partial<ProcessCondition>) => setCriteria((list) => list.map((c, k) => (k === j ? { ...c, ...patch } : c)));

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    onSave(criteria.filter((c) => c.field.trim()));
  }

  return (
    <Modal title={title} description={t('The next step runs only when all of these hold for what the step before it passed on. No conditions: it always runs.')} onClose={onClose} size="lg">
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="space-y-2">
          {criteria.length === 0 && <p className="text-sm text-tertiary">{t('No conditions: it always runs.')}</p>}
          {criteria.map((c, j) => (
            <div key={j} className="grid items-center gap-2 sm:grid-cols-[3rem_1fr_9rem_1fr_auto]">
              <span className="text-sm text-tertiary">{j === 0 ? t('When') : t('and')}</span>
              <NativeSelect
                aria-label={t('Field')}
                value={c.field}
                onChange={(e) => update(j, { field: e.target.value })}
                options={[{ value: '', label: t('Field…') }, ...[...fields, ...(c.field && !fields.some((f) => f.field === c.field) ? [{ field: c.field, label: c.field }] : [])].map((f) => ({ value: f.field, label: f.label }))]}
              />
              <NativeSelect aria-label={t('Condition')} value={c.op} onChange={(e) => update(j, { op: e.target.value as ConditionOp })} options={tLabels(OPS)} />
              {c.op === 'empty' || c.op === 'not_empty' ? <span /> : <Input aria-label={t('Value')} value={c.value} onChange={(v) => update(j, { value: v })} />}
              <IconAction icon={Trash01} danger label={t('Remove this condition')} onPress={() => setCriteria((list) => list.filter((_, k) => k !== j))} />
            </div>
          ))}
          <Button size="sm" color="link-color" iconLeading={Plus} onPress={() => setCriteria((list) => [...list, { field: '', op: '=', value: '' }])}>
            {t('Add a condition')}
          </Button>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-secondary pt-4">
          <Button size="sm" color="tertiary-destructive" onPress={onDelete}>
            {t('Delete transition')}
          </Button>
          <div className="flex gap-2">
            <Button size="sm" color="secondary" onPress={onClose}>
              {t('Cancel')}
            </Button>
            <Button size="sm" type="submit">
              {t('Done')}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function ValueEditor({
  title,
  value,
  describe,
  onClose,
  onSave,
}: {
  title: string;
  value: Mapping | undefined;
  describe: (value: Mapping) => string;
  onClose: () => void;
  /** Fixed text, or null to clear the value. */
  onSave: (text: string | null) => void;
}) {
  const [text, setText] = useState(value?.from === FIXED ? value.field : '');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    onSave(text);
  }

  return (
    <Modal title={title} onClose={onClose} size="md">
      <form onSubmit={onSubmit} className="space-y-5">
        <p className="text-sm text-tertiary">
          {!value ? t('Nothing goes in yet: it starts empty (or at its default).') : value.from === FIXED ? t('It gets a fixed value.') : t('It gets {source}.', { source: describe(value) })}
        </p>
        <Input label={t('Fixed value')} value={text} onChange={setText} hint={t('Saving a fixed value replaces a line coming into it. To take a value from another node instead, drag a line onto it.')} />
        <div className="flex items-center justify-between gap-3 border-t border-secondary pt-4">
          {value ? (
            <Button size="sm" color="tertiary-destructive" onPress={() => onSave(null)}>
              {t('Clear')}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button size="sm" color="secondary" onPress={onClose}>
              {t('Cancel')}
            </Button>
            <Button size="sm" type="submit">
              {t('Save fixed value')}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
