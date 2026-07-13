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
        <div className="usermenu">
          {/* The name is already in the trigger just below, so the menu shows
              only the email as context, then the actions — no duplication. */}
          <div className="usermenu-head">
            <div className="usermenu-cap">Signed in as</div>
            <div className="usermenu-email">{user?.email || '—'}</div>
          </div>
          <Link href="/profile" onClick={() => setOpen(false)} className="usermenu-item">
            <IconUser width={16} height={16} /> Manage profile
          </Link>
          <button onClick={() => signOut({ callbackUrl: '/login' })} className="usermenu-item danger">
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
