import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowRight, Plus, Trash01, Zap } from '@untitledui/icons';
import { ApiError } from '../../lib/api';
import { metaApi, type Meta, type MetaOption, type MetaParam } from '../../lib/metaApi';
import { processFlowApi, type ConditionOp, type ProcessBehaviour, type ProcessCondition, type ProcessFlow } from '../../lib/processFlowApi';
import { Alert, IconAction } from '../../components/ui';
import { Badge } from '@/components/base/badges/badges';
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

interface StepDraft {
  key: string;
  process_id: string;
  behaviours: ProcessBehaviour[];
}

interface TransitionDraft {
  /** '' means the main form. */
  source: string;
  target: string;
  criteria: ProcessCondition[];
}

let keySeq = 0;
const newKey = () => `new-${++keySeq}`;

function toDrafts(flow: ProcessFlow): { steps: StepDraft[]; transitions: TransitionDraft[] } {
  const key = (id: number) => `s${id}`;
  return {
    steps: flow.steps.map((s) => ({ key: key(s.id), process_id: String(s.process_id), behaviours: s.behaviours.map(({ source_path, target_path }) => ({ source_path, target_path })) })),
    transitions: flow.transitions.map((item) => ({ source: item.source_id ? key(item.source_id) : '', target: key(item.target_id), criteria: item.criteria ?? [] })),
  };
}

/** The fields a form fills in: not its key and not detail lines. A stage query's are all its parameters. */
const fillable = (params: MetaParam[], isQuery = false) =>
  isQuery ? params : params.filter((p) => !p.is_primary && p.field_path !== 'id' && !['detail', 'subgrid'].includes(p.data_type));

/**
 * A form's process flow: the forms that save a record of their own (or stage queries that
 * run) when this one saves a new record, and where their values come from (backend:
 * ProcessFlowController). A stage query passes on its values plus affected (rows changed).
 */
export function ProcessFlowPanel({ meta, options }: { meta: Meta; options: MetaOption[] }) {
  const forms = useMemo(() => options.filter((o) => (o.type === 'form' || o.type === 'stage_query') && o.id !== meta.id), [options, meta.id]);
  const queries = useMemo(() => new Set(options.filter((o) => o.type === 'stage_query').map((o) => String(o.id))), [options]);
  const formName = useMemo(() => new Map(options.map((o) => [String(o.id), o.name])), [options]);

  const [steps, setSteps] = useState<StepDraft[] | null>(null);
  const [transitions, setTransitions] = useState<TransitionDraft[]>([]);
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState(false);

  function load(flow: ProcessFlow) {
    const drafts = toDrafts(flow);
    setSteps(drafts.steps);
    setTransitions(drafts.transitions);
    setDirty(false);
  }

  useEffect(() => {
    processFlowApi.get(meta.id).then(load, (err) => setError(err instanceof ApiError ? err.message : t("The process flow could not be loaded.")));
    metaApi.params(meta.id).then((p) => setFields((f) => ({ ...f, [String(meta.id)]: fillable(p).map((x) => x.field_path) })), () => undefined);
  }, [meta.id]);

  // Each step form's fields, for picking where values go.
  useEffect(() => {
    for (const id of new Set((steps ?? []).map((s) => s.process_id).filter(Boolean))) {
      if (fields[id]) continue;
      metaApi.params(Number(id)).then((p) => setFields((f) => ({ ...f, [id]: fillable(p, queries.has(id)).map((x) => x.field_path) })), () => undefined);
    }
  }, [steps, fields, queries]);

  if (error && !steps) return <Alert>{error}</Alert>;
  if (!steps) return <div className="h-40 animate-pulse rounded-xl bg-primary ring-1 ring-secondary motion-reduce:animate-none" />;

  const change = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setDirty(true);
    setSavedNote(false);
  };
  const putSteps = change(setSteps);
  const putTransitions = change(setTransitions);
  const updateStep = (key: string, patch: Partial<StepDraft>) => putSteps(steps.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const updateTransition = (i: number, patch: Partial<TransitionDraft>) => putTransitions(transitions.map((item, j) => (j === i ? { ...item, ...patch } : item)));

  const stepLabel = (key: string) => {
    const i = steps.findIndex((s) => s.key === key);
    return i < 0 ? '?' : `${i + 1}. ${formName.get(steps[i].process_id) ?? t("Pick a step")}`;
  };
  const led = new Set(transitions.map((item) => item.target));
  const starters = steps.filter((s) => !led.has(s.key));
  const mainFields = fields[String(meta.id)] ?? [];

  function removeStep(key: string) {
    putSteps(steps!.filter((s) => s.key !== key));
    setTransitions((ts) => ts.filter((item) => item.source !== key && item.target !== key));
  }

  /** Adds main.field -> field for every field the step's form shares with this one. */
  function matchByName(step: StepDraft) {
    const taken = new Set(step.behaviours.map((b) => b.target_path));
    const added = (fields[step.process_id] ?? []).filter((f) => mainFields.includes(f) && !taken.has(f)).map((f) => ({ source_path: `main.${f}`, target_path: f }));
    updateStep(step.key, { behaviours: [...step.behaviours, ...added] });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      load(
        await processFlowApi.save(meta.id, {
          steps: steps!.map((s) => ({ key: s.key, process_id: Number(s.process_id), behaviours: s.behaviours.filter((b) => b.source_path.trim() && b.target_path) })),
          transitions: transitions.map((item) => ({ source: item.source || null, target: item.target, criteria: item.criteria.filter((c) => c.field.trim()) })),
        }),
      );
      setSavedNote(true);
    } catch (err) {
      if (err instanceof ApiError && err.errors) setError(Object.values(err.errors)[0]?.[0] ?? err.message);
      else setError(err instanceof ApiError ? err.message : t("The process flow could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl bg-primary shadow-xs ring-1 ring-secondary" aria-labelledby="process-flow-title">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-secondary px-4 py-4 sm:px-5">
        <div>
          <h2 id="process-flow-title" className="flex items-center gap-2 text-md font-semibold text-primary">
            <Zap className="size-5 text-fg-brand-primary" aria-hidden="true" />
            {t("Process flow")}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-tertiary">
            {t('When {name} saves a new record, these forms save one too and these stage queries run, in the same go. If any of them refuses, nothing is saved.', { name: meta.name })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {savedNote && <span className="text-sm text-success-primary">{t("Saved.")}</span>}
          <Button size="sm" isDisabled={!dirty || steps.some((s) => !s.process_id) || transitions.some((item) => !item.target)} isLoading={saving} showTextWhileLoading onPress={save}>
            {t("Save flow")}
          </Button>
        </div>
      </div>

      <div className="space-y-6 px-4 py-5 sm:px-5">
        {error && <Alert>{error}</Alert>}

        {/* The flow at a glance: the main form, then each step with what leads to it. */}
        <ol className="flex flex-wrap items-center gap-2 text-sm" aria-label={t("The flow at a glance")}>
          <li>
            <Badge type="pill-color" color="brand" size="md">
              {meta.name}
            </Badge>
          </li>
          {steps.map((s) => {
            const into = transitions.filter((item) => item.target === s.key);
            return (
              <li key={s.key} className="flex items-center gap-2">
                <ArrowRight className="size-4 text-fg-quaternary" aria-hidden="true" />
                <Badge type="pill-color" color="gray" size="md">
                  {stepLabel(s.key)}
                  {into.length > 0 && <span className="ml-1 text-quaternary">{t('after {steps}', { steps: into.map((item) => (item.source ? stepLabel(item.source).split('. ')[0] : 'main')).join(t(' or ')) })}</span>}
                </Badge>
              </li>
            );
          })}
        </ol>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-primary">{t("Steps")}</h3>
          {steps.length === 0 && <p className="text-sm text-tertiary">{t("No steps yet: saving this form runs nothing else.")}</p>}
          {steps.map((s, i) => {
            const targets = fields[s.process_id] ?? [];
            return (
              <div key={s.key} className="rounded-lg p-4 ring-1 ring-secondary">
                <div className="flex flex-wrap items-end gap-3">
                  <span className="mb-2 flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary">{i + 1}</span>
                  <div className="min-w-60 flex-1">
                    <NativeSelect label={t("Form or stage query")} value={s.process_id} onChange={(e) => updateStep(s.key, { process_id: e.target.value, behaviours: [] })} options={[{ value: '', label: t("Pick a form or stage query…") }, ...forms.map((f) => ({ value: String(f.id), label: `${f.name} (${f.type === 'stage_query' ? 'stage query' : f.code})` }))]} />
                  </div>
                  {!led.has(s.key) && <Badge type="color" color="success" size="sm" className="mb-2.5">{t("Starts right after saving")}</Badge>}
                  <IconAction icon={Trash01} danger label={t('Remove step {n}', { n: i + 1 })} onPress={() => removeStep(s.key)} className="mb-1.5" />
                </div>

                {s.process_id && (
                  <div className="mt-4 space-y-2">
                    <p className="text-sm font-medium text-secondary">{t("Values it takes")}</p>
                    {s.behaviours.length === 0 && <p className="text-sm text-tertiary">{queries.has(s.process_id) ? t("None yet: its parameters are empty (or at their defaults).") : t("None yet: its fields start empty (or at their defaults).")}</p>}
                    {s.behaviours.map((b, j) => (
                      <div key={j} className="grid items-center gap-2 sm:grid-cols-[1fr_auto_1fr_auto]">
                        <Input
                          aria-label={t("From")}
                          value={b.source_path}
                          placeholder={t("field, main.field or =text")}
                          inputClassName="font-mono"
                          onChange={(v) => updateStep(s.key, { behaviours: s.behaviours.map((x, k) => (k === j ? { ...x, source_path: v } : x)) })}
                        />
                        <ArrowRight className="hidden size-4 text-fg-quaternary sm:block" aria-hidden="true" />
                        <NativeSelect
                          aria-label={t("Into")}
                          value={b.target_path}
                          onChange={(e) => updateStep(s.key, { behaviours: s.behaviours.map((x, k) => (k === j ? { ...x, target_path: e.target.value } : x)) })}
                          options={[{ value: '', label: queries.has(s.process_id) ? t("Into parameter…") : t("Into field…") }, ...[...new Set([...targets, b.target_path].filter(Boolean))].map((f) => ({ value: f, label: f }))]}
                        />
                        <IconAction icon={Trash01} danger label={t("Remove this value")} onPress={() => updateStep(s.key, { behaviours: s.behaviours.filter((_, k) => k !== j) })} />
                      </div>
                    ))}
                    <div className="flex flex-wrap gap-3">
                      <Button size="sm" color="link-color" iconLeading={Plus} onPress={() => updateStep(s.key, { behaviours: [...s.behaviours, { source_path: '', target_path: '' }] })}>
                        {t("Add a value")}
                      </Button>
                      <Button size="sm" color="link-gray" onPress={() => matchByName(s)}>
                        {t("Match fields by name")}
                      </Button>
                    </div>
                    <p className="text-xs text-quaternary">
                      {t('From:')} <code className="font-mono">field</code> {t('of the record just saved (the previous step’s, or {name}’s),', { name: meta.name })}{' '}
                      <code className="font-mono">main.field</code> {t('of {name}’s record, or', { name: meta.name })} <code className="font-mono">=text</code> {t('a fixed value.')}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
          <Button size="sm" color="secondary" iconLeading={Plus} onPress={() => putSteps([...steps, { key: newKey(), process_id: '', behaviours: [] }])}>
            {t("Add a step")}
          </Button>
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-primary">{t("Transitions")}</h3>
            <p className="text-sm text-tertiary">
              {starters.length === steps.length
                ? t("None: every step starts right after saving. Add one to run a step after another, or only when a record meets conditions.")
                : t("A step with a transition into it runs only when one of them leads there.")}
            </p>
          </div>
          {transitions.map((item, i) => (
            <div key={i} className="rounded-lg p-4 ring-1 ring-secondary">
              <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr_auto]">
                <NativeSelect label={t("After")} value={item.source} onChange={(e) => updateTransition(i, { source: e.target.value })} options={[{ value: '', label: t('{name} (main)', { name: meta.name }) }, ...steps.map((s) => ({ value: s.key, label: stepLabel(s.key) }))]} />
                <ArrowRight className="mb-3 hidden size-4 text-fg-quaternary sm:block" aria-hidden="true" />
                <NativeSelect label={t("Run")} value={item.target} onChange={(e) => updateTransition(i, { target: e.target.value })} options={[{ value: '', label: t("Pick a step…") }, ...steps.filter((s) => s.key !== item.source).map((s) => ({ value: s.key, label: stepLabel(s.key) }))]} />
                <IconAction icon={Trash01} danger label={t("Remove this transition")} onPress={() => putTransitions(transitions.filter((_, j) => j !== i))} className="mb-1.5" />
              </div>
              <div className="mt-3 space-y-2">
                {item.criteria.map((c, j) => (
                  <div key={j} className="grid items-center gap-2 sm:grid-cols-[auto_1fr_9rem_1fr_auto]">
                    <span className="text-sm text-tertiary">{j === 0 ? t("Only when") : 'and'}</span>
                    <Input aria-label={t("Field")} value={c.field} placeholder="field" inputClassName="font-mono" onChange={(v) => updateTransition(i, { criteria: item.criteria.map((x, k) => (k === j ? { ...x, field: v } : x)) })} />
                    <NativeSelect aria-label={t("Condition")} value={c.op} onChange={(e) => updateTransition(i, { criteria: item.criteria.map((x, k) => (k === j ? { ...x, op: e.target.value as ConditionOp } : x)) })} options={tLabels(OPS)} />
                    {c.op === 'empty' || c.op === 'not_empty' ? (
                      <span />
                    ) : (
                      <Input aria-label={t("Value")} value={c.value} onChange={(v) => updateTransition(i, { criteria: item.criteria.map((x, k) => (k === j ? { ...x, value: v } : x)) })} />
                    )}
                    <IconAction icon={Trash01} danger label={t("Remove this condition")} onPress={() => updateTransition(i, { criteria: item.criteria.filter((_, k) => k !== j) })} />
                  </div>
                ))}
                <Button size="sm" color="link-color" iconLeading={Plus} onPress={() => updateTransition(i, { criteria: [...item.criteria, { field: '', op: '=', value: '' }] })}>
                  {item.criteria.length ? t("Add a condition") : t("Only when… (add a condition)")}
                </Button>
                <p className="text-xs text-quaternary">{item.source ? t('Conditions check the record just saved: step {step}’s.', { step: stepLabel(item.source) }) : t('Conditions check the record just saved: {name}’s.', { name: meta.name })}</p>
              </div>
            </div>
          ))}
          <Button size="sm" color="secondary" iconLeading={ArrowDown} isDisabled={steps.length === 0} onPress={() => putTransitions([...transitions, { source: '', target: '', criteria: [] }])}>
            {t("Add a transition")}
          </Button>
        </div>
      </div>
    </section>
  );
}
