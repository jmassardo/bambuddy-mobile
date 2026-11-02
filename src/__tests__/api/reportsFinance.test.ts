import { request } from '@/api/http';
import { financeApi } from '@/api/finance';
import { reportsApi } from '@/api/reports';

jest.mock('@/api/http', () => ({ request: jest.fn() }));
const mockRequest = jest.mocked(request);

beforeEach(() => mockRequest.mockReset());

it('pages the entire event history and applies only supported server filters', async () => {
  mockRequest
    .mockResolvedValueOnce(
      Array.from({ length: 10000 }, () => ({ printer_id: 1 })),
    )
    .mockResolvedValueOnce([{ printer_id: 2, print_name: 'Older run' }]);
  const result = await reportsApi.events({
    dateFrom: '2026-01-01',
    dateTo: '2026-03-01',
    printerId: 2,
    createdById: -1,
  });
  expect(result).toEqual([{ printer_id: 2, print_name: 'Older run' }]);
  expect(mockRequest.mock.calls[0][0]).toContain('created_by_id=-1');
  expect(mockRequest.mock.calls[1][0]).toContain('offset=10000');
  expect(mockRequest.mock.calls[1][0]).toContain('date_to=2026-03-01');
  expect(mockRequest.mock.calls[0][0]).not.toContain('printer_id');
});

it('keeps point-in-time stock on aggregate endpoints and passes dates for usage', async () => {
  mockRequest.mockResolvedValue([]);
  await reportsApi.purchasing('material-numbers', {
    dateFrom: '2026-01-01',
    dateTo: '2026-02-01',
    printerId: 1,
  });
  expect(mockRequest).toHaveBeenCalledWith(
    '/inventory/stats/material-numbers?date_from=2026-01-01&date_to=2026-02-01',
  );
});

it('sends explicit null budget clearing and center clearing for ledger corrections', async () => {
  mockRequest.mockResolvedValue({});
  await financeApi.budgets(2, { monthly_budget: 0, total_budget: null });
  expect(mockRequest).toHaveBeenCalledWith('/finance/cost-centers/2/budgets', {
    method: 'PATCH',
    body: JSON.stringify({ monthly_budget: 0, total_budget: null }),
  });
  await financeApi.edit(3, {
    user_id: 5,
    cost_center_id: null,
    amount: -2,
    description: '',
  });
  expect(mockRequest).toHaveBeenLastCalledWith('/finance/transactions/3', {
    method: 'PATCH',
    body: JSON.stringify({
      user_id: 5,
      cost_center_id: null,
      amount: -2,
      description: '',
    }),
  });
});

it('never sends unsupported filters or another user to the personal ledger', async () => {
  mockRequest.mockResolvedValue({});
  await financeApi.ledger(false, 50, 7);
  expect(mockRequest).toHaveBeenCalledWith(
    '/finance/me/transactions?limit=50&offset=50',
  );
  await financeApi.ledger(true, 100, 7);
  expect(mockRequest).toHaveBeenLastCalledWith(
    '/finance/transactions?limit=50&offset=100&user_id=7',
  );
});
