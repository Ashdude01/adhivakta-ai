'use client';

import { useEffect, useState, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import InstallPrompt from './InstallPrompt';
import ProfileMenu from './ProfileMenu';
import {
  IconGrid, IconPen, IconDoc, IconBook, IconSign, IconFolder, IconSettings,
  IconSearch, IconBell, IconPlus, IconSidebar,
} from './Icons';

const NAV = [
  { group: 'Workspace', items: [
    { href: '/dashboard', label: 'Dashboard', icon: IconGrid },
    { href: '/draft', label: 'AI Drafting', icon: IconPen },
    { href: '/review', label: 'Review & Chat', icon: IconDoc },
    { href: '/library', label: 'Case Library', icon: IconBook, badge: '2.1M' },
    { href: '/esign', label: 'e-Signature', icon: IconSign, badge: '3' },
  ]},
  { group: 'Practice', items: [
    { href: '/matters', label: 'My Matters', icon: IconFolder },
    { href: '/settings', label: 'Settings', icon: IconSettings },
  ]},
];

const COLLAPSE_KEY = 'adhivakta-sidebar-collapsed';

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);          // mobile drawer
  const [collapsed, setCollapsed] = useState(false); // desktop icon-rail

  // Restore the desktop collapsed preference.
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch {}
  }, []);

  // The topbar button toggles the drawer on mobile and the rail on desktop.
  function toggleSidebar() {
    const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 820px)').matches;
    if (isMobile) {
      setOpen((o) => !o);
    } else {
      setCollapsed((c) => {
        const next = !c;
        try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0'); } catch {}
        return next;
      });
    }
  }

  return (
    <div className="shell">
      <div className={`backdrop ${open ? 'show' : ''}`} onClick={() => setOpen(false)} />

      <aside className={`sidebar ${open ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`}>
        <div className="brand">
          <div className="logo">अ</div>
          <div className="brand-text">
            <div className="bt">Adhivakta AI</div>
            <div className="bs">Legal Workspace</div>
          </div>
        </div>

        {NAV.map((g) => (
          <div key={g.group}>
            <div className="nav-label">{g.group}</div>
            {g.items.map((it) => {
              const Icon = it.icon;
              const active = pathname === it.href;
              return (
                <Link key={it.href} href={it.href} onClick={() => setOpen(false)}
                  title={collapsed ? it.label : undefined}
                  className={`nav-item ${active ? 'active' : ''}`}>
                  <Icon /> <span className="nav-text">{it.label}</span>
                  {it.badge && <span className="badge">{it.badge}</span>}
                </Link>
              );
            })}
          </div>
        ))}

        <div className="side-foot">
          <ProfileMenu collapsed={collapsed} />
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <button className="tb-btn" onClick={toggleSidebar} aria-label="Toggle sidebar">
            <IconSidebar />
          </button>
          <div className="search">
            <IconSearch />
            <span className="ph-long">Search cases, drafts, sections or ask AI…</span>
            <span className="kbd" style={{ marginLeft: 'auto' }}>⌘K</span>
          </div>
          <button className="tb-btn" aria-label="Notifications"><IconBell /><span className="dot" /></button>
          <Link href="/draft" className="cta brand"><IconPlus /> New Draft</Link>
        </div>

        <div className="content scroll">{children}</div>
      </div>

      <InstallPrompt />
    </div>
  );
}
