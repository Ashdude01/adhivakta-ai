'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { IconSearch, IconFolder, IconX, IconChevron } from '@/components/Icons';

export interface MatterOption {
  id: string;
  title: string;
  code?: string | null;
  matter_type?: string | null;
  subtitle?: string | null;
}

/**
 * A searchable matter selector.
 *
 * A plain <select> is unusable once an advocate has more than a handful of
 * files — you cannot type "Sharma" and jump to it. This is a combobox: type to
 * filter across title, type and court, arrow to move, Enter to pick. Chosen by
 * value from the parent so a deep link (?matter=…) still lands on the matter.
 */
export default function MatterPicker({ matters, value, onChange }: {
  matters: MatterOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = matters.find((m) => m.id === value) ?? null;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return matters;
    return matters.filter((m) =>
      [m.title, m.matter_type, m.subtitle, m.code].filter(Boolean).join(' ').toLowerCase().includes(q));
  }, [matters, query]);

  // Close on an outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  useEffect(() => { setActive(0); }, [query]);

  function choose(id: string) {
    onChange(id);
    setOpen(false);
    setQuery('');
  }

  // The list has a leading "no matter" row, so option index N maps to results[N-1].
  const rowCount = results.length + 1;
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, rowCount - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (active === 0) choose('');
      else if (results[active - 1]) choose(results[active - 1].id);
    } else if (e.key === 'Escape') { setOpen(false); }
  }

  return (
    <div className="field" ref={rootRef} style={{ position: 'relative' }}>
      <label>Matter</label>

      <button type="button" className="matter-trigger" onClick={() => setOpen((o) => !o)}>
        <IconFolder width={15} height={15} style={{ flex: 'none', color: 'var(--muted)' }} />
        {selected ? (
          <span className="matter-trigger-label">
            <span style={{ fontWeight: 600 }}>{selected.title}</span>
            {selected.matter_type && <span className="muted" style={{ fontSize: 12 }}> · {selected.matter_type}</span>}
          </span>
        ) : (
          <span className="muted" style={{ flex: 1, textAlign: 'left' }}>No matter — a one-off draft</span>
        )}
        {selected && (
          <span role="button" aria-label="Clear matter" className="matter-clear"
            onClick={(e) => { e.stopPropagation(); choose(''); }}>
            <IconX width={13} height={13} />
          </span>
        )}
        <IconChevron width={14} height={14} style={{ flex: 'none', color: 'var(--muted)', transform: open ? 'rotate(90deg)' : 'none', transition: '.15s' }} />
      </button>

      {open && (
        <div className="matter-pop">
          <div className="matter-search">
            <IconSearch width={15} height={15} style={{ color: 'var(--muted)', flex: 'none' }} />
            <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown}
              placeholder="Search matters by name, type or court…" />
          </div>

          <div className="matter-list scroll">
            <button type="button" className={`matter-opt ${active === 0 ? 'active' : ''}`}
              onMouseEnter={() => setActive(0)} onClick={() => choose('')}>
              <span className="muted">No matter — a one-off draft</span>
            </button>

            {results.length === 0 && <div className="muted" style={{ padding: '10px 12px', fontSize: 13 }}>No matters match “{query}”.</div>}

            {results.map((m, i) => (
              <button type="button" key={m.id}
                className={`matter-opt ${active === i + 1 ? 'active' : ''} ${m.id === value ? 'chosen' : ''}`}
                onMouseEnter={() => setActive(i + 1)} onClick={() => choose(m.id)}>
                {m.code && <span className="matter-code">{m.code}</span>}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</span>
                  {(m.matter_type || m.subtitle) && (
                    <span className="muted" style={{ fontSize: 11.5, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.matter_type ?? m.subtitle}
                    </span>
                  )}
                </span>
                {m.id === value && <span style={{ color: 'var(--brand)' }}>✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
