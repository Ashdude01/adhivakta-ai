'use client';

import { useEffect, useState } from 'react';

export interface ModelOption { id: string; label: string; tier: 'free' | 'paid' }
export interface ProviderInfo {
  id: string; label: string; models: ModelOption[]; defaultModel: string; active: boolean;
}

export interface Selection { provider: string; model: string }

/**
 * Lets the advocate pick which LLM writes the draft.
 *
 * The options come from the server, which lists only the providers whose API
 * key is actually present in the environment — so a model that cannot run is
 * never offered, and the keys themselves never reach the browser.
 */
export default function ModelPicker({ value, onChange }: {
  value: Selection | null;
  onChange: (s: Selection) => void;
}) {
  const [providers, setProviders] = useState<ProviderInfo[] | null>(null);

  useEffect(() => {
    fetch('/api/ai/models')
      .then((r) => r.json())
      .then((d) => {
        const list: ProviderInfo[] = d.providers ?? [];
        setProviders(list);
        if (!value) {
          const active = list.find((p) => p.active) ?? list[0];
          if (active) onChange({ provider: active.id, model: active.defaultModel });
        }
      })
      .catch(() => setProviders([]));
    // Runs once: the environment cannot change while the page is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!providers) return <div className="muted" style={{ fontSize: 12.5 }}>Loading models…</div>;

  if (providers.length === 0) {
    return <div className="muted" style={{ fontSize: 12.5 }}>No AI provider configured.</div>;
  }

  const onlyDemo = providers.length === 1 && providers[0].id === 'mock';
  const current = providers.find((p) => p.id === value?.provider) ?? providers[0];

  return (
    <div className="field">
      <label>AI model</label>
      {/* Not `.split` — that is a page-level 360px/1fr grid and would crush the
          second select inside this narrow panel. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <select
          value={current.id}
          onChange={(e) => {
            const next = providers.find((p) => p.id === e.target.value)!;
            onChange({ provider: next.id, model: next.defaultModel });
          }}
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>{p.label}{p.active ? ' (default)' : ''}</option>
          ))}
        </select>
        <select
          value={value?.model ?? current.defaultModel}
          onChange={(e) => onChange({ provider: current.id, model: e.target.value })}
          disabled={current.models.length < 2}
        >
          {current.models.map((m) => (
            <option key={m.id} value={m.id}>{m.label}{m.tier === 'paid' ? ' · paid' : ''}</option>
          ))}
        </select>
      </div>
      {onlyDemo && (
        <small className="muted">
          Running offline templates. Add a provider key to <code>.env.local</code> for real AI drafting.
        </small>
      )}
    </div>
  );
}
