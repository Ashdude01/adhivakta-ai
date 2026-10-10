import LibraryBrowser from '@/components/LibraryBrowser';
import { listLibrary } from '@/lib/data/library';

export const dynamic = 'force-dynamic';

export default async function LibraryPage() {
  const items = await listLibrary();

  return (
    <>
      <div className="page-head" style={{ marginBottom: 16 }}>
        <h1>Case & Draft Library</h1>
        <p>Judgments and practitioner-contributed drafts — search what lawyers actually filed, not just case law.</p>
      </div>

      <LibraryBrowser initialItems={items} />
    </>
  );
}
