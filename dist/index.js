#!/usr/bin/env node
#!/usr/bin/env node

// src/main.js
import { readFileSync, existsSync, readdirSync, statSync, appendFileSync, writeFileSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { env, exit } from "node:process";

// node_modules/@effectorhq/core/src/skill-parser.js
function parseSkillFile(content, filePath) {
  const lines = content.split("\n");
  const loc = filePath ? ` (${filePath})` : "";
  if (!lines[0].startsWith("---")) {
    return {
      frontmatter: "",
      body: content,
      parsed: {},
      valid: false,
      error: `SKILL.md must start with --- (YAML frontmatter delimiter)${loc}`
    };
  }
  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].startsWith("---")) {
      endIndex = i;
      break;
    }
  }
  if (endIndex === -1) {
    return {
      frontmatter: "",
      body: content,
      parsed: {},
      valid: false,
      error: `SKILL.md must close frontmatter with --- delimiter${loc}`
    };
  }
  const frontmatterLines = lines.slice(1, endIndex);
  const frontmatter = frontmatterLines.join("\n");
  const body = lines.slice(endIndex + 1).join("\n").trim();
  const parsed = parseYaml(frontmatter);
  return { frontmatter, body, parsed, valid: true, error: null };
}
function parseYaml(yaml) {
  const lines = yaml.split("\n");
  const stack = [{ obj: {}, indent: -1 }];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    i++;
    if (!trimmed || trimmed.startsWith("#"))
      continue;
    const indent = line.search(/\S/);
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    const current = stack[stack.length - 1].obj;
    if (trimmed.startsWith("- ")) {
      const itemContent = trimmed.slice(2).trim();
      let arr = null;
      for (let s = stack.length - 1; s >= 0; s--) {
        if (Array.isArray(stack[s].obj)) {
          arr = stack[s].obj;
          break;
        }
      }
      if (!arr)
        continue;
      const colonPos2 = itemContent.indexOf(":");
      if (colonPos2 === -1) {
        arr.push(itemContent);
      } else {
        const itemObj = {};
        arr.push(itemObj);
        const firstKey = itemContent.slice(0, colonPos2).trim();
        const firstVal = itemContent.slice(colonPos2 + 1).trim();
        if (firstVal && firstVal !== "|" && firstVal !== ">") {
          itemObj[firstKey] = stripQuotes(firstVal);
        }
        stack.push({ obj: itemObj, indent });
      }
      continue;
    }
    const colonPos = trimmed.indexOf(":");
    if (colonPos === -1)
      continue;
    const key = trimmed.slice(0, colonPos).trim();
    const rawVal = trimmed.slice(colonPos + 1).trim();
    if (!rawVal || rawVal === "|" || rawVal === ">") {
      let nextNonEmpty = null;
      let nextNonEmptyIndent = 0;
      for (let j = i; j < lines.length; j++) {
        if (lines[j].trim()) {
          nextNonEmpty = lines[j].trim();
          nextNonEmptyIndent = lines[j].search(/\S/);
          break;
        }
      }
      if (rawVal === "|" || rawVal === ">") {
        let block = "";
        while (i < lines.length) {
          const bLine = lines[i];
          const bIndent = bLine.search(/\S/);
          if (bLine.trim() && bIndent <= indent)
            break;
          block += bLine + "\n";
          i++;
        }
        current[key] = block.trim();
      } else if (nextNonEmpty && nextNonEmpty.startsWith("- ")) {
        const arr = [];
        current[key] = arr;
        stack.push({ obj: arr, indent });
      } else if (nextNonEmptyIndent > indent) {
        const obj = {};
        current[key] = obj;
        stack.push({ obj, indent });
      }
    } else if (rawVal.startsWith("[") && rawVal.endsWith("]")) {
      const inner = rawVal.slice(1, -1).trim();
      if (!inner) {
        current[key] = [];
      } else {
        current[key] = inner.split(",").map((s) => stripQuotes(s.trim())).filter(Boolean);
      }
    } else {
      current[key] = stripQuotes(rawVal);
    }
  }
  return stack[0].obj;
}
function stripQuotes(val) {
  if (!val)
    return val;
  if (val.startsWith('"') && val.endsWith('"') || val.startsWith("'") && val.endsWith("'")) {
    return val.slice(1, -1);
  }
  return coerceValue(val);
}
function coerceValue(val) {
  if (val === "true")
    return true;
  if (val === "false")
    return false;
  if (val === "null" || val === "~")
    return null;
  if (/^-?\d+$/.test(val))
    return parseInt(val, 10);
  if (/^-?\d+\.\d+$/.test(val))
    return parseFloat(val);
  return val;
}
function extractMetadata(parsed) {
  return {
    name: parsed.name || "",
    description: parsed.description || "",
    metadata: parsed.metadata || {},
    emoji: parsed.metadata?.openclaw?.emoji || parsed.metadata?.effector?.emoji || "",
    requires: parsed.metadata?.openclaw?.requires || parsed.metadata?.effector?.requires || {},
    install: parsed.metadata?.openclaw?.install || parsed.metadata?.effector?.install || []
  };
}

// src/main.js
var core = {
  getInput: (name) => env[`INPUT_${name.toUpperCase().replace(/-/g, "_")}`] || "",
  setOutput: (name, value) => {
    const outputFile = env.GITHUB_OUTPUT;
    if (outputFile) {
      try {
        appendFileSync(outputFile, `${name}=${value}
`);
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
  endGroup: () => console.log("::endgroup::"),
  setFailed: (msg) => {
    console.log(`::error::${escape(msg)}`);
    exit(1);
  },
  summary: {
    lines: [],
    addRaw(text) {
      this.lines.push(text);
      return this;
    },
    addHeading(text, level = 2) {
      this.lines.push(`${"#".repeat(level)} ${text}
`);
      return this;
    },
    addTable(rows) {
      if (!rows.length)
        return this;
      this.lines.push(rows.map((r) => `| ${r.join(" | ")} |`).join("\n") + "\n");
      return this;
    },
    async write() {
      const summaryFile = env.GITHUB_STEP_SUMMARY;
      if (summaryFile) {
        try {
          writeFileSync(summaryFile, this.lines.join("\n"), { flag: "a" });
        } catch {
        }
      }
    }
  }
};
function buildLocation({ file, line, col, endLine, endColumn } = {}) {
  const parts = [];
  if (file)
    parts.push(`file=${file}`);
  if (line)
    parts.push(`line=${line}`);
  if (col)
    parts.push(`col=${col}`);
  if (endLine)
    parts.push(`endLine=${endLine}`);
  if (endColumn)
    parts.push(`endColumn=${endColumn}`);
  return parts.length ? ` ${parts.join(",")}` : "";
}
function escape(msg) {
  return String(msg).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}
function extractLineNumberForKey(content, key) {
  const lines = content.split("\n");
  const idx = lines.findIndex((l) => l.trim().startsWith(`${key}:`));
  return idx === -1 ? 1 : idx + 1;
}
function validateSkill(frontmatter, body, filePath) {
  const results = [];
  const meta = extractMetadata(frontmatter || {});
  function err(code, message, line) {
    results.push({ level: "error", code, message, file: filePath, line });
  }
  function warn(code, message, line) {
    results.push({ level: "warning", code, message, file: filePath, line });
  }
  function info(code, message) {
    results.push({ level: "info", code, message, file: filePath });
  }
  if (!frontmatter?.name) {
    err("missing-name", "Missing required field 'name'", extractLineNumberForKey(frontmatterRawCache.get(filePath) || "", "name"));
  } else {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(frontmatter.name)) {
      warn("name-format", `'name' should be kebab-case (e.g. "my-skill"), got: "${frontmatter.name}"`);
    }
    if (frontmatter.name.length > 50) {
      warn("name-too-long", `'name' is ${frontmatter.name.length} chars \u2014 keep it under 50`);
    }
  }
  if (!frontmatter?.description) {
    err("missing-description", "Missing required field 'description'");
  } else {
    const desc = frontmatter.description;
    if (desc.length < 20) {
      warn("description-too-short", `'description' is ${desc.length} chars \u2014 aim for 20+ for good discovery`);
    }
    if (desc.length > 300) {
      warn("description-too-long", `'description' is ${desc.length} chars \u2014 keep it under 300 for display`);
    }
    if (/^(a |an |the )/i.test(desc)) {
      info("description-article", `'description' starts with an article ("${desc.slice(0, 15)}...") \u2014 consider starting with a verb`);
    }
  }
  const hasAnyMetadata = Boolean(frontmatter?.metadata?.openclaw || frontmatter?.metadata?.effector || frontmatter?.metadata?.clawdbot || frontmatter?.metadata?.clawd);
  if (!hasAnyMetadata) {
    warn("missing-metadata", "Missing 'metadata.openclaw' or 'metadata.effector' block \u2014 skill may not configure correctly");
  } else {
    if (!meta.emoji) {
      warn("missing-emoji", "Missing metadata emoji \u2014 shown in UI and skill picker");
    }
    if (meta.install) {
      if (!Array.isArray(meta.install)) {
        err("install-not-array", "'metadata.*.install' must be an array of install methods");
      } else {
        meta.install.forEach((entry, idx) => {
          if (!entry?.id)
            warn("install-missing-id", `Install entry [${idx}] is missing 'id' field`);
        });
      }
    }
  }
  const requiredSections = ["## Purpose", "## When to Use", "## When NOT to Use", "## Setup", "## Commands", "## Examples", "## Notes"];
  for (const section of requiredSections) {
    if (!body.includes(section)) {
      warn("missing-section", `Missing section: ${section.replace("## ", "")}`);
    }
  }
  return results;
}
var frontmatterRawCache = /* @__PURE__ */ new Map();
function findSkillFiles(searchPath, globPattern) {
  const root = resolve(searchPath);
  const files = [];
  if (!existsSync(root))
    return files;
  const stat = statSync(root);
  if (stat.isFile()) {
    if (root.endsWith("SKILL.md"))
      files.push(root);
    return files;
  }
  if (globPattern) {
    const normalized = globPattern.replace(/\\/g, "/");
    const parts = normalized.split("/").filter(Boolean);
    walkWithGlob(root, parts, files);
    return files;
  }
  walkDir(root, files);
  return files;
}
function walkDir(dir, out) {
  const entries = readdirSync(dir);
  for (const name of entries) {
    if (name === "node_modules" || name.startsWith("."))
      continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory())
      walkDir(full, out);
    else if (st.isFile() && name === "SKILL.md")
      out.push(full);
  }
}
function walkWithGlob(baseDir, parts, out) {
  if (parts.length === 0)
    return;
  const [head, ...tail] = parts;
  const entries = readdirSync(baseDir);
  for (const name of entries) {
    if (name === "node_modules" || name.startsWith("."))
      continue;
    const full = join(baseDir, name);
    const st = statSync(full);
    if (!segmentMatches(head, name))
      continue;
    if (tail.length === 0) {
      if (st.isFile() && name === "SKILL.md")
        out.push(full);
    } else if (st.isDirectory()) {
      walkWithGlob(full, tail, out);
    }
  }
}
function segmentMatches(pattern, value) {
  if (pattern === "*")
    return true;
  if (!pattern.includes("*"))
    return pattern === value;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(value);
}
var LEVEL_ICONS = { error: "\u{1F534}", warning: "\u{1F7E1}", info: "\u{1F535}" };
var LEVEL_EMOJI = { error: "\u2717", warning: "\u26A0", info: "\u2139" };
function renderSummaryTable(allResults, files) {
  const errorCount = allResults.filter((r) => r.level === "error").length;
  const warnCount = allResults.filter((r) => r.level === "warning").length;
  const infoCount = allResults.filter((r) => r.level === "info").length;
  const status = errorCount > 0 ? "\u274C Failed" : warnCount > 0 ? "\u26A0\uFE0F Passed with warnings" : "\u2705 Passed";
  core.summary.addHeading("Skill Lint Results", 2).addTable([
    ["Metric", "Count"],
    ["Files checked", String(files.length)],
    ["\u{1F534} Errors", String(errorCount)],
    ["\u{1F7E1} Warnings", String(warnCount)],
    ["\u{1F535} Info", String(infoCount)],
    ["Status", status]
  ]);
  if (allResults.length > 0) {
    core.summary.addHeading("Issues", 3);
    const rows = [["Level", "File", "Rule", "Message"]];
    for (const r of allResults) {
      const rel = relative(resolve("."), r.file);
      rows.push([LEVEL_ICONS[r.level], rel, `\`${r.code}\``, r.message]);
    }
    core.summary.addTable(rows);
  }
  core.summary.addRaw(`
> Powered by [skill-lint-action](https://github.com/effectorHQ/skill-lint-action)
`);
}
async function setOutputs(errors, warnings, filesChecked) {
  core.setOutput("errors", errors);
  core.setOutput("warnings", warnings);
  core.setOutput("files-checked", filesChecked);
}
async function run() {
  const searchPath = core.getInput("path") || ".";
  const failOnWarnings = core.getInput("fail-on-warnings") === "true";
  const jsonOutput = core.getInput("json") === "true";
  const globPattern = core.getInput("glob") || "";
  core.info(`
\u{1F99E} skill-lint-action \u2014 validating SKILL.md files`);
  core.info(`   Search path: ${resolve(searchPath)}`);
  core.info(`   Fail on warnings: ${failOnWarnings}
`);
  const files = findSkillFiles(searchPath, globPattern);
  if (files.length === 0) {
    core.warning(`No SKILL.md files found in '${searchPath}'`);
    await setOutputs(0, 0, 0);
    return;
  }
  core.info(`Found ${files.length} SKILL.md file${files.length === 1 ? "" : "s"}
`);
  const allResults = [];
  let totalErrors = 0;
  let totalWarnings = 0;
  for (const filePath of files) {
    const relPath = relative(resolve("."), filePath);
    core.startGroup(`${relPath}`);
    const content = readFileSync(filePath, "utf8");
    const parsedSkill = parseSkillFile(content, relPath);
    if (!parsedSkill.valid) {
      const parseError = parsedSkill.error || "Invalid SKILL.md";
      core.error(parseError, { file: relPath, line: 1 });
      allResults.push({ level: "error", code: "parse-error", message: parseError, file: relPath, line: 1 });
      totalErrors++;
      core.endGroup();
      continue;
    }
    frontmatterRawCache.set(relPath, parsedSkill.frontmatter);
    const frontmatter = parsedSkill.parsed;
    const body = parsedSkill.body;
    const results = validateSkill(frontmatter, body, relPath);
    allResults.push(...results);
    const fileErrors = results.filter((r) => r.level === "error").length;
    const fileWarnings = results.filter((r) => r.level === "warning").length;
    const fileInfo = results.filter((r) => r.level === "info").length;
    totalErrors += fileErrors;
    totalWarnings += fileWarnings;
    if (results.length === 0) {
      core.notice(`\u2713 No issues found`, { file: relPath });
      core.info(`  \u2713 No issues`);
    } else {
      for (const r of results) {
        const props = { file: r.file };
        if (r.line)
          props.line = r.line;
        const msg = `[${r.code}] ${r.message}`;
        if (r.level === "error")
          core.error(msg, props);
        else if (r.level === "warning")
          core.warning(msg, props);
        else
          core.notice(msg, props);
        core.info(`  ${LEVEL_EMOJI[r.level]} ${r.message}`);
      }
      core.info(`
  Summary: ${fileErrors} error(s), ${fileWarnings} warning(s), ${fileInfo} info`);
    }
    core.endGroup();
  }
  if (jsonOutput) {
    console.log(JSON.stringify({ files: files.length, errors: totalErrors, warnings: totalWarnings, results: allResults }, null, 2));
  }
  renderSummaryTable(allResults, files);
  await core.summary.write();
  await setOutputs(totalErrors, totalWarnings, files.length);
  const shouldFail = totalErrors > 0 || failOnWarnings && totalWarnings > 0;
  core.info(`
${"\u2500".repeat(50)}`);
  if (shouldFail) {
    const reason = totalErrors > 0 ? `${totalErrors} error(s) found` : `${totalWarnings} warning(s) found (--fail-on-warnings is set)`;
    core.setFailed(`skill-lint: ${reason} \u2014 fix the issues above and try again`);
  } else {
    const warnNote = totalWarnings > 0 ? ` (${totalWarnings} warning(s))` : "";
    core.info(`\u2705 skill-lint passed across ${files.length} file(s)${warnNote}`);
  }
}
run().catch((err) => {
  core.setFailed(`Unexpected error: ${err?.message || String(err)}`);
});
