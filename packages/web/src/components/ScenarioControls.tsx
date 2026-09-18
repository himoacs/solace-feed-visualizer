import { useRef, useState } from 'react';
import { useCanvas } from '../context/CanvasContext';
import { useTaxonomy } from '../context/TaxonomyContext';
import { buildScenarioFile, downloadScenarioFile, parseScenarioFile, ScenarioParseError, type ScenarioFile } from '../lib/scenario';
import { ConfirmDialog } from './ConfirmDialog';

export function ScenarioControls() {
  const { nodes, addPublisher, addConsumer, removeNode } = useCanvas();
  const { variables, replaceAll } = useTaxonomy();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingScenario, setPendingScenario] = useState<ScenarioFile | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleExport = () => {
    downloadScenarioFile(buildScenarioFile(variables, nodes));
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;
    try {
      const text = await file.text();
      setImportError(null);
      setPendingScenario(parseScenarioFile(text));
    } catch (err) {
      setImportError(err instanceof ScenarioParseError ? err.message : (err as Error).message);
    }
  };

  const applyImport = async () => {
    const scenario = pendingScenario;
    if (!scenario) return;
    setPendingScenario(null);
    setBusy(true);
    try {
      // Tear down current nodes (and their broker objects) before restoring.
      for (const node of nodes) {
        await removeNode(node.id);
      }
      replaceAll(scenario.taxonomy);
      for (const n of scenario.nodes) {
        if (n.kind === 'publisher') {
          await addPublisher(n.config, n.position);
        } else {
          await addConsumer(n.config, n.position);
        }
      }
    } catch (err) {
      setImportError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1.5">
        <button
          className="flex-1 rounded-md px-2 py-1.5 text-xs text-white/70 hover:bg-white/5"
          onClick={handleExport}
          title="Download the current topic taxonomy and canvas as a JSON scenario file"
        >
          Export
        </button>
        <button
          className="flex-1 rounded-md px-2 py-1.5 text-xs text-white/70 hover:bg-white/5 disabled:opacity-40"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          title="Load a saved scenario file"
        >
          {busy ? 'Importing…' : 'Import'}
        </button>
      </div>
      <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={handleFileSelected} />
      {importError && <p className="truncate px-2 text-[10px] text-red-400" title={importError}>{importError}</p>}

      <ConfirmDialog
        open={!!pendingScenario}
        title="Import scenario?"
        body={`This removes all ${nodes.length} node(s) currently on the canvas (deleting their broker objects) and replaces your topic taxonomy, then recreates ${
          pendingScenario?.nodes.length ?? 0
        } node(s) from the file.`}
        confirmLabel="Import"
        onCancel={() => setPendingScenario(null)}
        onConfirm={applyImport}
      />
    </div>
  );
}
