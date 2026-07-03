import 'server-only';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export interface SessionUser {
  id: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  plan?: string | null;
}

/** The signed-in user (id + claims) from the JWT session, or null. */
export async function currentUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  const u = session?.user as any;
  if (!u?.id) return null;
  return { id: u.id, name: u.name, email: u.email, role: u.role, plan: u.plan };
}

export async function currentUserId(): Promise<string | null> {
  return (await currentUser())?.id ?? null;
}
