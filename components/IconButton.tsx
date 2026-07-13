'use client';

import type { ReactNode } from 'react';

/**
 * A square, icon-only action button.
 *
 * The visible glyph carries no text, so the label lives in `title` (hover
 * tooltip) and `aria-label` (screen readers) — both from the same string, so a
 * silent button is impossible. `danger` tints destructive actions red only on
 * hover, keeping the row calm until the user reaches for it.
 */
export default function IconButton({
  label, onClick, children, danger = false, disabled = false, href,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  href?: string;
}) {
  const className = `icon-btn${danger ? ' danger' : ''}`;
  const content = <span aria-hidden>{children}</span>;

  if (href) {
    return (
      <a className={className} href={href} title={label} aria-label={label}>
        {content}
      </a>
    );
  }
  return (
    <button type="button" className={className} title={label} aria-label={label}
      onClick={onClick} disabled={disabled}>
      {content}
    </button>
  );
}
