import { useMemo, useState } from 'react';
import type { DeliveryMode, TopicMode } from '@feed-viz/shared';
import { useCanvas } from '../../context/CanvasContext';
import { useTaxonomy } from '../../context/TaxonomyContext';
import { useVertical } from '../../context/VerticalContext';
import { BROKER_POSITION } from '../../lib/canvasLayout';
import { expandTopicTemplate, extractVariables } from '../../lib/topicTaxonomy';
import { TOPIC_PRESETS } from '../../lib/topicPresets';
import { feedRuleToPreset } from '../../lib/feedTopicAdapter';
import { useFeedIndex, useFeedDetail } from '../../hooks/useSolaceFeedCatalog';
import { formatRate, rateToSlider, sliderToRate } from '../../lib/rateScale';
import { PanelShell, FieldLabel, inputClass } from './PanelShell';

export function AddPublisherPanel({ onClose }: { onClose: () => void }) {
  const { addPublisher, nodes } = useCanvas();
  const { variables, upsertVariable } = useTaxonomy();
  const { vertical } = useVertical();
  const [name, setName] = useState(() => `Publisher ${nodes.filter((n) => n.kind === 'publisher').length + 1}`);
  const [topicTemplate, setTopicTemplate] = useState('marketdata/v1/{country}/{exchange}/{ticker}');
  const [presetId, setPresetId] = useState('');
  const [topicMode, setTopicMode] = useState<TopicMode>('round-robin');
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('direct');
  const [rate, setRate] = useState(2);
  const [messageSize, setMessageSize] = useState(128);
  const [busy, setBusy] = useState(false);
  const [selectedFeedName, setSelectedFeedName] = useState('');
  const [selectedFeedTopic, setSelectedFeedTopic] = useState('');

  const templateVars = useMemo(() => extractVariables(topicTemplate), [topicTemplate]);
  const sampleTopics = useMemo(
    () => expandTopicTemplate(topicTemplate, variables, { maxTopics: 6 }),
    [topicTemplate, variables]
  );
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

  const applyPreset = (id: string) => {
    setPresetId(id);
    setSelectedFeedName('');
    setSelectedFeedTopic('');
    const preset = TOPIC_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    preset.variables.forEach(upsertVariable);
    setTopicTemplate(preset.topicTemplate);
  };

  // Community Event Feeds (live, from feeds.solace.dev) - a separate source
  // from the built-in presets above, not gated by Vertical: the catalog is a
  // broad, uncoordinated set of community contributions across many
  // unrelated domains (Retail, Aviation, Mining, ...), not one curated,
  // internally-consistent taxonomy the way a vertical is.
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

  const applyFeedTopic = (topic: string) => {
    setSelectedFeedTopic(topic);
    if (!feedDetail.detail) return;
    const rule = feedDetail.detail.rules.find((r) => r.topic === topic);
    if (!rule) return;
    setPresetId('');
    const preset = feedRuleToPreset(feedDetail.detail, rule);
    preset.variables.forEach(upsertVariable);
    setTopicTemplate(preset.topicTemplate);
  };

  const submit = async () => {
    setBusy(true);
    try {
      // Stacked by how many publishers already exist, not pure random - two
      // added back-to-back used to land on nearly the same spot and overlap.
      // Anchored to BROKER_POSITION (up-and-left of it) rather than an
      // independent absolute coordinate, so it stays visually close to the
      // broker regardless of where that constant is defined.
      const publisherCount = nodes.filter((n) => n.kind === 'publisher').length;
      await addPublisher(
        { topicTemplate, topicMode, deliveryMode, ratePerSecond: rate, messageSizeBytes: messageSize },
        {
          x: BROKER_POSITION.x - 260 + (publisherCount % 3) * 40,
          y: BROKER_POSITION.y - 160 + publisherCount * 120,
        },
        name
      );
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <PanelShell title="Add Publisher" onClose={onClose}>
      <div>
        <FieldLabel>Name</FieldLabel>
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div>
        <FieldLabel>Preset (optional)</FieldLabel>
        <select className={inputClass} value={presetId} onChange={(e) => applyPreset(e.target.value)}>
          <option value="">Custom topic (type your own below)</option>
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

      <div>
        <FieldLabel>Topic Template</FieldLabel>
        <input
          className={`${inputClass} font-mono`}
          value={topicTemplate}
          onChange={(e) => {
            setTopicTemplate(e.target.value);
            setPresetId('');
            setSelectedFeedName('');
            setSelectedFeedTopic('');
          }}
          placeholder="marketdata/v1/{country}/{exchange}/{ticker}"
        />
        <p className="mt-1 text-[11px] text-white/40">
          {selectedPreset ? (
            selectedPreset.description
          ) : (
            <>
              Use <code>{'{variable}'}</code> placeholders from Topic Taxonomy to publish across many topics.
            </>
          )}
        </p>
      </div>

      {sampleTopics.length > 0 && (
        <div className="rounded-md border border-white/10 bg-black/20 p-2 text-[10px] text-white/50">
          <p className="mb-1 text-white/40">
            {templateVars.length > 0 ? `Sample topics (${sampleTopics.length} shown):` : 'Topic:'}
          </p>
          {sampleTopics.map((t) => (
            <p key={t} className="truncate font-mono text-white/70">
              {t}
            </p>
          ))}
        </div>
      )}

      {templateVars.length > 0 && (
        <div>
          <FieldLabel>Topic Mode</FieldLabel>
          <select className={inputClass} value={topicMode} onChange={(e) => setTopicMode(e.target.value as TopicMode)}>
            <option value="round-robin">Round robin across expanded topics</option>
            <option value="random">Random topic per message</option>
            <option value="single">Always the first expanded topic</option>
          </select>
        </div>
      )}

      <div>
        <FieldLabel>QoS / Delivery Mode</FieldLabel>
        <select
          className={inputClass}
          value={deliveryMode}
          onChange={(e) => setDeliveryMode(e.target.value as DeliveryMode)}
        >
          <option value="direct">Direct</option>
          <option value="persistent">Persistent (guaranteed)</option>
        </select>
      </div>

      <div>
        <FieldLabel>Rate ({formatRate(rate)} msg/s)</FieldLabel>
        <input
          type="range"
          min={0}
          max={1000}
          step={1}
          value={rateToSlider(rate)}
          onChange={(e) => setRate(sliderToRate(Number(e.target.value)))}
          className="w-full accent-solace-green"
        />
      </div>

      <div>
        <FieldLabel>Message Size (bytes)</FieldLabel>
        <input
          className={inputClass}
          type="number"
          value={messageSize}
          onChange={(e) => setMessageSize(Number(e.target.value))}
        />
      </div>

      <button
        className="mt-2 rounded-md bg-solace-green py-2 text-sm font-medium text-solace-blue-dark hover:brightness-110 disabled:opacity-50"
        onClick={submit}
        disabled={busy || !topicTemplate}
      >
        {busy ? 'Provisioning…' : 'Add to Canvas'}
      </button>
    </PanelShell>
  );
}
