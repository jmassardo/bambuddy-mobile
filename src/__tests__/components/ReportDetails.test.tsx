import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  AccuracyReport,
  PurchasingReports,
} from '@/components/reports/ReportDetails';
import { reportsApi } from '@/api/reports';

jest.mock('@/theme', () => ({
  useTheme: () => ({ colors: require('@/theme/tokens').colors.dark }),
}));
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ hasPermission: () => true }),
}));
jest.mock('@/api/reports', () => ({
  reportsApi: { inventoryMode: jest.fn(), purchasing: jest.fn() },
}));
jest.mock('@/components/common/Charts', () => ({ SimpleBarChart: () => null }));
async function show(children: React.ReactNode) {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={cache}>{children}</QueryClientProvider>,
  );
}
beforeEach(() => jest.clearAllMocks());

it('does not query unsupported internal purchasing aggregates in Spoolman mode', async () => {
  jest.mocked(reportsApi.inventoryMode).mockResolvedValue(true);
  const view = await show(
    <PurchasingReports
      scope={{ dateFrom: '2026-01-01', dateTo: '2026-02-01' }}
      currency="EUR"
    />,
  );
  await waitFor(() => expect(reportsApi.inventoryMode).toHaveBeenCalled());
  await waitFor(() => expect(view.toJSON()).toBeNull());
  expect(reportsApi.purchasing).not.toHaveBeenCalled();
});

it('renders current stock beside date-scoped usage and errors are not mistaken for empty data', async () => {
  jest.mocked(reportsApi.inventoryMode).mockResolvedValue(false);
  jest.mocked(reportsApi.purchasing).mockImplementation(async kind => {
    if (kind === 'material-numbers')
      throw new Error('Purchasing permission denied');
    return [
      {
        supplier_id: 1,
        supplier_name: 'Supplier A',
        spool_count: 7,
        remaining_g: 2500,
        consumed_g: 300,
        cost: 5,
      },
    ];
  });
  const scope = { dateFrom: '2026-01-01', dateTo: '2026-02-01' };
  const view = await show(<PurchasingReports scope={scope} currency="EUR" />);
  await waitFor(() =>
    expect(view.getByText(/Supplier A.*7.*300/)).toBeTruthy(),
  );
  expect(reportsApi.purchasing).toHaveBeenCalledWith('suppliers', scope);
  await waitFor(() =>
    expect(view.getByText('Purchasing permission denied')).toBeTruthy(),
  );
  expect(view.queryByText('No purchasing data')).toBeNull();
});

it('represents missing estimates explicitly instead of a zero-percent score', async () => {
  const view = await show(
    <AccuracyReport
      stats={{ average_time_accuracy: null }}
      printerNames={{}}
    />,
  );
  expect(
    view.getByText(
      'No time accuracy data. Prints without estimates are excluded.',
    ),
  ).toBeTruthy();
  expect(view.queryByText(/0\.0%/)).toBeNull();
});
