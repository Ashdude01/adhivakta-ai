'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { IconUser, IconChevron, IconLogout } from '@/components/Icons';

/**
 * Profile dropdown shown in the sidebar footer. Replaces the old standalone
 * "Sign out" nav item: clicking the profile opens a menu with "Manage profile"
 * and "Sign out". Built with Tailwind utilities (bridged to the design tokens).
 */
export default function ProfileMenu({ collapsed = false }: { collapsed?: boolean }) {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const user = session?.user;
  const initials = (user?.name || 'AA')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const plan = (user as any)?.plan as string | undefined;

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-2 z-50 overflow-hidden rounded-xl border border-line bg-surface text-ink shadow-[var(--shadow-lg)]">
          <div className="border-b border-line px-3.5 py-3">
            <div className="truncate text-[13px] font-bold text-ink">{user?.name || 'Advocate'}</div>
            <div className="truncate text-[11.5px] text-muted">{user?.email || '—'}</div>
          </div>
          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-semibold text-ink transition-colors hover:bg-brand-soft hover:text-brand"
          >
            <IconUser width={16} height={16} /> Manage profile
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex w-full items-center gap-2.5 border-t border-line px-3.5 py-2.5 text-left text-[13px] font-semibold text-danger transition-colors hover:bg-danger-soft"
          >
            <IconLogout width={16} height={16} /> Sign out
          </button>
        </div>
      )}

      <button
        type="button"
        className="usercard"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={collapsed ? user?.name || 'Profile' : undefined}
      >
        <div className="avatar">{initials}</div>
        {!collapsed && (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="un truncate">{user?.name || 'Advocate'}</div>
              <div className="ur">Solo Practice{plan ? ` · ${plan[0].toUpperCase()}${plan.slice(1)}` : ''}</div>
            </div>
            <IconChevron
              width={15}
              height={15}
              style={{ color: 'var(--sidebar-faint)', transform: open ? 'rotate(-90deg)' : 'rotate(90deg)', transition: '.15s' }}
            />
          </>
        )}
      </button>
    </div>
  );
}
