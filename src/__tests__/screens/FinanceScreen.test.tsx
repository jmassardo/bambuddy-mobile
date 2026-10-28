import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FinanceScreen from '@/screens/FinanceScreen';
import { financeApi } from '@/api/finance';
import type {
  FinanceCenter,
  FinanceTransaction,
  Permission,
} from '@/types/api';
import { Alert } from 'react-native';

let mockPermissions: Permission[] = [];
let mockSignedIn = true;
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockSignedIn ? { id: 1 } : null,
    hasPermission: (permission: Permission) =>
      mockPermissions.includes(permission),
  }),
}));
jest.mock('@/theme', () => ({
  useTheme: () => ({ colors: require('@/theme/tokens').colors.dark }),
}));
jest.mock('@/api/reports', () => ({
  reportsApi: {
    flags: jest.fn(async () => ({ currency: 'EUR', billing_enabled: true })),
  },
}));
jest.mock('@/api/finance', () => ({
  financeApi: Object.fromEntries(
    [
      'balance',
      'centers',
      'center',
      'users',
      'ledger',
      'createCenter',
      'budgets',
      'renameCenter',
      'adjust',
      'manual',
      'edit',
      'deleteTransaction',
      'deleteCenter',
      'member',
      'removeMember',
    ].map(key => [key, jest.fn()]),
  ),
}));
const mocked = jest.mocked(financeApi);
const center: FinanceCenter = {
  id: 2,
  name: 'Private Alice',
  is_private: true,
  owner_user_id: 1,
  is_active: true,
  total_balance: 5,
  total_budget: null,
  monthly_budget: 10,
  budget_mode: 'monthly',
  budget_limit: 10,
  budget_used: 10,
  budget_available: 0,
  can_print: true,
};
async function show() {
  const cache = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  return render(
    <QueryClientProvider client={cache}>
      <FinanceScreen />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  mockSignedIn = true;
  mockPermissions = ['cost_centers:read_own'];
  mocked.balance.mockResolvedValue({
    user_id: 1,
    balance: 5,
    currency: 'EUR',
    updated_at: null,
  });
  mocked.centers.mockResolvedValue([center]);
  mocked.users.mockResolvedValue([{ id: 1, username: 'Alice' }]);
  mocked.ledger.mockResolvedValue({
    items: [],
    total: 0,
    limit: 50,
    offset: 0,
  });
  mocked.budgets.mockResolvedValue(center);
  mocked.adjust.mockResolvedValue({
    transaction: {} as FinanceTransaction,
    balance: { user_id: 1, balance: 7, currency: 'EUR', updated_at: null },
  });
  mocked.member.mockResolvedValue({
    id: 1,
    cost_center_id: 2,
    user_id: 1,
    can_print: false,
  });
  mocked.manual.mockResolvedValue({} as FinanceTransaction);
  mocked.edit.mockResolvedValue({} as FinanceTransaction);
});

it('denies access and does not request finance data without a signed-in permitted user', async () => {
  mockSignedIn = false;
  mockPermissions = ['cost_centers:modify', 'cost_centers:read_all'];
  const view = await show();
  expect(view.getByText(/Finance requires a signed-in account/)).toBeTruthy();
  expect(mocked.centers).not.toHaveBeenCalled();
  expect(mocked.ledger).not.toHaveBeenCalled();
});

it('shows own wallet without exposing administrative data or mutations', async () => {
  const view = await show();
  await waitFor(() => expect(view.getByText(/Wallet balance.*5/)).toBeTruthy());
  expect(mocked.centers).toHaveBeenCalledWith(false);
  expect(mocked.ledger).toHaveBeenCalledWith(false, 0, undefined);
  expect(mocked.users).not.toHaveBeenCalled();
  expect(view.queryByRole('button', { name: 'Administration' })).toBeNull();
  expect(view.queryByRole('button', { name: 'Deposit' })).toBeNull();
});

it('allows a create-only operator into administration without fetching the all-user ledger', async () => {
  mockPermissions = ['cost_centers:create'];
  const view = await show();
  await waitFor(() =>
    expect(view.getByText('Private Alice · Private · Active')).toBeTruthy(),
  );
  expect(view.getByRole('button', { name: 'Create cost center' })).toBeTruthy();
  expect(view.queryByRole('button', { name: 'Edit budget' })).toBeNull();
  expect(mocked.balance).not.toHaveBeenCalled();
  expect(mocked.ledger).not.toHaveBeenCalled();
});

it('edits zero budgets on private centers but never offers rename, membership or deletion', async () => {
  mockPermissions = ['cost_centers:modify'];
  const view = await show();
  await waitFor(() =>
    expect(view.getByRole('button', { name: 'Edit budget' })).toBeTruthy(),
  );
  expect(view.queryByRole('button', { name: 'Manage members' })).toBeNull();
  expect(view.queryByRole('button', { name: 'Delete cost center' })).toBeNull();
  await fireEvent.press(view.getByRole('button', { name: 'Edit budget' }));
  expect(view.queryByLabelText('Name')).toBeNull();
  await fireEvent.changeText(
    view.getByLabelText('Budget amount (0 blocks printing)'),
    '0',
  );
  await fireEvent.press(view.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(mocked.budgets).toHaveBeenCalledWith(2, {
      monthly_budget: 0,
      total_budget: null,
    }),
  );
  expect(mocked.renameCenter).not.toHaveBeenCalled();
});

it('validates wallet amounts before posting, then refreshes summaries after a deposit', async () => {
  mockPermissions = ['cost_centers:modify', 'users:read_slim'];
  const view = await show();
  await waitFor(() => expect(mocked.users).toHaveBeenCalled());
  await fireEvent.press(view.getByRole('button', { name: 'Deposit' }));
  await fireEvent.press(
    view.getAllByRole('button', { name: 'Alice' }).slice(-1)[0],
  );
  await fireEvent.changeText(
    view.getByLabelText('Amount greater than zero'),
    '0',
  );
  await fireEvent.press(view.getByRole('button', { name: 'Save' }));
  expect(view.getByText('Enter an amount greater than zero.')).toBeTruthy();
  expect(mocked.adjust).not.toHaveBeenCalled();
  await fireEvent.changeText(
    view.getByLabelText('Amount greater than zero'),
    '2.50',
  );
  await fireEvent.changeText(view.getByLabelText('Description'), 'Credit');
  await fireEvent.press(view.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(mocked.adjust).toHaveBeenCalledWith(1, 'deposit', {
      amount: 2.5,
      cost_center_id: null,
      description: 'Credit',
    }),
  );
  await waitFor(() =>
    expect(mocked.centers.mock.calls.length).toBeGreaterThan(1),
  );
});

it('filters transactions beyond the first server page and preserves partial-print status', async () => {
  mockPermissions = ['cost_centers:read_all'];
  const tx = {
    id: 1,
    user_id: 1,
    cost_center_id: 2,
    transaction_type: 'deposit',
    amount: 1,
    balance_after: 2,
    description: 'Credit',
    created_at: '2026-01-01T10:00:00Z',
  } satisfies FinanceTransaction;
  mocked.ledger.mockImplementation(async (_admin, offset = 0) => ({
    items:
      offset === 0
        ? Array.from({ length: 50 }, (_, index) => ({ ...tx, id: index + 1 }))
        : [
            {
              ...tx,
              id: 51,
              transaction_type: 'print_charge',
              description: 'Older [failed: 5m]',
            },
          ],
    total: 51,
    limit: 50,
    offset,
  }));
  const view = await show();
  await waitFor(() =>
    expect(mocked.ledger).toHaveBeenCalledWith(true, 50, undefined),
  );
  await fireEvent.press(view.getByRole('button', { name: 'print_charge' }));
  await waitFor(() =>
    expect(view.getByText('Older [failed: 5m]')).toBeTruthy(),
  );
  expect(view.getByText('Partial print: failed')).toBeTruthy();
  expect(view.getByText('1 / 1 · 1')).toBeTruthy();
});

it('manages shared-center print entitlement independently from account administration', async () => {
  mockPermissions = ['cost_centers:modify', 'users:read_slim'];
  const shared = { ...center, is_private: false, name: 'Team' };
  mocked.centers.mockResolvedValue([shared]);
  mocked.center.mockResolvedValue({
    ...shared,
    members: [{ id: 1, cost_center_id: 2, user_id: 1, can_print: true }],
  });
  const view = await show();
  await waitFor(() =>
    expect(view.getByRole('button', { name: 'Manage members' })).toBeTruthy(),
  );
  await fireEvent.press(view.getByRole('button', { name: 'Manage members' }));
  await waitFor(() =>
    expect(view.getByRole('button', { name: 'Edit entitlement' })).toBeTruthy(),
  );
  await fireEvent.press(view.getByRole('button', { name: 'Edit entitlement' }));
  await fireEvent(view.getByLabelText('Can print'), 'valueChange', false);
  await fireEvent.press(
    view.getByRole('button', { name: 'Add / update membership' }),
  );
  await waitFor(() => expect(mocked.member).toHaveBeenCalledWith(2, 1, false));
});

it('requires explicit user, center and zoned date before recording a manual charge', async () => {
  mockPermissions = ['cost_centers:modify', 'users:read_slim'];
  const view = await show();
  await waitFor(() => expect(mocked.users).toHaveBeenCalled());
  await fireEvent.press(
    view.getByRole('button', { name: 'Manual print charge' }),
  );
  await fireEvent.press(
    view.getAllByRole('button', { name: 'Alice' }).slice(-1)[0],
  );
  await fireEvent.changeText(
    view.getByLabelText('Amount greater than zero'),
    '4.20',
  );
  await fireEvent.press(view.getByRole('button', { name: 'Save' }));
  expect(mocked.manual).not.toHaveBeenCalled();
  expect(view.getByText('Select a cost center')).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: 'Private Alice' }));
  await fireEvent.changeText(
    view.getByLabelText('Charge date (ISO with timezone)'),
    '2026-03-01T10:00',
  );
  await fireEvent.press(view.getByRole('button', { name: 'Save' }));
  expect(view.getByText('Enter a valid ISO date with timezone')).toBeTruthy();
  await fireEvent.changeText(
    view.getByLabelText('Charge date (ISO with timezone)'),
    '2026-03-01T10:00:00Z',
  );
  await fireEvent.changeText(
    view.getByLabelText('Description'),
    'Manual replacement',
  );
  await fireEvent.press(view.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(mocked.manual).toHaveBeenCalledWith({
      user_id: 1,
      cost_center_id: 2,
      amount: 4.2,
      description: 'Manual replacement',
      created_at: '2026-03-01T10:00:00.000Z',
    }),
  );
});

it('clears a transaction center explicitly and confirms destructive ledger corrections', async () => {
  mockPermissions = [
    'cost_centers:modify',
    'cost_centers:read_all',
    'users:read_slim',
  ];
  mocked.ledger.mockResolvedValue({
    items: [
      {
        id: 3,
        user_id: 1,
        cost_center_id: 2,
        transaction_type: 'print_charge',
        amount: -2,
        balance_after: 3,
        description: 'Original charge',
        created_at: '2026-01-01T10:00:00Z',
      },
    ],
    total: 1,
    limit: 50,
    offset: 0,
  });
  const view = await show();
  await waitFor(() =>
    expect(view.getByRole('button', { name: 'Edit transaction' })).toBeTruthy(),
  );
  await fireEvent.press(view.getByRole('button', { name: 'Edit transaction' }));
  await fireEvent.press(view.getByRole('button', { name: 'No center' }));
  await fireEvent.changeText(view.getByLabelText('Signed amount'), '-3');
  await fireEvent.changeText(view.getByLabelText('Description'), 'Corrected');
  await fireEvent.press(view.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(mocked.edit).toHaveBeenCalledWith(3, {
      user_id: 1,
      cost_center_id: null,
      amount: -3,
      description: 'Corrected',
    }),
  );
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await waitFor(() =>
    expect(view.queryByRole('button', { name: 'Save' })).toBeNull(),
  );
  await fireEvent.press(
    view.getByRole('button', { name: 'Delete transaction' }),
  );
  expect(mocked.deleteTransaction).not.toHaveBeenCalled();
  await alert.mock.calls[0][2]![1].onPress?.();
  await waitFor(() => expect(mocked.deleteTransaction).toHaveBeenCalledWith(3));
  alert.mockRestore();
});

it('keeps the form open with actionable feedback when the server denies an adjustment', async () => {
  mockPermissions = ['cost_centers:modify', 'users:read_slim'];
  mocked.adjust.mockRejectedValue(new Error('Permission revoked (403)'));
  const view = await show();
  await waitFor(() => expect(mocked.users).toHaveBeenCalled());
  await fireEvent.press(view.getByRole('button', { name: 'Withdraw' }));
  await fireEvent.press(
    view.getAllByRole('button', { name: 'Alice' }).slice(-1)[0],
  );
  await fireEvent.changeText(
    view.getByLabelText('Amount greater than zero'),
    '1',
  );
  await fireEvent.press(view.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(view.getByText('Permission revoked (403)')).toBeTruthy(),
  );
  expect(view.getByRole('button', { name: 'Cancel' })).toBeTruthy();
});
