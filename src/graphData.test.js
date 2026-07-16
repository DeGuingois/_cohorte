import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGraphData,
  extractWikiLinks,
  parseFrontmatter,
  parseWikiLink,
  splitMarkdownFrontmatter,
} from './graphData.js';

const agentReach = `---
title: "Agent Reach"
canonical_name: agent_reach
type: source
source_type: github
status: reference
folder: 10_sources/github
source_url: "https://github.com/Panniantong/agent-reach"
raw_note: "[[2026-07-10_raw_github_agent_reach|Brouillon d'origine]]"
tags:
  - source/github
  - tech/dev
related:
  - "[[agent_ia|Agent IA]]"
  - "[[web_scraping|Web scraping]]"
---

# Agent Reach

- [[agent_ia|Agent IA]]
- [[agent_ia#Section|Agent IA]]
- [[https://github.com/example/nope]]
- [[missing_note|Manquant]]
`;

test('parse le frontmatter YAML simple et conserve le corps Markdown', () => {
  const parsed = splitMarkdownFrontmatter(agentReach);
  assert.equal(parsed.frontmatter.title, 'Agent Reach');
  assert.equal(parsed.frontmatter.canonical_name, 'agent_reach');
  assert.deepEqual(parsed.frontmatter.tags, ['source/github', 'tech/dev']);
  assert.match(parsed.body, /# Agent Reach/);
});

test('parse les wikilinks avec alias et fragment sans utiliser alias comme cible', () => {
  assert.deepEqual(parseWikiLink('[[agent_ia#Fonctionnement|Agent IA]]'), {
    raw: '[[agent_ia#Fonctionnement|Agent IA]]',
    target: 'agent_ia',
    alias: 'Agent IA',
    heading: 'Fonctionnement',
  });
  assert.equal(parseWikiLink('[[https://github.com/example]]'), null);
});

test('extrait les wikilinks du corps et ignore les URLs externes', () => {
  const links = extractWikiLinks('[[agent_ia]] [[agent_ia|Agent IA]] [[https://example.com/a]]');
  assert.deepEqual(links.map((link) => link.target), ['agent_ia', 'agent_ia']);
});

test('construit un graphe avec frontmatter, corps, deduplication et noeuds manquants', () => {
  const graph = buildGraphData({
    vaultId: 'ada-vault',
    files: [
      { path: '10_sources/github/2026-07-10_github_agent_reach.md', folder: '10_sources/github', content: agentReach },
      { path: '20_concepts/agent_ia.md', folder: '20_concepts', content: '---\ntitle: "Agent IA"\ncanonical_name: agent_ia\n---\n# Agent IA' },
      { path: '20_concepts/web_scraping.md', folder: '20_concepts', content: '# Web scraping' },
      { path: '00_raw/2026-07-10_raw_github_agent_reach.md', folder: '00_raw', content: '# Brouillon' },
    ],
  });

  const source = graph.nodes.find((node) => node.canonicalName === 'agent_reach');
  const agent = graph.nodes.find((node) => node.canonicalName === 'agent_ia');
  const raw = graph.nodes.find((node) => node.filePath === '00_raw/2026-07-10_raw_github_agent_reach.md');
  const missing = graph.nodes.find((node) => node.isMissing && node.canonicalName === 'missing_note');

  assert.equal(source.title, 'Agent Reach');
  assert.ok(agent);
  assert.ok(raw);
  assert.ok(missing);
  assert.equal(graph.edges.filter((edge) => edge.source === source.id && edge.target === agent.id).length, 1);
  assert.equal(graph.edges.find((edge) => edge.source === source.id && edge.target === agent.id).occurrences, 3);
  assert.ok(graph.edges.some((edge) => edge.kinds.includes('related')));
  assert.ok(graph.edges.some((edge) => edge.kinds.includes('raw-note') && edge.target === raw.id));
  assert.equal(graph.edges.some((edge) => edge.target.includes('https')), false);
});

test('ne relie pas une cible ambigue par nom de fichier ou titre', () => {
  const graph = buildGraphData({
    vaultId: 'vault',
    files: [
      { path: 'source.md', content: '# Source\n[[same]]' },
      { path: 'a/same.md', content: '# Same' },
      { path: 'b/same.md', content: '# Same' },
    ],
  });

  const missing = graph.nodes.find((node) => node.isMissing && node.canonicalName === 'same');
  assert.ok(missing);
  assert.ok(graph.edges.some((edge) => edge.target === missing.id));
});
