import type {
  Permission,
  FinanceCenter,
  FinanceTransaction,
} from '@/types/api';

export function financePermissions(
  has: (permission: Permission) => boolean,
  authenticated: boolean,
) {
  const own = authenticated && has('cost_centers:read_own');
  const all = authenticated && has('cost_centers:read_all');
  const create = authenticated && has('cost_centers:create');
  const modify = authenticated && has('cost_centers:modify');
  return {
    own,
    all,
    create,
    modify,
    admin: all || create || modify,
    access: own || all || create || modify,
  };
}

export function budgetPayload(mode: 'none' | 'monthly' | 'total', raw: string) {
  if (mode === 'none') return { monthly_budget: null, total_budget: null };
  if (!raw.trim() || !Number.isFinite(Number(raw)) || Number(raw) < 0) {
    throw new Error(
      'Enter a non-negative budget. Zero prevents printing; blank is not zero.',
    );
  }
  return {
    monthly_budget: mode === 'monthly' ? Number(raw) : null,
    total_budget: mode === 'total' ? Number(raw) : null,
  };
}

export function financeAmount(raw: string, signed = false) {
  if (
    !raw.trim() ||
    !Number.isFinite(Number(raw)) ||
    (!signed && Number(raw) <= 0)
  ) {
    throw new Error(
      signed
        ? 'Enter a finite signed amount.'
        : 'Enter an amount greater than zero.',
    );
  }
  return Number(raw);
}

export function partialCharge(description: string | null) {
  return (
    description
      ?.match(/\[(aborted|failed|cancelled):\s*([^\]]*)\]/i)?.[1]
      ?.toLowerCase() ?? null
  );
}

export function filterLedger(
  items: FinanceTransaction[],
  type: string,
  center: number | null,
) {
  return items.filter(
    tx =>
      (type === 'all' || tx.transaction_type === type) &&
      (center === null || tx.cost_center_id === center),
  );
}

export function centerCapabilities(center: FinanceCenter, modify: boolean) {
  return {
    budget: modify,
    rename: modify && !center.is_private,
    members: modify && !center.is_private,
    delete: modify && !center.is_private,
  };
}
