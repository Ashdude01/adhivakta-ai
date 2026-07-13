import { IconSpark } from '@/components/Icons';
import DraftWorkspace from '@/components/DraftWorkspace';

export default function DraftPage() {
  return (
    <>
      <div className="page-head">
        <div className="eyebrow"><IconSpark width={13} height={13} /> AI Drafting</div>
        <h1>Draft a legal document</h1>
        <p>Pick a matter — the AI already knows the parties and the facts. It writes as you watch, every citation verified, every version kept.</p>
      </div>
      <DraftWorkspace />
    </>
  );
}
