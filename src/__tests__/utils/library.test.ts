import { folderDestinations, folderPath, validDays, canGroupVersions } from '@/utils/library';

const tree = [{id: 1, name: 'First', children: [{id: 2, name: 'Inner', children: [{id: 3, name: 'Deep', external_readonly: true}]}]}, {id: 4, name: 'Other'}];

test('nested destinations and breadcrumb paths include another branch at arbitrary depth', () => {
  expect(folderDestinations(tree)).toEqual([
    {id: 1, name: 'First', readonly: false},
    {id: 2, name: 'First / Inner', readonly: false},
    {id: 3, name: 'First / Inner / Deep', readonly: true},
    {id: 4, name: 'Other', readonly: false},
  ]);
  expect(folderPath(tree, 3)).toEqual([{id: 1, name: 'First'}, {id: 2, name: 'Inner'}, {id: 3, name: 'Deep'}]);
  expect(folderPath(tree, 99)).toBeNull();
});

test('custom purge ages accept arbitrary whole days but reject empty, fractional and out-of-policy values', () => {
  expect(validDays('47')).toBe(47);
  for (const value of ['', '0', '-1', '1.5', '4e2', '3651']) expect(validDays(value)).toBeNull();
  expect(validDays('366', 1, 365)).toBeNull();
  expect(validDays('6', 7)).toBeNull();
});

test('versions require distinct known printer models, sliced inputs and no existing group', () => {
  const files = [{file_type: 'gcode.3mf', sliced_for_model: 'P1S'}, {file_type: 'gcode', sliced_for_model: 'X1C'}];
  expect(canGroupVersions(files)).toBe(true);
  expect(canGroupVersions([files[0]])).toBe(false);
  expect(canGroupVersions([files[0], {...files[1], variant_group_id: 2}])).toBe(false);
  expect(canGroupVersions([files[0], {...files[1], sliced_for_model: 'p1s'}])).toBe(false);
  expect(canGroupVersions([files[0], {...files[1], file_type: '3mf'}])).toBe(false);
});
