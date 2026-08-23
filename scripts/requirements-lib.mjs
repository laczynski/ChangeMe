/** Provides shared metadata parsing and document discovery for requirements tooling. */

import fs from "node:fs";
import path from "node:path";

export const ROOT = path.join(process.cwd(), "docs", "requirements");
export const FUNCTIONAL_DIR = path.join(ROOT, "functional");

const LIST_KEYS = new Set([
  "depends_on",
  "inherits_conventions",
  "inherits_quality",
]);

function normalizeNewlines(content) {
  return content.replace(/^\uFEFF/, "").replaceAll("\r\n", "\n");
}

function splitLeadingH1(text) {
  if (!text.startsWith("# ")) return { heading: null, rest: text };
  const nl = text.indexOf("\n");
  const heading = (nl === -1 ? text.slice(2) : text.slice(2, nl)).trim();
  const rest = (nl === -1 ? "" : text.slice(nl + 1)).replace(/^\n+/, "");
  return { heading, rest };
}

function parseMetaValue(key, raw) {
  const value = raw.replaceAll("`", "").trim();
  if (LIST_KEYS.has(key)) {
    if (!value) return [];
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return value;
}

function parseMetaLines(block) {
  const meta = {};
  for (const line of block.split("\n")) {
    const match = line.match(/^([\w_]+):\s*(.*)$/);
    if (!match) continue;
    meta[match[1]] = parseMetaValue(match[1], match[2].trim());
  }
  return meta;
}

function parseQuoteBlock(text) {
  if (!text.startsWith(">")) return null;
  const lines = text.split("\n");
  const quoteLines = [];
  let index = 0;
  for (; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === ">" || line.startsWith("> ") || line.startsWith(">\t")) {
      quoteLines.push(line === ">" ? "" : line.replace(/^>\s?/, ""));
      continue;
    }
    break;
  }
  if (!quoteLines.some((line) => /^[\w_]+:\s*/.test(line))) return null;
  while (index < lines.length && lines[index] === "") index += 1;
  return {
    meta: parseMetaLines(quoteLines.join("\n")),
    body: lines.slice(index).join("\n"),
  };
}

function extractMetadata(content) {
  const text = normalizeNewlines(content);
  const { heading, rest } = splitLeadingH1(text);
  const parsed = parseQuoteBlock(rest);
  if (!parsed) return null;
  const meta = { ...parsed.meta };
  if (!meta.title && heading) meta.title = heading;
  return { heading, meta, body: parsed.body };
}

export function parseFrontmatter(content) {
  return extractMetadata(content)?.meta ?? null;
}

export function stripMetadata(content) {
  const parsed = extractMetadata(content);
  if (!parsed) return content;
  if (parsed.heading) return `# ${parsed.heading}\n\n${parsed.body}`;
  return parsed.body;
}

export function listMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .sort((a, b) => a.localeCompare(b));
}

export function listDomainDirs() {
  if (!fs.existsSync(FUNCTIONAL_DIR)) return [];
  return fs
    .readdirSync(FUNCTIONAL_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

export function collectFunctionalFiles() {
  const files = [];
  for (const domain of listDomainDirs()) {
    const dir = path.join(FUNCTIONAL_DIR, domain);
    for (const name of listMarkdownFiles(dir)) {
      files.push({ domain, name, path: path.join(dir, name) });
    }
  }
  return files;
}

export function collectDomainDocs() {
  const dir = path.join(ROOT, "_shared", "domain");
  return listMarkdownFiles(dir).map((file) => ({
    file,
    relPath: `_shared/domain/${file}`,
    path: path.join(dir, file),
  }));
}

function collectSharedDocs(subdir, expectedType) {
  const dir = path.join(ROOT, "_shared", subdir);
  return listMarkdownFiles(dir)
    .filter((file) => file !== "README.md")
    .map((file) => {
      const filePath = path.join(dir, file);
      const content = fs.readFileSync(filePath, "utf8");
      const meta = parseFrontmatter(content) ?? {};
      return {
        id: meta.id ?? "",
        title: meta.title ?? "",
        type: meta.type ?? "",
        status: meta.status ?? "active",
        file,
        relPath: `_shared/${subdir}/${file}`,
        path: filePath,
        expectedType,
        content,
      };
    });
}

export function collectQualityDocs() {
  return collectSharedDocs("quality", "quality");
}

export function collectConventionDocs() {
  return collectSharedDocs("conventions", "conventions");
}

export function collectStdIdsFromConventions() {
  const ids = new Set();
  const stdRe = /^## (STD-[A-Z]+-\d{3})\b/gm;
  for (const doc of collectConventionDocs()) {
    for (const m of doc.content.matchAll(stdRe)) {
      ids.add(m[1]);
    }
  }
  return ids;
}

export function formatDomainLabel(domain) {
  return domain
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
