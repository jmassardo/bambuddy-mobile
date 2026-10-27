import React, { useState } from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { ProcessSettingsEditor } from '@/components/slicing/ProcessSettingsEditor';
import type { SettingValue } from '@/types/slicerSettings';
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: new Proxy({}, { get: () => '#888888' }) }) }));

describe('Typed process settings editor', () => {
  it('adopts designer values, enables dependent fields, validates edits and reverts without losing source choices', async () => {
    const changed = jest.fn();
    const selected = jest.fn();
    const valid = jest.fn();
    function Harness() {
      const [values, setValues] = useState<Record<string, SettingValue>>({});
      const [keys, setKeys] = useState<string[]>([]);
      return <ProcessSettingsEditor values={values} onChange={v => { changed(v); setValues(v); }}
        presetValues={{ enable_support: '0', support_threshold_angle: '30' }}
        source={[{ key: 'enable_support', value: '1', printer_coupled: false, preset_defining: false }, { key: 'layer_height', value: '0.1', printer_coupled: false, preset_defining: true }]}
        sourceKeys={keys} onSourceKeys={v => { selected(v); setKeys(v); }} onValidityChange={valid} />;
    }
    const ui = await render(<Harness />);
    await fireEvent.press(ui.getByText('Page: Quality'));
    await fireEvent.press(ui.getByText('Support'));
    await waitFor(() => expect(ui.getByLabelText('Threshold angle').props.editable).toBe(false));
    await fireEvent.press(ui.getByText('Use designer settings'));
    expect(selected).toHaveBeenLastCalledWith(['enable_support']);
    await waitFor(() => expect(ui.getByLabelText('Threshold angle').props.editable).toBe(true));
    await fireEvent.changeText(ui.getByLabelText('Threshold angle'), '9999');
    expect(valid).toHaveBeenLastCalledWith(false);
    await fireEvent.changeText(ui.getByLabelText('Threshold angle'), '45');
    expect(changed).toHaveBeenLastCalledWith({ support_threshold_angle: '45' });
    expect(valid).toHaveBeenLastCalledWith(true);
    await fireEvent.press(ui.getByText('Reset Threshold angle'));
    expect(changed).toHaveBeenLastCalledWith({});
    expect(selected).toHaveBeenLastCalledWith(['enable_support']);
    await fireEvent.press(ui.getByText('Clear all source settings'));
    expect(selected).toHaveBeenLastCalledWith([]);
  });
  it('searches advanced fields across all six pages and displays preset values instead of schema defaults', async () => {
    const ui = await render(<ProcessSettingsEditor values={{}} onChange={jest.fn()} sourceKeys={[]} onSourceKeys={jest.fn()} presetValues={{ line_width: '0.42' }} />);
    await fireEvent.changeText(ui.getByLabelText('Search every process setting'), 'line_width');
    expect(ui.getByLabelText('Default').props.value).toBe('0.42');
    await fireEvent.changeText(ui.getByLabelText('Search every process setting'), 'support_threshold_angle');
    expect(ui.getByLabelText('Threshold angle')).toBeTruthy();
    await fireEvent.changeText(ui.getByLabelText('Search every process setting'), 'sparse_infill_density');
    expect(ui.getByLabelText('Sparse infill density')).toBeTruthy();
    await fireEvent.changeText(ui.getByLabelText('Search every process setting'), 'outer_wall_speed');
    expect(ui.getByLabelText('Outer wall')).toBeTruthy();
    await fireEvent.changeText(ui.getByLabelText('Search every process setting'), 'prime_tower');
    expect(ui.getAllByText(/Multimaterial/).length).toBeGreaterThan(0);
    await fireEvent.changeText(ui.getByLabelText('Search every process setting'), 'brim_width');
    expect(ui.getAllByLabelText('Brim width').length).toBeGreaterThan(0);
  });
});
