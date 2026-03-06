#!/usr/bin/env node
/**
 * skill-lint-action — OpenClaw SKILL.md validator for GitHub Actions
 *
 * Zero external dependencies. Uses GitHub Actions workflow commands
 * (::error, ::warning, ::notice) for inline PR annotations.
 *
 * Built by effectorHQ — https://github.com/effectorHQ/skill-lint-action
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, resolve, relative } from 'path';
import { env, exit } from 'process';

// ─────────────────────────────────────────────
// GitHub Actions I/O (no @actions/core needed)
// ─────────────────────────────────────────────

const core = {
  getInput: (name) => env[`INPUT_${name.toUpperCase().replace(/-/g, '_')}`] || '',
  setOutput: (name, value) => {
    // GITHUB_OUTPUT file protocol (Actions v2+)
    const outputFile = env.GITHUB_OUTPUT;
    if (outputFile) {
      const { appendFileSync } = await import('fs').catch(() => ({ appendFileSync: () => {} }));
      try {
        const fs = { appendFileSync };
        fs.appendFileSync(outputFile, `${name}=${value}\n`);
      } catch {
        console.log(`::set-output name=${name}::${value}`);
      }
    } else {
      console.log(`::set-output name=${name}::${value}`);
    }
  },
  info: (msg) => console.log(msg),
  warning: (msg, props = {}) => {
    const loc = buildLocation(props);
    console.log(`::warning${loc}::${escape(msg)}`);
  },
  error: (msg, props = {}) => {
    const loc = buildLocation(props);
    console.log(`::error${loc}::${escape(msg)}`);
  },
  notice: (msg, props = {}) => {
    const loc = buildLocation(props);
    console.log(`::notice${loc}::${escape(msg)}`);
  },
  startGroup: (title) => console.log(`::group::${title}`),
  endGroup: () => console.log('::endgroup::'),
  setFailed: (msg) => {
    console.log(`::error::${escape(msg)}`);
    exit(1);
  },
  summary: {
    lines: [],
    addRaw(text) { this.lines.push(text); return this; },
    addHeading(text, level = 2) { this.lines.push(`${'#'.repeat(level)} ${text}\n`); return this; },
    addTable(rows) {
      if (!rows.length) return this;
      this.lines.push(rows.map(r => `| ${r.join(' | ')} |`).join('\n') + '\n');
      return this;
    },
    async write() {
      const summaryFile = env.GITHUB_STEP_SUMMARY;
      if (summaryFile) {
        const { writeFileSync } = await import('fs');
        try { writeFileSync(summaryFile, this.lines.join('\n'), { flag: 'a' }); } catch {}
      }
    }
  }
};

function buildLocation({ file, line, col, endLine, endColumn } = {}) {
  const parts = [];
  if (file) parts.push(`file=${file}`);
  if (line) parts.push(`line=${line}`);
  if (col) parts.push(`col=${col}`);
  if (endLine) parts.push(`endLine=${endLine}`);
  if (endColumn) parts.push(`endColumn=${endColumn}`);
  return parts.length ? ` ${parts.join(',')}` : '';
}

function escape(msg) {
  return String(msg).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

// ─────────────────────────────────────────────
// SKILL.md Parser
// ─────────────────────────────────────────────

function parseSkillFile(content) {
  const lines = content.split('\n');
  if (lines[0].trim() !== '---') {
    return { frontmatter: null, body: content, error: 'Missing YAML frontmatter opening delimiter (---)' };
  }
  const closeIdx = lines.slice(1).findIndex(l => l.trim() === '---');
  if (closeIdx === -1) {
    return { frontmatter: null, body: content, error: 'Missing YAML frontmatter closing delimiter (---)' };
  }
  const yamlLines = lines.slice(1, closeIdx + 1);
  const body = lines.slice(closeIdx + 2).join('\n');
  try {
    const frontmatter = parseSimpleYaml(yamlLines.join('\n'));
    return { frontmatter, body, error: null };
  } catch (e) {
    return { frontmatter: null, body, error: `Invalid YAML frontmatter: ${e.message}` };
  }
}

/** Minimal YAML parser — handles the subset used in SKILL.md frontmatter */
function parseSimpleYaml(yaml) {
  const result = {};
  const lines = yaml.split('\n');
  let i = 0;

  function parseValue(val) {
    val = val.trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      return val.slice(1, -1);
    }
    if (val === 'true') return true;
    if (val === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(val)) return Number(val);
    return val;
  }

  function parseBlock(baseIndent) {
    const obj = {};
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim() || line.trim().startsWith('#')) { i++; continue; }
      const indent = line.match(/^(\s*)/)[1].length;
      if (indent < baseIndent) break;
      if (line.trim().startsWith('- ')) {
        // Array item — handled by parent
        break;
      }
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) { i++; continue; }
      const key = line.slice(indent, colonIdx).trim();
      const rest = line.slice(colonIdx + 1).trim();
      i++;
      if (rest === '' || rest === '|' || rest === '>') {
        // Look ahead for nested object or array
        if (i < lines.length) {
          const nextLine = lines[i];
          const nextIndent = nextLine.match(/^(\s*)/)[1].length;
          if (nextLine.trim().startsWith('- ')) {
            // Array
            const arr = [];
            while (i < lines.length && lines[i].trim().startsWith('- ')) {
              const itemLine = lines[i];
              const itemIndent = itemLine.match(/^(\s*)/)[1].length;
              if (itemIndent < nextIndent) break;
              const itemVal = itemLine.trim().slice(2).trim();
              if (itemVal === '' || itemVal.endsWith(':')) {
                // Inline object or nested object
                i++;
                const nestedObj = parseBlock(itemIndent + 2);
                arr.push(nestedObj);
              } else if (itemVal.includes(':')) {
                // Inline key-value
                i++;
                const inlineObj = {};
                const parts = itemVal.split(',').map(p => p.trim());
                for (const part of parts) {
                  const [k, ...v] = part.split(':');
                  if (k) inlineObj[k.trim()] = parseValue(v.join(':'));
                }
                arr.push(inlineObj);
              } else {
                arr.push(parseValue(itemVal));
                i++;
              }
            }
            obj[key] = arr;
          } else if (nextIndent > indent) {
            obj[key] = parseBlock(nextIndent);
          } else {
            obj[key] = rest;
          }
        }
      } else {
        obj[key] = parseValue(rest);
      }
    }
    return obj;
  }

  i = 0;
  return parseBlock(0);
}

function extractMetadata(frontmatter) {
  if (!frontmatter) return null;
  return frontmatter?.metadata?.openclaw || frontmatter?.metadata?.clawdbot || frontmatter?.metadata?.clawd || null;
}

// ─────────────────────────────────────────────
// Validation Rules
// ─────────────────────────────────────────────

function validateSkill(frontmatter, body, filePath) {
  const results = [];
  const meta = extractMetadata(frontmatter);

  function err(code, message, line) {
    results.push({ level: 'error', code, message, file: filePath, line });
  }
  function warn(code, message, line) {
    results.push({ level: 'warning', code, message, file: filePath, line });
  }
  function info(code, message) {
    results.push({ level: 'info', code, message, file: filePath });
  }

  // ── Required fields ──
  if (!frontmatter?.name) {
    err('missing-name', "Missing required field 'name'", 1);
  } else {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(frontmatter.name)) {
      warn('name-format', `'name' should be kebab-case (e.g. "my-skill"), got: "${frontmatter.name}"`);
    }
    if (frontmatter.name.length > 50) {
      warn('name-too-long', `'name' is ${frontmatter.name.length} chars — keep it under 50`);
    }
  }

  if (!frontmatter?.description) {
    err('missing-description', "Missing required field 'description'");
  } else {
    const desc = frontmatter.description;
    if (desc.length < 20) {
      warn('description-too-short', `'description' is ${desc.length} chars — aim for 20+ for good ClawHub discovery`);
    }
    if (desc.length > 300) {
      warn('description-too-long', `'description' is ${desc.length} chars — keep it under 300 for ClawHub display`);
    }
    // Check for discovery-unfriendly patterns
    if (/^(a |an |the )/i.test(desc)) {
      info('description-article', `'description' starts with an article ("${desc.slice(0, 15)}...") — consider starting with a verb for ClawHub discovery`);
    }
  }

  // ── metadata.openclaw ──
  if (!meta) {
    warn('missing-openclaw-metadata', "Missing 'metadata.openclaw' block — skill won't configure correctly on install");
  } else {
    if (!meta.emoji) {
      warn('missing-emoji', "Missing 'metadata.openclaw.emoji' — shown in ClawHub UI and skill picker");
    }

    // Validate install entries
    if (meta.install) {
      if (!Array.isArray(meta.install)) {
        err('install-not-array', "'metadata.openclaw.install' must be an array of install methods");
      } else {
        meta.install.forEach((entry, idx) => {
          if (!entry.id) warn(`install-missing-id`, `Install entry [${idx}] is missing 'id' field`);
          if (!entry.kind) warn(`install-missing-kind`, `Install entry [${idx}] is missing 'kind' field (brew/apt/manual/npm/pip)`);
          const validKinds = ['brew', 'apt', 'yum', 'manual', 'npm', 'pip', 'cargo', 'scoop', 'choco'];
          if (entry.kind && !validKinds.includes(entry.kind)) {
            warn('install-unknown-kind', `Install entry [${idx}] has unknown 'kind': "${entry.kind}" — valid: ${validKinds.join(', ')}`);
          }
          if (entry.kind === 'brew' && !entry.formula && !entry.cask) {
            warn('brew-missing-formula', `Brew install entry [${idx}] is missing 'formula' or 'cask'`);
          }
          if (['apt', 'yum'].includes(entry.kind) && !entry.package) {
            warn('apt-missing-package', `${entry.kind} install entry [${idx}] is missing 'package'`);
          }
          if (!entry.bins && entry.kind !== 'manual') {
            info('install-missing-bins', `Install entry [${idx}] missing 'bins' list — OpenClaw uses this to verify install succeeded`);
          }
        });
      }
    }

    // Validate requires.bins
    if (meta.requires?.bins) {
      if (!Array.isArray(meta.requires.bins)) {
        err('requires-bins-not-array', "'metadata.openclaw.requires.bins' must be an array of binary names");
      }
    }

    // Validate requires.env
    if (meta.requires?.env) {
      if (!Array.isArray(meta.requires.env)) {
        err('requires-env-not-array', "'metadata.openclaw.requires.env' must be an array of env var names");
      } else {
        meta.requires.env.forEach((envVar, idx) => {
          if (typeof envVar === 'string' && envVar !== envVar.toUpperCase()) {
            warn('env-not-uppercase', `Env var '${envVar}' should be UPPER_CASE (standard convention)`);
          }
        });
      }
    }
  }

  // ── Body structure ──
  if (!body || body.trim().length < 50) {
    warn('body-too-short', "SKILL.md body is very short — consider adding Purpose, Setup, and Examples sections");
  } else {
    const hasH2 = /^##\s/m.test(body);
    if (!hasH2) {
      info('no-sections', "Consider adding ## sections to structure your skill (## Setup, ## Commands, ## Examples)");
    }

    // Check for common useful sections
    const hasPurpose = /## (purpose|overview|what|about)/i.test(body);
    const hasSetup = /## (setup|install|configuration|getting started)/i.test(body);
    const hasExamples = /## (example|usage|commands|how to)/i.test(body);

    if (!hasPurpose) {
      info('no-purpose', "Consider adding a ## Purpose or ## Overview section");
    }
    if (!hasSetup && meta?.requires) {
      warn('missing-setup', "Skill has requirements but no ## Setup section — users won't know how to configure it");
    }
    if (!hasExamples) {
      warn('missing-examples', "No ## Examples or ## Commands section found — examples improve discoverability and adoption");
    }
  }

  return results;
}

// ─────────────────────────────────────────────
// File Discovery
// ─────────────────────────────────────────────

function findSkillFiles(searchPath, globPattern) {
  const files = [];
  const absPath = resolve(searchPath);

  if (!existsSync(absPath)) {
    return files;
  }

  const stat = statSync(absPath);

  // Direct path to a SKILL.md
  if (stat.isFile()) {
    if (absPath.endsWith('SKILL.md')) files.push(absPath);
    return files;
  }

  // Walk directory
  function walk(dir) {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.name === 'SKILL.md') {
          files.push(fullPath);
        }
      }
    } catch {}
  }

  walk(absPath);
  return files;
}

// ─────────────────────────────────────────────
// Output helpers
// ─────────────────────────────────────────────

const LEVEL_EMOJI = { error: '❌', warning: '⚠️', info: 'ℹ️' };
const LEVEL_ICONS = { error: '🔴', warning: '🟡', info: '🔵' };

function renderSummaryTable(allResults, files) {
  const errorCount = allResults.filter(r => r.level === 'error').length;
  const warnCount  = allResults.filter(r => r.level === 'warning').length;
  const infoCount  = allResults.filter(r => r.level === 'info').length;

  const status = errorCount > 0 ? '❌ Failed' : warnCount > 0 ? '⚠️ Passed with warnings' : '✅ Passed';

  core.summary
    .addHeading('Skill Lint Results', 2)
    .addTable([
      ['Metric', 'Count'],
      ['Files checked', String(files.length)],
      ['🔴 Errors', String(errorCount)],
      ['🟡 Warnings', String(warnCount)],
      ['🔵 Info', String(infoCount)],
      ['Status', status],
    ]);

  if (allResults.length > 0) {
    core.summary.addHeading('Issues', 3);
    const rows = [['Level', 'File', 'Rule', 'Message']];
    for (const r of allResults) {
      const rel = relative(resolve('.'), r.file);
      rows.push([LEVEL_ICONS[r.level], rel, `\`${r.code}\``, r.message]);
    }
    core.summary.addTable(rows);
  }

  core.summary.addRaw(`\n> Powered by [skill-lint-action](https://github.com/effectorHQ/skill-lint-action)\n`);
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────

async function run() {
  const searchPath    = core.getInput('path') || '.';
  const failOnWarnings = core.getInput('fail-on-warnings') === 'true';
  const jsonOutput    = core.getInput('json') === 'true';
  const globPattern   = core.getInput('glob') || '';

  core.info(`\n🦞 skill-lint-action — validating SKILL.md files`);
  core.info(`   Search path: ${resolve(searchPath)}`);
  core.info(`   Fail on warnings: ${failOnWarnings}\n`);

  // Discover files
  const files = findSkillFiles(searchPath, globPattern);

  if (files.length === 0) {
    core.warning('no-files', { }, `No SKILL.md files found in '${searchPath}'`);
    await setOutputs(0, 0, 0);
    return;
  }

  core.info(`Found ${files.length} SKILL.md file${files.length === 1 ? '' : 's'}\n`);

  const allResults = [];
  let totalErrors = 0;
  let totalWarnings = 0;

  for (const filePath of files) {
    const relPath = relative(resolve('.'), filePath);
    core.startGroup(`${relPath}`);

    const content = readFileSync(filePath, 'utf8');
    const { frontmatter, body, error: parseError } = parseSkillFile(content);

    if (parseError) {
      core.error(parseError, { file: relPath, line: 1 });
      allResults.push({ level: 'error', code: 'parse-error', message: parseError, file: relPath, line: 1 });
      totalErrors++;
      core.endGroup();
      continue;
    }

    const results = validateSkill(frontmatter, body, relPath);
    allResults.push(...results);

    const fileErrors   = results.filter(r => r.level === 'error').length;
    const fileWarnings = results.filter(r => r.level === 'warning').length;
    const fileInfo     = results.filter(r => r.level === 'info').length;

    totalErrors   += fileErrors;
    totalWarnings += fileWarnings;

    if (results.length === 0) {
      core.notice(`✓ No issues found`, { file: relPath });
      core.info(`  ✓ No issues`);
    } else {
      for (const r of results) {
        const props = { file: r.file };
        if (r.line) props.line = r.line;
        const msg = `[${r.code}] ${r.message}`;

        if (r.level === 'error') {
          core.error(msg, props);
        } else if (r.level === 'warning') {
          core.warning(msg, props);
        } else {
          core.notice(msg, props);
        }

        core.info(`  ${LEVEL_EMOJI[r.level]} ${r.message}`);
      }
      core.info(`\n  Summary: ${fileErrors} error(s), ${fileWarnings} warning(s), ${fileInfo} info`);
    }

    core.endGroup();
  }

  // JSON output mode
  if (jsonOutput) {
    console.log(JSON.stringify({ files: files.length, errors: totalErrors, warnings: totalWarnings, results: allResults }, null, 2));
  }

  // Write step summary
  renderSummaryTable(allResults, files);
  await core.summary.write();

  // Set outputs
  await setOutputs(totalErrors, totalWarnings, files.length);

  // Final verdict
  const shouldFail = totalErrors > 0 || (failOnWarnings && totalWarnings > 0);

  core.info(`\n${'─'.repeat(50)}`);
  if (shouldFail) {
    const reason = totalErrors > 0
      ? `${totalErrors} error(s) found`
      : `${totalWarnings} warning(s) found (--fail-on-warnings is set)`;
    core.setFailed(`skill-lint: ${reason} — fix the issues above and try again`);
  } else {
    const warnNote = totalWarnings > 0 ? ` (${totalWarnings} warning(s))` : '';
    core.info(`✅ skill-lint passed across ${files.length} file(s)${warnNote}`);
  }
}

async function setOutputs(errors, warnings, filesChecked) {
  const outputFile = env.GITHUB_OUTPUT;
  if (outputFile) {
    try {
      const { appendFileSync } = await import('fs');
      appendFileSync(outputFile, `errors=${errors}\nwarnings=${warnings}\nfiles-checked=${filesChecked}\n`);
    } catch {
      console.log(`::set-output name=errors::${errors}`);
      console.log(`::set-output name=warnings::${warnings}`);
      console.log(`::set-output name=files-checked::${filesChecked}`);
    }
  } else {
    console.log(`::set-output name=errors::${errors}`);
    console.log(`::set-output name=warnings::${warnings}`);
    console.log(`::set-output name=files-checked::${filesChecked}`);
  }
}

run().catch(err => {
  core.setFailed(`Unexpected error: ${err.message}`);
});
