'use client';

import { useEffect, useState } from 'react';
import { IconDownload, IconX } from './Icons';

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<any>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferred(e);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!show) return null;

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    setShow(false);
    setDeferred(null);
  };

  return (
    <div className="proto-ribbon" style={{ gap: 10, paddingRight: 8 }}>
      <span />
      <span style={{ width: 'auto', height: 'auto', background: 'none' }}>Install Adhivakta AI</span>
      <button className="cta brand" style={{ padding: '6px 12px' }} onClick={install}>
        <IconDownload /> Install
      </button>
      <button onClick={() => setShow(false)} style={{ background: 'none', border: 'none', color: 'inherit', display: 'grid', placeItems: 'center' }}>
        <IconX width={14} height={14} />
      </button>
    </div>
  );
}
