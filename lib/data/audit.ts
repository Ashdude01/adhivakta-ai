import 'server-only';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import type { DbAuditLog } from '@/lib/supabase/types';

/**
 * Append-only audit trail (DPDP / plan §10.1). Best-effort by design: an audit
 * failure must never break the user action, but it is always logged server-side.
 */
export async function audit(entry: {
  userId?: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  ip?: string | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    const sb = createSupabaseAdmin();
    const { error } = await sb.from('audit_logs').insert({
      user_id: entry.userId ?? null,
      action: entry.action,
      entity: entry.entity ?? null,
      entity_id: entry.entityId ?? null,
      ip: entry.ip ?? null,
      meta: entry.meta ?? null,
    });
    if (error) throw error;
  } catch (err) {
    console.error(`audit write failed (${entry.action}):`, (err as Error).message);
  }
}

export async function listAudit(userId: string, limit = 50): Promise<DbAuditLog[]> {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('audit_logs')
    .select('*')
    .eq('user_id', userId)
    .order('at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as DbAuditLog[]) ?? [];
}

export async function recordConsent(userId: string, purpose: string, granted = true, version = 'v1'): Promise<void> {
  try {
    const sb = createSupabaseAdmin();
    const { error } = await sb.from('consents').insert({ user_id: userId, purpose, granted, version });
    if (error) throw error;
  } catch (err) {
    console.error(`consent write failed (${purpose}):`, (err as Error).message);
  }
}
