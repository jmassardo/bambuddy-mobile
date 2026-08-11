'use strict';

const fs = require('node:fs');
const path = require('node:path');

const changelogPath = path.resolve(__dirname, '..', '..', 'CHANGELOG.md');
const changelog = fs.readFileSync(changelogPath, 'utf8');

function getUnreleasedSection() {
  const match = changelog.match(/^## \[Unreleased\]\n([\s\S]*?)\n## \[/m);

  expect(match).not.toBeNull();
  return match[1].trim();
}

function getEntries(heading) {
  const unreleasedSection = getUnreleasedSection();
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = unreleasedSection.match(
    new RegExp(`^### ${escapedHeading}\\n\\n([\\s\\S]*?)(?=\\n### |$)`, 'm'),
  );

  expect(match).not.toBeNull();
  return match[1]
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

describe('CHANGELOG unreleased section', () => {
  test('documents the restored iOS camera outcome as a single fixed entry', () => {
    const unreleasedSection = getUnreleasedSection();
    const cameraEntries = getEntries('Fixed').filter(
      (entry) =>
        entry.includes('#139') || entry.includes('#142') || entry.includes('#144'),
    );

    expect(cameraEntries).toEqual([
      '- Restore authenticated iOS camera streams in the mobile app (#139, #142, #144)',
    ]);
    expect((unreleasedSection.match(/#139/g) || []).length).toBe(1);
    expect((unreleasedSection.match(/#142/g) || []).length).toBe(1);
    expect((unreleasedSection.match(/#144/g) || []).length).toBe(1);
  });

  test('documents the security audit remediation as a single security entry', () => {
    const unreleasedSection = getUnreleasedSection();
    const securityEntries = getEntries('Security').filter((entry) =>
      entry.includes('#145'),
    );

    expect(securityEntries).toEqual([
      '- Update vulnerable dependencies identified by the repository security audit (#145)',
    ]);
    expect((unreleasedSection.match(/#145/g) || []).length).toBe(1);
  });

  test('does not create 1.1.1 release metadata before the release is cut', () => {
    expect(changelog).not.toContain('1.1.1');
  });
});
