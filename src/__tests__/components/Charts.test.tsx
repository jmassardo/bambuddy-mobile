import React from 'react';
import { render } from '@testing-library/react-native';
import { MultiSeriesLineChart, SimpleBarChart } from '@/components/common/Charts';

jest.mock('@/theme', () => ({
  useTheme: () => ({ colors: require('@/theme/tokens').colors.light }),
}));

describe('accessible chart descriptions', () => {
  it.each([true, false])('keeps full bar labels and formatted values accessible (horizontal=%s)', async horizontal => {
    const ui = await render(<SimpleBarChart
      horizontal={horizontal}
      data={[{ label: 'Long spool name that would be truncated', value: 12.5 }]}
      formatValue={value => `${value} g`}
    />);
    expect(ui.getByRole('image', { name: 'Long spool name that would be truncated: 12.5 g' })).toBeTruthy();
  });

  it('describes line-series ranges without announcing missing or invalid samples', async () => {
    const ui = await render(<MultiSeriesLineChart
      points={[
        { label: '10:00', values: { actual: null } },
        { label: '10:01', values: { actual: 180 } },
        { label: '10:02', values: { actual: Number.NaN } },
        { label: '10:03', values: { actual: 210 } },
      ]}
      series={[{ key: 'actual', label: 'Nozzle', color: '#00AE42' }]}
    />);
    expect(ui.getByRole('image', { name: 'Nozzle: 180°–210°' })).toBeTruthy();
  });
});
