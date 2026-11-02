import { request } from './http';
import type {
  FinanceBalance,
  FinanceCenter,
  FinanceLedger,
  FinanceMember,
  FinanceTransaction,
} from '@/types/api';

function write<T>(path: string, method: string, body?: unknown) {
  return request<T>(`/finance${path}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

export const financeApi = {
  balance: () => request<FinanceBalance>('/finance/me/balance'),
  userBalance: (id: number) =>
    request<FinanceBalance>(`/finance/users/${id}/balance`),
  users: () => request<Array<{ id: number; username: string }>>('/users/slim'),
  centers: (admin: boolean) =>
    request<FinanceCenter[]>(
      `/finance/cost-centers${admin ? '?include_inactive=true' : '/mine'}`,
    ),
  center: (id: number) =>
    request<FinanceCenter & { members: FinanceMember[] }>(
      `/finance/cost-centers/${id}`,
    ),
  ledger: (admin: boolean, offset = 0, userId?: number) =>
    request<FinanceLedger>(
      `/finance/${
        admin ? 'transactions' : 'me/transactions'
      }?limit=50&offset=${offset}${
        admin && userId !== undefined ? `&user_id=${userId}` : ''
      }`,
    ),
  createCenter: (data: {
    name: string;
    monthly_budget: number | null;
    total_budget: number | null;
  }) => write<FinanceCenter>('/cost-centers', 'POST', data),
  renameCenter: (id: number, name: string) =>
    write<FinanceCenter>(`/cost-centers/${id}`, 'PATCH', { name }),
  budgets: (
    id: number,
    data: { monthly_budget: number | null; total_budget: number | null },
  ) => write<FinanceCenter>(`/cost-centers/${id}/budgets`, 'PATCH', data),
  deleteCenter: (id: number) => write<void>(`/cost-centers/${id}`, 'DELETE'),
  member: (id: number, user_id: number, can_print: boolean) =>
    write<FinanceMember>(`/cost-centers/${id}/members`, 'POST', {
      user_id,
      can_print,
    }),
  removeMember: (id: number, userId: number) =>
    write<void>(`/cost-centers/${id}/members/${userId}`, 'DELETE'),
  adjust: (
    id: number,
    kind: 'deposit' | 'withdraw',
    data: {
      amount: number;
      cost_center_id: number | null;
      description: string;
    },
  ) =>
    write<{ transaction: FinanceTransaction; balance: FinanceBalance }>(
      `/users/${id}/${kind}`,
      'POST',
      data,
    ),
  edit: (
    id: number,
    data: {
      user_id: number;
      cost_center_id: number | null;
      amount: number;
      description: string;
    },
  ) => write<FinanceTransaction>(`/transactions/${id}`, 'PATCH', data),
  deleteTransaction: (id: number) =>
    write<void>(`/transactions/${id}`, 'DELETE'),
  manual: (data: {
    user_id: number;
    cost_center_id: number;
    amount: number;
    description: string;
    created_at: string;
  }) => write<FinanceTransaction>('/transactions/manual', 'POST', data),
  rebuild: () => write<{ status: string }>('/rebuild-balance-ledger', 'POST'),
};
