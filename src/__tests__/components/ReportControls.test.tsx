import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text } from 'react-native';
import {
  ReportRangeControls,
  reportRangeKey,
} from '@/components/reports/ReportRangeControls';
import { ReportLayout } from '@/components/reports/ReportLayout';
import { SectionCard } from '@/components/common/AppUI';

jest.mock('@/theme', () => ({
  useTheme: () => ({ colors: require('@/theme/tokens').colors.dark }),
}));
beforeEach(() => jest.clearAllMocks());

it('applies and persists a validated custom range, never applying invalid dates', async () => {
  const onApply = jest.fn();
  const view = await render(
    <ReportRangeControls
      value="30d"
      scope={{ dateFrom: '2026-01-01', dateTo: '2026-01-30' }}
      onApply={onApply}
    />,
  );
  expect(view.getByText('30 Days · 2026-01-01 – 2026-01-30')).toBeTruthy();
  expect(view.queryByRole('button', { name: 'Custom dates' })).toBeNull();
  await fireEvent.press(view.getByRole('button', { name: 'Report timeframe' }));
  await fireEvent.press(view.getByRole('button', { name: 'Custom dates' }));
  await fireEvent.changeText(
    view.getByLabelText('From (YYYY-MM-DD)'),
    '2026-02-31',
  );
  await fireEvent.changeText(
    view.getByLabelText('To (YYYY-MM-DD)'),
    '2026-03-01',
  );
  await fireEvent.press(view.getByRole('button', { name: 'Apply dates' }));
  expect(onApply).not.toHaveBeenCalled();
  expect(
    view.getByText('Enter valid dates with From on or before To'),
  ).toBeTruthy();
  await fireEvent.changeText(
    view.getByLabelText('From (YYYY-MM-DD)'),
    '2026-02-01',
  );
  await fireEvent.press(view.getByRole('button', { name: 'Apply dates' }));
  expect(onApply).toHaveBeenCalledWith('custom', {
    dateFrom: '2026-02-01',
    dateTo: '2026-03-01',
  });
  expect(AsyncStorage.setItem).toHaveBeenCalledWith(
    reportRangeKey,
    JSON.stringify({
      range: 'custom',
      dateFrom: '2026-02-01',
      dateTo: '2026-03-01',
    }),
  );
  await view.rerender(
    <ReportRangeControls
      value="custom"
      scope={{ dateFrom: '2026-02-01', dateTo: '2026-03-01' }}
      onApply={onApply}
    />,
  );
  expect(view.queryByRole('button', { name: 'Apply dates' })).toBeNull();
  expect(view.getByText('Custom dates · 2026-02-01 – 2026-03-01')).toBeTruthy();
});

it('discloses all presets, then applies and collapses a selected timeframe', async () => {
  const onApply = jest.fn();
  const view = await render(<ReportRangeControls value="30d" scope={{}} onApply={onApply} />);
  await fireEvent.press(view.getByRole('button', { name: 'Report timeframe' }));
  expect(view.getByRole('button', { name: '30 Days' }).props.accessibilityState.selected).toBe(true);
  await fireEvent.press(view.getByRole('button', { name: '7 Days' }));
  expect(onApply).toHaveBeenCalledWith('7d', undefined);
  expect(view.queryByRole('button', { name: '7 Days' })).toBeNull();
});

it('persists reordering/hiding, restores hidden reports and resets the layout', async () => {
  const view = await render(
    <ReportLayout summaries={{ A: 'A total 10', B: 'B total 20' }}>
      <SectionCard title="A">
        <Text>A data</Text>
      </SectionCard>
      <SectionCard title="B">
        <Text>B data</Text>
      </SectionCard>
    </ReportLayout>,
  );
  await waitFor(() =>
    expect(
      view.getByRole('button', { name: 'Customize reports' }),
    ).not.toBeDisabled(),
  );
  await fireEvent.press(
    view.getByRole('button', { name: 'Customize reports' }),
  );
  await fireEvent.press(view.getAllByRole('button', { name: 'Move down' })[0]);
  await fireEvent.press(
    view.getAllByRole('button', { name: 'Hide report' })[0],
  );
  expect(view.queryByText('B data')).toBeNull();
  await fireEvent.press(
    view.getByRole('button', { name: 'Restore hidden reports' }),
  );
  expect(view.getByText('B data')).toBeTruthy();
  await fireEvent.press(
    view.getAllByRole('button', { name: 'Compact summary' })[0],
  );
  expect(view.getByText('B total 20')).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: 'Reset layout' }));
  expect(view.getByText('B data')).toBeTruthy();
  expect(AsyncStorage.setItem).toHaveBeenLastCalledWith(
    'statistics-layout-v2',
    JSON.stringify([
      { id: 'A', hidden: false, compact: false },
      { id: 'B', hidden: false, compact: false },
    ]),
  );
});
