import { useEffect, useMemo, useState } from 'react';
import type { TaxonomyDependency, TopicTaxonomyVariable } from '@feed-viz/shared';
import { useTaxonomy } from '../../context/TaxonomyContext';
import { useVertical } from '../../context/VerticalContext';
import { TOPIC_DOMAIN_GROUPS, variablesForDomain, type TopicDomainGroup } from '../../lib/topicPresets';
import { PanelShell, FieldLabel, inputClass } from './PanelShell';

function DependencyEditor({
  variable,
  dependsOn,
  onChange,
}: {
  variable: TopicTaxonomyVariable;
  dependsOn: TaxonomyDependency | null;
  onChange: (dep: TaxonomyDependency | null) => void;
}) {
  const { variables } = useTaxonomy();
  const [open, setOpen] = useState(!!dependsOn);
  const [valueMapInputs, setValueMapInputs] = useState<Record<string, string>>({});

  // Only re-seed the raw input text when the parent variable itself changes,
  // so typing a comma mid-edit doesn't get clobbered by a re-render.
  useEffect(() => {
    if (dependsOn) {
      const inputs: Record<string, string> = {};
      for (const [k, v] of Object.entries(dependsOn.valueMap)) inputs[k] = v.join(', ');
      setValueMapInputs(inputs);
    } else {
      setValueMapInputs({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dependsOn?.variable]);

  // A variable can't depend on one that (transitively, at minimum directly)
  // already depends on it - avoids an immediate cycle.
  const availableParents = variables.filter((v) => v.name !== variable.name && v.dependsOn?.variable !== variable.name);
  const parent = dependsOn ? variables.find((v) => v.name === dependsOn.variable) : null;

  const selectParent = (name: string) => {
    if (!name) {
      onChange(null);
      return;
    }
    onChange({ variable: name, valueMap: {} });
  };

  const commitValueMap = (parentValue: string) => {
    if (!dependsOn) return;
    const values = (valueMapInputs[parentValue] ?? '').split(',').map((v) => v.trim()).filter(Boolean);
    const nextMap = { ...dependsOn.valueMap };
    if (values.length === 0) delete nextMap[parentValue];
    else nextMap[parentValue] = values;
    onChange({ ...dependsOn, valueMap: nextMap });
  };

  return (
    <div className="border-t border-white/10 pt-2">
      <button className="flex items-center gap-1 text-[11px] text-white/60 hover:text-white" onClick={() => setOpen((v) => !v)}>
        <span>{open ? '▾' : '▸'}</span>
        Configure dependency
        {dependsOn && <span className="text-solace-blue-sky">(depends on {`{${dependsOn.variable}}`})</span>}
      </button>

      {open && (
        <div className="mt-1.5 rounded-md bg-black/20 p-2">
          <FieldLabel>Depends on variable</FieldLabel>
          <select className={inputClass} value={dependsOn?.variable ?? ''} onChange={(e) => selectParent(e.target.value)}>
            <option value="">No dependency (independent)</option>
            {availableParents.map((v) => (
              <option key={v.name} value={v.name}>
                {`{${v.name}}`} {v.description ? `- ${v.description}` : ''}
              </option>
            ))}
          </select>

          {dependsOn && parent && (
            <div className="mt-2">
              <p className="mb-1 text-[10px] text-white/40">
                For each value of <span className="font-mono text-solace-blue-sky">{`{${parent.name}}`}</span>, the valid
                values of <span className="font-mono text-solace-green">{`{${variable.name}}`}</span>:
              </p>
              <div className="flex flex-col gap-1">
                {parent.values.map((pv) => (
                  <div key={pv} className="flex items-center gap-1.5">
                    <span className="w-16 shrink-0 truncate font-mono text-[10px] text-solace-blue-sky" title={pv}>
                      {pv} →
                    </span>
                    <input
                      className={`${inputClass} font-mono text-[11px]`}
                      placeholder="value1, value2"
                      value={valueMapInputs[pv] ?? ''}
                      onChange={(e) => setValueMapInputs((prev) => ({ ...prev, [pv]: e.target.value }))}
                      onBlur={() => commitValueMap(pv)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function VariableCard({ variable }: { variable: TopicTaxonomyVariable }) {
  const { upsertVariable, deleteVariable } = useTaxonomy();
  const [isEditing, setIsEditing] = useState(false);
  const [description, setDescription] = useState(variable.description);
  const [valuesText, setValuesText] = useState(variable.values.join(', '));
  const [dependsOn, setDependsOn] = useState<TaxonomyDependency | null>(variable.dependsOn ?? null);

  const startEdit = () => {
    setDescription(variable.description);
    setValuesText(variable.values.join(', '));
    setDependsOn(variable.dependsOn ?? null);
    setIsEditing(true);
  };

  const save = () => {
    upsertVariable({
      ...variable,
      description,
      values: valuesText.split(',').map((v) => v.trim()).filter(Boolean),
      dependsOn: dependsOn ?? undefined,
    });
    setIsEditing(false);
  };

  return (
    <div className="rounded-md border border-white/10 bg-black/20 p-2.5">
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-xs text-solace-green">{`{${variable.name}}`}</span>
          {variable.dependsOn && (
            <span className="rounded bg-solace-blue-sky/15 px-1.5 py-0.5 text-[10px] text-solace-blue-sky">
              depends on {`{${variable.dependsOn.variable}}`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isEditing && (
            <button className="text-white/40 hover:text-white" title="Edit" onClick={startEdit}>
              ✎
            </button>
          )}
          <button className="text-white/40 hover:text-red-400" title="Delete" onClick={() => deleteVariable(variable.name)}>
            ✕
          </button>
        </div>
      </div>

      {isEditing ? (
        <div className="mt-1.5 flex flex-col gap-1.5">
          <input
            className={inputClass}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description"
          />
          <div>
            <FieldLabel>Default values (used when no dependency applies)</FieldLabel>
            <input
              className={`${inputClass} font-mono`}
              value={valuesText}
              onChange={(e) => setValuesText(e.target.value)}
              placeholder="value1, value2, value3"
            />
          </div>

          <DependencyEditor variable={variable} dependsOn={dependsOn} onChange={setDependsOn} />

          <div className="mt-1 flex justify-end gap-1.5">
            <button className="rounded px-2 py-1 text-[11px] text-white/60 hover:bg-white/10" onClick={() => setIsEditing(false)}>
              Cancel
            </button>
            <button className="rounded bg-solace-green px-2 py-1 text-[11px] font-medium text-solace-blue-dark" onClick={save}>
              Save
            </button>
          </div>
        </div>
      ) : (
        <>
          {variable.description && <p className="mt-1 text-[11px] text-white/50">{variable.description}</p>}
          {variable.dependsOn && Object.keys(variable.dependsOn.valueMap).length > 0 && (
            <div className="mt-1 space-y-0.5 text-[10px] text-white/40">
              {Object.entries(variable.dependsOn.valueMap).slice(0, 3).map(([pv, vals]) => (
                <p key={pv} className="font-mono">
                  <span className="text-solace-blue-sky">{pv}</span> → {vals.join(', ')}
                </p>
              ))}
              {Object.keys(variable.dependsOn.valueMap).length > 3 && (
                <p>+{Object.keys(variable.dependsOn.valueMap).length - 3} more mappings</p>
              )}
            </div>
          )}
          <div className="mt-1.5 flex flex-wrap gap-1">
            {variable.values.slice(0, 8).map((v) => (
              <span key={v} className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white/70">
                {v}
              </span>
            ))}
            {variable.values.length > 8 && <span className="text-[10px] text-white/40">+{variable.values.length - 8} more</span>}
          </div>
        </>
      )}
    </div>
  );
}

export function TaxonomyPanel({ onClose }: { onClose: () => void }) {
  const { variables, upsertVariable, resetToDefaults } = useTaxonomy();
  const { vertical } = useVertical();
  const [newName, setNewName] = useState('');
  const [activeDomain, setActiveDomain] = useState<TopicDomainGroup | null>(null);

  const domainGroups = useMemo(() => TOPIC_DOMAIN_GROUPS.filter((g) => g.theme === vertical), [vertical]);

  // Selecting a domain loads every variable any of its use cases reference
  // (introduced or merely reused) straight into the pool, so they're visible
  // and editable here even if no publisher/consumer ever loaded that preset.
  const selectDomain = (group: TopicDomainGroup | null) => {
    if (group) variablesForDomain(group).forEach(upsertVariable);
    setActiveDomain(group);
  };

  const visibleVariables = useMemo(() => {
    if (!activeDomain) return variables;
    const names = new Set(variablesForDomain(activeDomain).map((v) => v.name));
    return variables.filter((v) => names.has(v.name));
  }, [variables, activeDomain]);

  const addVariable = () => {
    const name = newName.trim().replace(/[^a-zA-Z0-9_]/g, '');
    if (!name || variables.some((v) => v.name === name)) return;
    upsertVariable({ name, description: '', values: [], isCustom: true });
    setNewName('');
    // A freshly-added custom variable isn't part of any domain's set, so
    // switch back to the unfiltered view where it'll actually be visible.
    setActiveDomain(null);
  };

  return (
    <PanelShell title="Topic Taxonomy" onClose={onClose}>
      <p className="text-xs text-white/50">
        Define <code>{'{variable}'}</code> placeholders publishers can use in a topic template,
        e.g. <code className="text-white/70">marketdata/v1/{'{country}'}/{'{exchange}'}/{'{ticker}'}</code>. Variables can
        depend on each other so only valid combinations are generated.
      </p>

      {domainGroups.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            className={`rounded-full px-2.5 py-1 text-[11px] transition-colors ${
              !activeDomain ? 'bg-solace-green/20 text-solace-green' : 'bg-white/5 text-white/60 hover:bg-white/10'
            }`}
            onClick={() => selectDomain(null)}
          >
            All Variables
          </button>
          {domainGroups.map((group) => (
            <button
              key={group.domain}
              className={`rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                activeDomain?.domain === group.domain
                  ? 'bg-solace-green/20 text-solace-green'
                  : 'bg-white/5 text-white/60 hover:bg-white/10'
              }`}
              onClick={() => selectDomain(group)}
            >
              {group.domain}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {visibleVariables.map((v) => (
          <VariableCard key={v.name} variable={v} />
        ))}
      </div>

      <div className="mt-1 flex gap-2">
        <input
          className={inputClass}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="new_variable_name"
          onKeyDown={(e) => e.key === 'Enter' && addVariable()}
        />
        <button
          className="shrink-0 rounded-md bg-white/10 px-3 text-sm text-white hover:bg-white/20"
          onClick={addVariable}
        >
          Add
        </button>
      </div>

      <button className="mt-2 self-start text-xs text-white/40 hover:text-white/70" onClick={resetToDefaults}>
        Reset to defaults (market data example)
      </button>
    </PanelShell>
  );
}
