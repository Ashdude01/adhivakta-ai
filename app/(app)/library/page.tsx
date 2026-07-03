import { IconBook } from '@/components/Icons';
import LibraryBrowser from '@/components/LibraryBrowser';
import { listLibrary } from '@/lib/data/library';

export const dynamic = 'force-dynamic';

export default async function LibraryPage() {
  const items = await listLibrary();

  return (
    <>
      <div className="page-head">
        <div className="eyebrow"><IconBook width={13} height={13} /> Case & Draft Library</div>
        <h1>Search judgments + real drafts</h1>
        <p>The only library with <b>practitioner-contributed drafts</b> — search what lawyers actually filed, not just case law. No AI key needed.</p>
      </div>

      <LibraryBrowser initialItems={items} />
    </>
  );
}
