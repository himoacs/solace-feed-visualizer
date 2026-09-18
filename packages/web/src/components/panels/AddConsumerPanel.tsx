import { useMemo, useState } from 'react';
import { useCanvas } from '../../context/CanvasContext';
import { useTaxonomy } from '../../context/TaxonomyContext';
import { useVertical } from '../../context/VerticalContext';
import { BROKER_POSITION } from '../../lib/canvasLayout';
import { TOPIC_PRESETS, presetQueueNameBase, presetWildcardSubscription, type TopicPreset } from '../../lib/topicPresets';
import { feedRuleToPreset } from '../../lib/feedTopicAdapter';
import { useFeedIndex, useFeedDetail } from '../../hooks/useSolaceFeedCatalog';
import { TopicSuggestInput } from '../TopicSuggestInput';
import { PanelShell, FieldLabel, inputClass } from './PanelShell';

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function AddConsumerPanel({ onClose }: { onClose: () => void }) {
  const { addConsumer, nodes } = useCanvas();
  const { upsertVariable } = useTaxonomy();
  const { vertical } = useVertical();
  const [name, setName] = useState(() => `Consumer ${nodes.filter((n) => n.kind === 'consumer').length + 1}`);
  const [mode, setMode] = useState<'direct' | 'queue'>('direct');
  const [topicFilter, setTopicFilter] = useState('marketdata/>');
  const [queueName, setQueueName] = useState(`marketdata-queue-${randomSuffix()}`);
  const [subscriptions, setSubscriptions] = useState<string[]>(['marketdata/>']);
  const [ackMode, setAckMode] = useState<'auto' | 'client'>('auto');
  const [queueMaxSpoolMb, setQueueMaxSpoolMb] = useState(1);
  const [presetId, setPresetId] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedFeedName, setSelectedFeedName] = useState('');
  const [selectedFeedTopic, setSelectedFeedTopic] = useState('');

  const selectedPreset = useMemo(() => TOPIC_PRESETS.find((p) => p.id === presetId) ?? null, [presetId]);
  const presetGroups = useMemo(() => {
    const map = new Map<string, typeof TOPIC_PRESETS>();
    for (const preset of TOPIC_PRESETS) {
      if (preset.theme !== vertical) continue;
      const key = `${preset.theme} — ${preset.domain}`;
      const group = map.get(key);
      if (group) group.push(preset);
      else map.set(key, [preset]);
    }
    return [...map.entries()];
  }, [vertical]);

  // A preset only fills in a suggested "watch everything under this use
  // case" wildcard subscription, not the raw {variable} template - a
  // consumer's topic filter/subscriptions are real broker wildcards, not
  // taxonomy templates. Re-applied whenever the mode toggles too, so
  // switching Direct <-> Queue with a preset already picked keeps it in sync.
  // Queue mode also gets a queue name reflecting the preset (not the generic
  // "marketdata-queue-*" default) - previously a queue built from e.g. the
  // Trade Order Distribution preset still ended up literally named
  // "marketdata-queue-...", which was confusing on the canvas.
  const applyPresetToMode = (preset: TopicPreset, targetMode: 'direct' | 'queue') => {
    const wildcard = presetWildcardSubscription(preset);
    if (targetMode === 'direct') {
      setTopicFilter(wildcard);
    } else {
      setSubscriptions([wildcard]);
      setQueueName(`${presetQueueNameBase(preset)}-queue-${randomSuffix()}`);
    }
  };

  const applyPreset = (id: string) => {
    setPresetId(id);
    setSelectedFeedName('');
    setSelectedFeedTopic('');
    const preset = TOPIC_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    preset.variables.forEach(upsertVariable);
    applyPresetToMode(preset, mode);
  };

  // Community Event Feeds (live, from feeds.solace.dev) - a separate source
  // from the built-in presets above, not gated by Vertical (see
  // AddPublisherPanel.tsx for the same reasoning).
  const feedIndex = useFeedIndex();
  const feedDetail = useFeedDetail(selectedFeedName || null);
  const feedDomainGroups = useMemo(() => {
    const map = new Map<string, typeof feedIndex.feeds>();
    for (const feed of feedIndex.feeds) {
      const group = map.get(feed.domain);
      if (group) group.push(feed);
      else map.set(feed.domain, [feed]);
    }
    return [...map.entries()];
  }, [feedIndex.feeds]);
  const selectedFeedRule = useMemo(
    () => feedDetail.detail?.rules.find((r) => r.topic === selectedFeedTopic) ?? null,
    [feedDetail.detail, selectedFeedTopic]
  );
  const selectedFeedPreset = useMemo(
    () => (feedDetail.detail && selectedFeedRule ? feedRuleToPreset(feedDetail.detail, selectedFeedRule) : null),
    [feedDetail.detail, selectedFeedRule]
  );

  const applyFeedTopic = (topic: string) => {
    setSelectedFeedTopic(topic);
    setPresetId('');
    if (!feedDetail.detail) return;
    const rule = feedDetail.detail.rules.find((r) => r.topic === topic);
    if (!rule) return;
    const preset = feedRuleToPreset(feedDetail.detail, rule);
    preset.variables.forEach(upsertVariable);
    applyPresetToMode(preset, mode);
  };

  const selectMode = (nextMode: 'direct' | 'queue') => {
    setMode(nextMode);
    if (selectedPreset) applyPresetToMode(selectedPreset, nextMode);
    else if (selectedFeedPreset) applyPresetToMode(selectedFeedPreset, nextMode);
  };

  const updateSubscription = (index: number, value: string) => {
    setSubscriptions((prev) => prev.map((s, i) => (i === index ? value : s)));
    setPresetId('');
    setSelectedFeedName('');
    setSelectedFeedTopic('');
  };
  const addSubscriptionField = () => setSubscriptions((prev) => [...prev, '']);
  const removeSubscriptionField = (index: number) => setSubscriptions((prev) => prev.filter((_, i) => i !== index));

  const canSubmit = mode === 'direct' ? !!topicFilter : !!queueName && subscriptions.some((s) => s.trim());

  const submit = async () => {
    setBusy(true);
    try {
      // Stacked by how many consumers already exist, not pure random - two
      // added back-to-back used to land on nearly the same spot and overlap.
      const consumerCount = nodes.filter((n) => n.kind === 'consumer').length;
      await addConsumer(
        mode === 'direct'
          ? { mode: 'direct', topicFilter }
          : {
              mode: 'queue',
              topicFilter: '',
              queueName,
              queueSubscriptions: subscriptions.map((s) => s.trim()).filter(Boolean),
              ackMode,
              queueMaxSpoolMb,
            },
        {
          x: BROKER_POSITION.x + 140 + (consumerCount % 3) * 40,
          y: BROKER_POSITION.y - 160 + consumerCount * 120,
        },
        name
      );
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <PanelShell title="Add Consumer" onClose={onClose}>
      <div>
        <FieldLabel>Name</FieldLabel>
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div>
        <FieldLabel>Preset (optional)</FieldLabel>
        <select className={inputClass} value={presetId} onChange={(e) => applyPreset(e.target.value)}>
          <option value="">Custom subscription (type your own below)</option>
          {presetGroups.map(([groupLabel, presets]) => (
            <optgroup key={groupLabel} label={groupLabel}>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.useCase}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {selectedPreset && <p className="mt-1 text-[11px] text-white/40">{selectedPreset.description}</p>}
      </div>

      <div>
        <FieldLabel>Community Feed (live, from feeds.solace.dev)</FieldLabel>
        <div className="flex gap-1.5">
          <select
            className={inputClass}
            value={selectedFeedName}
            onChange={(e) => {
              setSelectedFeedName(e.target.value);
              setSelectedFeedTopic('');
            }}
          >
            <option value="">{feedIndex.status === 'loading' ? 'Loading feeds…' : 'Select a feed…'}</option>
            {feedDomainGroups.map(([domain, feeds]) => (
              <optgroup key={domain} label={domain}>
                {feeds.map((feed) => (
                  <option key={feed.name} value={feed.name}>
                    {feed.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <select
            className={inputClass}
            value={selectedFeedTopic}
            disabled={!selectedFeedName || feedDetail.status !== 'ready'}
            onChange={(e) => applyFeedTopic(e.target.value)}
          >
            <option value="">{feedDetail.status === 'loading' ? 'Loading topics…' : 'Select a topic/event…'}</option>
            {feedDetail.detail?.rules.map((rule) => (
              <option key={rule.topic} value={rule.topic}>
                {rule.eventName ?? rule.topic}
              </option>
            ))}
          </select>
        </div>
        {feedIndex.status === 'error' && (
          <p className="mt-1 text-[11px] text-red-400">
            Community feeds unavailable right now ({feedIndex.error}) -{' '}
            <button className="underline hover:text-red-300" onClick={feedIndex.reload}>
              Refresh
            </button>
            , or use a built-in preset / type your own topic.
          </p>
        )}
        {feedIndex.status === 'ready' && feedDetail.status === 'error' && (
          <p className="mt-1 text-[11px] text-red-400">Could not load topics for this feed - try a different one.</p>
        )}
      </div>

      <div className="flex rounded-md border border-white/10 bg-black/20 p-0.5 text-sm">
        <button
          className={`flex-1 rounded py-1 ${mode === 'direct' ? 'bg-solace-blue-sky text-solace-blue-dark' : 'text-white/60'}`}
          onClick={() => selectMode('direct')}
        >
          Direct Subscribe
        </button>
        <button
          className={`flex-1 rounded py-1 ${mode === 'queue' ? 'bg-solace-blue-sky text-solace-blue-dark' : 'text-white/60'}`}
          onClick={() => selectMode('queue')}
        >
          Queue Bind
        </button>
      </div>

      {mode === 'direct' ? (
        <div>
          <FieldLabel>Topic Filter</FieldLabel>
          <TopicSuggestInput
            className={`${inputClass} font-mono`}
            value={topicFilter}
            onChange={(v) => {
              setTopicFilter(v);
              setPresetId('');
              setSelectedFeedName('');
              setSelectedFeedTopic('');
            }}
            placeholder="marketdata/* or marketdata/>"
          />
          <p className="mt-1 text-[11px] text-white/40">
            Use <code>*</code> for one level, <code>&gt;</code> for the rest of the hierarchy.
          </p>
        </div>
      ) : (
        <>
          <div>
            <FieldLabel>Queue Name</FieldLabel>
            <input
              className={`${inputClass} font-mono`}
              value={queueName}
              onChange={(e) => {
                setQueueName(e.target.value);
                setPresetId('');
                setSelectedFeedName('');
                setSelectedFeedTopic('');
              }}
            />
          </div>

          <div>
            <FieldLabel>Topic Subscriptions (mapped onto the queue)</FieldLabel>
            <div className="flex flex-col gap-1.5">
              {subscriptions.map((sub, i) => (
                <div key={i} className="flex gap-1.5">
                  <TopicSuggestInput
                    className={`${inputClass} font-mono`}
                    value={sub}
                    onChange={(v) => updateSubscription(i, v)}
                    placeholder="marketdata/* or marketdata/>"
                  />
                  {subscriptions.length > 1 && (
                    <button className="shrink-0 text-white/40 hover:text-red-400" title="Remove subscription" onClick={() => removeSubscriptionField(i)}>
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button className="mt-1.5 text-[11px] text-solace-blue-sky hover:text-white" onClick={addSubscriptionField}>
              + Add subscription
            </button>
          </div>

          <div>
            <FieldLabel>Ack Mode</FieldLabel>
            <select className={inputClass} value={ackMode} onChange={(e) => setAckMode(e.target.value as 'auto' | 'client')}>
              <option value="auto">Auto</option>
              <option value="client">Client (explicit ack)</option>
            </select>
          </div>

          <div>
            <FieldLabel>Queue Max Spool (MB)</FieldLabel>
            <input
              type="number"
              min={1}
              className={inputClass}
              value={queueMaxSpoolMb}
              onChange={(e) => setQueueMaxSpoolMb(Math.max(1, Number(e.target.value) || 1))}
            />
            <p className="mt-1 text-[11px] text-white/40">
              Kept small on purpose - a small quota fills fast in a live demo, so you can show a queue backing up and
              discarding without needing a huge message volume.
            </p>
          </div>
        </>
      )}

      <button
        className="mt-2 rounded-md bg-solace-blue-sky py-2 text-sm font-medium text-solace-blue-dark hover:brightness-110 disabled:opacity-50"
        onClick={submit}
        disabled={busy || !canSubmit}
      >
        {busy ? 'Provisioning…' : 'Add to Canvas'}
      </button>
    </PanelShell>
  );
}
