import 'server-only';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import type { DbUser } from '@/lib/supabase/types';

export type ProfileUpdate = Partial<
  Pick<DbUser, 'name' | 'firm_name' | 'phone' | 'bar_council_id' | 'avatar_url' | 'theme'>
>;

export async function getUserByEmail(email: string): Promise<DbUser | null> {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('users').select('*').eq('email', email).maybeSingle();
  if (error) throw error;
  return (data as DbUser) ?? null;
}

export async function getUserById(id: string): Promise<DbUser | null> {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('users').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as DbUser) ?? null;
}

export async function createUser(input: {
  name: string;
  email: string;
  passwordHash: string;
  role?: string;
}): Promise<DbUser> {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('users')
    .insert({
      name: input.name,
      email: input.email,
      password_hash: input.passwordHash,
      role: input.role ?? 'advocate',
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as DbUser;
}

export async function updateUserProfile(id: string, fields: ProfileUpdate): Promise<DbUser> {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('users')
    .update(fields)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as DbUser;
}
