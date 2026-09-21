#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'Kakashi_Manager_Briefing.fodp');

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function textFrame({ x, y, w, h, style, lines, frameStyle = 'grText' }) {
  const paragraphs = lines.map((line) =>
    `<text:p text:style-name="${style}">${esc(line)}</text:p>`).join('');
  return `<draw:frame draw:style-name="${frameStyle}" svg:x="${x}in" svg:y="${y}in" svg:width="${w}in" svg:height="${h}in"><draw:text-box>${paragraphs}</draw:text-box></draw:frame>`;
}

function rect({ x, y, w, h, style }) {
  return `<draw:rect draw:style-name="${style}" svg:x="${x}in" svg:y="${y}in" svg:width="${w}in" svg:height="${h}in"/>`;
}

function standardSlide(slide, index) {
  const bulletLines = slide.bullets.map((bullet) => `•  ${bullet}`);
  const right = slide.right || [];
  return `
    <draw:page draw:name="slide-${index}" draw:style-name="dpDark" draw:master-page-name="Default">
      ${rect({ x: 0, y: 0, w: 0.16, h: 7.5, style: 'grAccent' })}
      ${textFrame({ x: 0.72, y: 0.48, w: 11.85, h: 0.7, style: 'Title', lines: [slide.title] })}
      ${textFrame({ x: 0.75, y: 1.28, w: 7.55, h: 5.35, style: 'Body', lines: bulletLines })}
      ${right.length ? rect({ x: 8.68, y: 1.43, w: 3.82, h: 4.82, style: 'grPanel' }) : ''}
      ${right.length ? textFrame({ x: 9.02, y: 1.78, w: 3.15, h: 4.15, style: 'Callout', lines: right }) : ''}
      ${textFrame({ x: 0.75, y: 7.05, w: 10.8, h: 0.24, style: 'Footer', lines: ['KAKASHI  •  LOCAL-FIRST PRIVACY FOR AGENTIC AI'] })}
      ${textFrame({ x: 12.05, y: 7.02, w: 0.55, h: 0.26, style: 'FooterRight', lines: [String(index)] })}
    </draw:page>`;
}

const slides = [
  {
    kind: 'title',
    title: 'KAKASHI',
    subtitle: 'Sovereign privacy controls for agentic AI',
    detail: 'Manager briefing • capabilities, government value, and live proof • v1.2.0',
  },
  {
    title: 'The risk has changed',
    bullets: [
      'AI agents read files, query systems, and call tools before a human reviews every payload.',
      'A single attachment can contain government identifiers, contact data, finance records, or production credentials.',
      'Once raw data reaches an external model or service, the disclosure cannot be undone.',
      '“Remember to redact it” is guidance. Government deployments need an enforceable, testable control.',
    ],
    right: ['THE CONTROL POINT', 'Kakashi stands between local data and the destination.', '', 'Detect → Minimise → Decide → Verify'],
  },
  {
    title: 'Three layers, one local trust boundary',
    bullets: [
      'ENGINE — detect and transform sensitive values in files while preserving the original format.',
      'REACH — apply the same protection to folders, repositories, shared drives, and database query results.',
      'GUARDIAN — reason about the agent, declared task, destination, and policy before releasing anything.',
      'Each layer is useful independently; together they form a privacy gate for agentic workflows.',
    ],
    right: ['1  ENGINE', '2  REACH', '3  GUARDIAN', '', 'All processing stays on the machine.'],
  },
  {
    title: 'Coverage designed for real government work',
    bullets: [
      '35 active patterns across credentials, government IDs, financial data, contacts, names, and technical identifiers.',
      '50+ formats: PDF, Word, PowerPoint, Excel, CSV, structured data, configuration, and source code.',
      'Typed tokens preserve relationships; redact removes values; fake mode preserves realistic shape.',
      'English and Arabic CLI/report experiences support bilingual operational teams.',
    ],
    right: ['35', 'DETECTION PATTERNS', '', '50+', 'FILE FORMATS', '', 'EN  •  العربية'],
  },
  {
    title: 'Case 1 — Protect a file before an AI receives it',
    bullets: [
      'Scan is count-only by default: an agent learns the risk without seeing matched values.',
      'Audit is explicit and human-only because it intentionally reveals the original-to-token mapping.',
      'Mask writes a safe sibling rather than overwriting the source.',
      'The demo proves typed, redact, fake, whitelist, stdin, and re-scan behaviour.',
    ],
    right: ['LIVE COMMAND', './demos/01-file-protection.sh', '', 'PROOF', 'Source values removed', 'Typed/redact outputs re-scan clean'],
  },
  {
    title: 'Case 2 — Discover risk across a data estate',
    bullets: [
      'Recursive scanning respects repository ignore policy and reports files intentionally skipped.',
      'JSON, Markdown, and HTML reports contain finding metadata without raw matched values by default.',
      'PDPL-oriented article mapping gives compliance teams reviewable context—not a legal certification.',
      'Arabic HTML uses the same local evidence and renders without a cloud translation step.',
    ],
    right: ['LIVE COMMAND', './demos/02-folder-compliance.sh', '', 'OUTPUT', 'English HTML', 'Arabic HTML', 'JSON + Markdown'],
  },
  {
    title: 'Case 3 — Mask database results client-side',
    bullets: [
      'Adapters support PostgreSQL, MySQL, MongoDB, Snowflake, Databricks, and SQLite.',
      'Rows are transformed locally before a safe JSONL, JSON, or CSV copy is written.',
      'Stable tokens preserve distinct counts and relationships across rows for useful analytics.',
      'Limits reduce accidental bulk access; source databases are not modified by the export flow.',
    ],
    right: ['LIVE COMMAND', './demos/03-database-protection.sh', '', 'DEMO ADAPTER', 'Offline mock dataset', 'No database required'],
  },
  {
    title: 'Case 4 — Guardian makes the release decision',
    bullets: [
      'Observe → understand task → assess risk → plan → policy check → act → verify → replan.',
      'Decisions are explicit: ALLOW, ALLOW_WITH_TRANSFORMATION, REQUIRE_APPROVAL, or BLOCK.',
      'A verified analytics request receives only the transformed release path.',
      'A credential-bearing request fails closed and releases no artifact without human approval.',
    ],
    right: ['LIVE COMMAND', './demos/04-guardian-decision.sh', '', 'KEY PROPERTY', 'The agent cannot self-approve.'],
  },
  {
    title: 'Case 5 — A standing privacy gate for every agent',
    bullets: [
      'agent-guard exposes health, scan, and mask endpoints on loopback only.',
      'IDEs, MCP tools, and automations can check a resource immediately before attachment or transfer.',
      'The scan API returns categories, severity, and counts—never the raw findings.',
      'Passive file watching can create a local, value-free operational trail.',
    ],
    right: ['LIVE COMMAND', './demos/05-agent-sidecar.sh', '', 'NETWORK BOUNDARY', 'IPv4 loopback only', 'Zero outbound calls'],
  },
  {
    title: 'Why this matters for government',
    bullets: [
      'Data sovereignty — sensitive content is inspected and transformed locally.',
      'Data minimisation — agents receive the minimum useful representation, not the full source record.',
      'Purpose limitation — Guardian incorporates the declared task into the release plan.',
      'Traceability — value-free reports and decision events support review without creating a second leak.',
      'Adoption — CLI, sidecar, and agent-rule integration fit existing developer and automation workflows.',
    ],
    right: ['PREVENTIVE CONTROL', 'Before transfer', '', 'DETECTIVE EVIDENCE', 'After decision', '', 'ARABIC READY'],
  },
  {
    title: 'Trust boundaries and honest limitations',
    bullets: [
      'Kakashi makes no outbound calls and submits no telemetry; database drivers connect only where the operator directs.',
      'Pattern detection is not infallible: organisations still need access control, classification, retention, and incident response.',
      'Audit modes reveal plaintext by design and must remain in a local human-only terminal.',
      'Kakashi supports PDPL-oriented controls; it does not certify compliance or replace legal review.',
      'An integration must honour Guardian decisions—the control is strongest when enforced in the transfer path.',
    ],
    right: ['SAFE CLAIM', 'Reduces accidental disclosure risk.', '', 'UNSAFE CLAIM', '“No leak is ever possible.”'],
  },
  {
    title: 'Proof, not promises',
    bullets: [
      'Six standalone demos can run in any order and rebuild only an ignored synthetic workspace.',
      'Each case asserts source-value removal, safe reports, stable database tokens, or fail-closed decisions.',
      'The complete project test suite covers detectors, formats, reporting, databases, sidecar, and Guardian.',
      'Kakashi scans the demo and presentation assets before they are uploaded to GitHub.',
    ],
    right: ['PRE-MEETING', 'npm test', './demos/run-all.sh', '', 'LIVE', 'Run one numbered case at a time'],
  },
  {
    title: 'Practical government rollout',
    bullets: [
      'PILOT — choose one low-risk workflow and measure findings, false positives, utility, and operator friction.',
      'POLICY — define destinations, approval owners, permitted classes, retention, and exception handling.',
      'INTEGRATE — place Guardian or the sidecar directly in the file/database-to-agent transfer path.',
      'OPERATE — review value-free evidence, tune policy, test upgrades, and train users on unsafe audit options.',
      'EXPAND — move from a team workflow to shared repositories, data platforms, and managed agent environments.',
    ],
    right: ['30 DAYS', 'Pilot + baseline', '', '60 DAYS', 'Policy + integration', '', '90 DAYS', 'Operate + expand'],
  },
  {
    title: 'Tomorrow’s live path',
    bullets: [
      '1  File protection',
      '2  Folder compliance and Arabic report',
      '3  Database result masking',
      '4  Guardian transformation and human approval',
      '5  Loopback agent sidecar',
      '6  Operational evidence and Arabic CLI',
    ],
    right: ['START HERE', './demos/01-file-protection.sh', '', 'RUNBOOK', 'demos/PRESENTER_RUNBOOK.md', '', 'GOAL', 'Safe AI utility without raw-data exposure'],
  },
];

const pages = slides.map((slide, offset) => {
  const index = offset + 1;
  if (slide.kind !== 'title') return standardSlide(slide, index);
  return `
    <draw:page draw:name="slide-${index}" draw:style-name="dpDark" draw:master-page-name="Default">
      ${rect({ x: 0, y: 0, w: 0.2, h: 7.5, style: 'grAccent' })}
      ${rect({ x: 8.9, y: 0, w: 4.44, h: 7.5, style: 'grPanel' })}
      ${textFrame({ x: 0.9, y: 1.55, w: 7.3, h: 1.1, style: 'Hero', lines: [slide.title] })}
      ${textFrame({ x: 0.95, y: 2.72, w: 7.25, h: 1.0, style: 'Subtitle', lines: [slide.subtitle] })}
      ${textFrame({ x: 0.98, y: 4.35, w: 7.15, h: 0.7, style: 'Detail', lines: [slide.detail] })}
      ${textFrame({ x: 9.45, y: 1.9, w: 3.0, h: 3.2, style: 'Mark', lines: ['守', '', 'LOCAL', 'MINIMAL', 'VERIFIED'] })}
      ${textFrame({ x: 0.98, y: 6.82, w: 7.5, h: 0.3, style: 'Footer', lines: ['MANAGER BRIEFING • LIVE DEMO'] })}
    </draw:page>`;
}).join('');

const document = `<?xml version="1.0" encoding="UTF-8"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:mimetype="application/vnd.oasis.opendocument.presentation" office:version="1.3">
  <office:font-face-decls>
    <style:font-face style:name="Arial" svg:font-family="Arial"/>
  </office:font-face-decls>
  <office:styles>
    <style:style style:name="Title" style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.08in"/><style:text-properties style:font-name="Arial" fo:font-size="26pt" fo:font-weight="bold" fo:color="#F8FAFC"/></style:style>
    <style:style style:name="Hero" style:family="paragraph"><style:text-properties style:font-name="Arial" fo:font-size="46pt" fo:font-weight="bold" fo:color="#EF4444"/></style:style>
    <style:style style:name="Subtitle" style:family="paragraph"><style:text-properties style:font-name="Arial" fo:font-size="25pt" fo:font-weight="bold" fo:color="#F8FAFC"/></style:style>
    <style:style style:name="Detail" style:family="paragraph"><style:text-properties style:font-name="Arial" fo:font-size="13pt" fo:color="#94A3B8"/></style:style>
    <style:style style:name="Body" style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.22in" fo:line-height="135%"/><style:text-properties style:font-name="Arial" fo:font-size="16pt" fo:color="#E2E8F0"/></style:style>
    <style:style style:name="Callout" style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.13in" fo:line-height="125%"/><style:text-properties style:font-name="Arial" fo:font-size="14pt" fo:font-weight="bold" fo:color="#F8FAFC"/></style:style>
    <style:style style:name="Mark" style:family="paragraph"><style:paragraph-properties fo:text-align="center" fo:margin-bottom="0.14in"/><style:text-properties style:font-name="Arial" fo:font-size="21pt" fo:font-weight="bold" fo:color="#F8FAFC"/></style:style>
    <style:style style:name="Footer" style:family="paragraph"><style:text-properties style:font-name="Arial" fo:font-size="7pt" fo:color="#64748B"/></style:style>
    <style:style style:name="FooterRight" style:family="paragraph"><style:paragraph-properties fo:text-align="end"/><style:text-properties style:font-name="Arial" fo:font-size="8pt" fo:color="#64748B"/></style:style>
  </office:styles>
  <office:automatic-styles>
    <style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="13.333in" fo:page-height="7.5in" style:print-orientation="landscape"/></style:page-layout>
    <style:style style:name="dpDark" style:family="drawing-page"><style:drawing-page-properties draw:fill="solid" draw:fill-color="#0B1020"/></style:style>
    <style:style style:name="grText" style:family="graphic"><style:graphic-properties draw:stroke="none" draw:fill="none" fo:padding="0in" draw:auto-grow-height="false"/></style:style>
    <style:style style:name="grAccent" style:family="graphic"><style:graphic-properties draw:stroke="none" draw:fill="solid" draw:fill-color="#EF4444"/></style:style>
    <style:style style:name="grPanel" style:family="graphic"><style:graphic-properties draw:stroke="none" draw:fill="solid" draw:fill-color="#172033" draw:opacity="100%"/></style:style>
  </office:automatic-styles>
  <office:master-styles><style:master-page style:name="Default" style:page-layout-name="pm1" draw:style-name="dpDark"/></office:master-styles>
  <office:body><office:presentation>${pages}
  </office:presentation></office:body>
</office:document>
`;

fs.writeFileSync(OUT, document);
console.log(`Wrote ${path.relative(process.cwd(), OUT)} (${slides.length} slides)`);
