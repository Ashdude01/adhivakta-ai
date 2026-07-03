import { redirect } from 'next/navigation';
import { currentUserId } from '@/lib/session';
import { getUserById } from '@/lib/data/users';
import ProfileForm from '@/components/ProfileForm';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const userId = await currentUserId();
  if (!userId) redirect('/login');
  const user = await getUserById(userId);
  if (!user) redirect('/login');

  const { password_hash, ...safe } = user;
  return <ProfileForm user={safe} />;
}
