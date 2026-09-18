import { useMemo, useRef, useState } from 'react';
import { useTopicSuggestionCorpus } from '../hooks/useTopicSuggestionCorpus';

const MAX_SUGGESTIONS = 8;

/** Longest static prefix shared by every candidate, formatted the same way
 * `presetWildcardSubscription` builds a wildcard from a single preset's
 * template - generalized to work off a live matched set instead. Returns
 * null when there's nothing useful to pin (fewer than 2 candidates, or the
 * shared prefix isn't actually longer than what's already been typed). */
function wildcardSuggestion(candidates: string[], typed: string): string | null {
  if (candidates.length < 2) return null;
  let prefix = candidates[0];
  for (const candidate of candidates.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < candidate.length && prefix[i] === candidate[i]) i++;
    prefix = prefix.slice(0, i);
    if (!prefix) return null;
  }
  // Trim back to the last full segment boundary so the wildcard doesn't cut
  // a segment in half (e.g. "capitalMarkets/tradeOrder/ord" -> back to
  // ".../order/").
  const lastSlash = prefix.lastIndexOf('/');
  const trimmed = lastSlash === -1 ? '' : prefix.slice(0, lastSlash);
  if (trimmed.length <= typed.length) return null;
  return `${trimmed}/>`;
}

interface TopicSuggestInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}

export function TopicSuggestInput({ value, onChange, className, placeholder }: TopicSuggestInputProps) {
  const corpus = useTopicSuggestionCorpus();
  const [focused, setFocused] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const allMatches = useMemo(() => {
    const needle = value.trim().toLowerCase();
    return corpus.filter((t) => t.toLowerCase().startsWith(needle) && t !== value);
  }, [corpus, value]);

  const matches = useMemo(() => allMatches.slice(0, MAX_SUGGESTIONS), [allMatches]);
  const wildcard = useMemo(() => wildcardSuggestion(allMatches, value), [allMatches, value]);

  const rows = wildcard ? [wildcard, ...matches] : matches;
  const showDropdown = focused && rows.length > 0;

  const inputRef = useRef<HTMLInputElement>(null);

  const select = (topic: string) => {
    onChange(topic);
    setFocused(false);
    // The suggestion button's onMouseDown below calls preventDefault so
    // clicking it doesn't steal DOM focus away from the input (needed so
    // typing can continue right after a selection) - but that means the
    // input never actually blurs, so a later click on it (already the
    // native `document.activeElement`) fires no new 'focus' event at all,
    // leaving `focused` state stuck at whatever select() set it to.
    // Explicitly blurring it here keeps native focus state honest, so the
    // next click properly re-fires onFocus and reopens the dropdown.
    inputRef.current?.blur();
  };

  return (
    <div className="relative min-w-0">
      <input
        ref={inputRef}
        className={className}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setHighlight(0);
        }}
        onFocus={() => {
          if (blurTimer.current) clearTimeout(blurTimer.current);
          setFocused(true);
        }}
        onBlur={() => {
          // Deferred so a click on a suggestion still registers (via
          // onMouseDown, before this fires) rather than the dropdown
          // unmounting out from under the click.
          blurTimer.current = setTimeout(() => setFocused(false), 120);
        }}
        onKeyDown={(e) => {
          if (!showDropdown) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, rows.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            select(rows[highlight]);
          } else if (e.key === 'Escape') {
            setFocused(false);
          }
        }}
      />
      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-auto rounded-md border border-solace-green/30 bg-solace-blue-dark py-1 font-mono text-[11px] text-white shadow-lg">
          {rows.map((topic, i) => (
            <button
              key={topic}
              type="button"
              className={`block w-full truncate px-2 py-1 text-left ${
                i === highlight ? 'bg-white/10' : ''
              } ${topic === wildcard ? 'text-solace-blue-sky' : 'text-white/80'} hover:bg-white/10`}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => {
                // mousedown (not click) so it fires before the input's blur.
                e.preventDefault();
                if (blurTimer.current) clearTimeout(blurTimer.current);
                select(topic);
              }}
            >
              {topic}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
