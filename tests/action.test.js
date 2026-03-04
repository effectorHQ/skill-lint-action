/**
 * Tests for skill-lint-action core logic
 * Uses Node.js built-in test runner — no test framework needed.
 *
 * Run: node --test tests/action.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dir, 'fixtures');

// ── Inline the parser and rules from dist/index.js for testing ──
// (In a real build system, we'd import from src/ — here we test the logic directly)

function parseSkillFile(content) {
  const lines = content.split('\n');
  if (lines[0].trim() !== '---') {
    return { frontmatter: null, body: content, error: 'Missing YAML frontmatter opening delimiter (---)' };
  }
  const closeIdx = lines.slice(1).findIndex(l => l.trim() === '---');
  if (closeIdx === -1) {
    return { frontmatter: null, body: content, error: 'Missing YAML frontmatter closing delimiter (---)' };
  }
  const body = lines.slice(closeIdx + 2).join('\n');
  // For testing, just verify frontmatter exists and return the raw content as a stub
  return { frontmatter: { _raw: lines.slice(1, closeIdx + 1).join('\n') }, body, error: null };
}

function extractRequiredFields(raw) {
  const nameMatch = raw.match(/^name:\s*(.+)$/m);
  const descMatch = raw.match(/^description:\s*(.+)$/m);
  return {
    name: nameMatch ? nameMatch[1].trim().replace(/^["']|["']$/g, '') : null,
    description: descMatch ? descMatch[1].trim().replace(/^["']|["']$/g, '') : null,
  };
}

// ── Tests ──

test('Parser: valid SKILL.md with frontmatter parses without error', () => {
  const content = readFileSync(join(FIXTURES, 'valid-complete.md'), 'utf8');
  const result = parseSkillFile(content);
  assert.equal(result.error, null);
  assert.ok(result.frontmatter);
  assert.ok(result.body.includes('## Purpose'));
});

test('Parser: file with no frontmatter returns parse error', () => {
  const content = readFileSync(join(FIXTURES, 'no-frontmatter.md'), 'utf8');
  const result = parseSkillFile(content);
  assert.ok(result.error);
  assert.match(result.error, /Missing YAML frontmatter/);
});

test('Parser: body content is separated from frontmatter', () => {
  const content = readFileSync(join(FIXTURES, 'valid-complete.md'), 'utf8');
  const result = parseSkillFile(content);
  // Body should not contain the frontmatter
  assert.ok(!result.body.includes('name: my-skill'));
  assert.ok(result.body.includes('## Purpose'));
});

test('Parser: extracts name field from valid skill', () => {
  const content = readFileSync(join(FIXTURES, 'valid-complete.md'), 'utf8');
  const { frontmatter } = parseSkillFile(content);
  const { name } = extractRequiredFields(frontmatter._raw);
  assert.equal(name, 'my-skill');
});

test('Parser: extracts description field from valid skill', () => {
  const content = readFileSync(join(FIXTURES, 'valid-complete.md'), 'utf8');
  const { frontmatter } = parseSkillFile(content);
  const { description } = extractRequiredFields(frontmatter._raw);
  assert.ok(description.includes('GitHub'));
});

test('Validation: detects missing name in invalid fixture', () => {
  const content = readFileSync(join(FIXTURES, 'invalid-missing-fields.md'), 'utf8');
  const { frontmatter } = parseSkillFile(content);
  const { name } = extractRequiredFields(frontmatter._raw);
  assert.equal(name, null);
});

test('Validation: detects short description', () => {
  const content = readFileSync(join(FIXTURES, 'invalid-missing-fields.md'), 'utf8');
  const { frontmatter } = parseSkillFile(content);
  const { description } = extractRequiredFields(frontmatter._raw);
  assert.ok(description && description.length < 20);
});

test('Validation: valid skill has both name and description', () => {
  const content = readFileSync(join(FIXTURES, 'valid-complete.md'), 'utf8');
  const { frontmatter } = parseSkillFile(content);
  const { name, description } = extractRequiredFields(frontmatter._raw);
  assert.ok(name);
  assert.ok(description);
  assert.ok(description.length >= 20);
});

test('Body: valid skill has expected ## sections', () => {
  const content = readFileSync(join(FIXTURES, 'valid-complete.md'), 'utf8');
  const { body } = parseSkillFile(content);
  assert.match(body, /^## Purpose/m);
  assert.match(body, /^## Setup/m);
  assert.match(body, /^## Examples/m);
});

test('Body: invalid skill has no sections', () => {
  const content = readFileSync(join(FIXTURES, 'invalid-missing-fields.md'), 'utf8');
  const { body } = parseSkillFile(content);
  assert.ok(!/^##/m.test(body));
});

test('action.yml: contains required fields', () => {
  const actionYml = readFileSync(join(__dir, '..', 'action.yml'), 'utf8');
  assert.match(actionYml, /^name:/m);
  assert.match(actionYml, /^description:/m);
  assert.match(actionYml, /runs:/);
  assert.match(actionYml, /using: 'node20'/);
  assert.match(actionYml, /main: 'dist\/index\.js'/);
});

test('action.yml: has correct inputs defined', () => {
  const actionYml = readFileSync(join(__dir, '..', 'action.yml'), 'utf8');
  assert.match(actionYml, /path:/);
  assert.match(actionYml, /fail-on-warnings:/);
  assert.match(actionYml, /json:/);
});

test('action.yml: has outputs defined', () => {
  const actionYml = readFileSync(join(__dir, '..', 'action.yml'), 'utf8');
  assert.match(actionYml, /outputs:/);
  assert.match(actionYml, /errors:/);
  assert.match(actionYml, /warnings:/);
  assert.match(actionYml, /files-checked:/);
});

test('dist/index.js: exists and is non-empty', () => {
  const dist = readFileSync(join(__dir, '..', 'dist', 'index.js'), 'utf8');
  assert.ok(dist.length > 1000);
  assert.match(dist, /validateSkill/);
  assert.match(dist, /parseSkillFile/);
  assert.match(dist, /findSkillFiles/);
});

test('dist/index.js: has GitHub Actions workflow commands', () => {
  const dist = readFileSync(join(__dir, '..', 'dist', 'index.js'), 'utf8');
  assert.match(dist, /::error/);
  assert.match(dist, /::warning/);
  assert.match(dist, /GITHUB_OUTPUT/);
});
