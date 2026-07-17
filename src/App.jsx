import { useEffect, useMemo, useState } from 'react';
import adaAvatar from './avatars/ada.png';
import bobbAvatar from './avatars/bobb.png';
import eliAvatar from './avatars/eli.png';
import kiraAvatar from './avatars/kira.png';
import miloAvatar from './avatars/milo.png';
import zoeAvatar from './avatars/zoe.png';
import MarkdownDocument from './MarkdownDocument.jsx';
import GraphView from './GraphView.jsx';

const avatars = {
  ada: adaAvatar,
  bobb: bobbAvatar,
  eli: eliAvatar,
  kira: kiraAvatar,
  milo: miloAvatar,
  zoe: zoeAvatar,
};

const VAULT_ORDER_KEY = 'vault-order';

function readStoredVaultOrder() {
  try {
    const value = JSON.parse(localStorage.getItem(VAULT_ORDER_KEY) || '[]');
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function formatModified(value) {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function seeded(index, salt = 0) {
  const value = Math.sin(index * 999 + salt * 91.7) * 43758.5453;
  return value - Math.floor(value);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function renderMarkdown(markdown) {
  const escaped = markdown
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*)$/gm, '<h1>$1</h1>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '<span class="wikilink">$2</span>')
    .replace(/\[\[([^\]]+)\]\]/g, '<span class="wikilink">$1</span>')
    .replace(/\n/g, '<br />');
}

function splitFrontmatter(markdown) {
  const source = markdown.replace(/^\uFEFF/, '');
  const start = source.match(/^\s*---\s*\r?\n/);
  if (!start) return { frontmatter: [], body: source, header: '' };
  const rest = source.slice(start[0].length);
  const end = rest.match(/\r?\n---\s*(?:\r?\n|$)/);
  if (!end || end.index === undefined) return { frontmatter: [], body: source, header: '' };
  const raw = rest.slice(0, end.index).trim();
  const headerEnd = start[0].length + end.index + end[0].length;
  const header = source.slice(0, headerEnd).trimEnd();
  const body = source.slice(headerEnd).replace(/^\r?\n/, '');
  const frontmatter = [];
  let current = null;

  for (const line of raw.split(/\r?\n/)) {
    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (pair) {
      current = { key: pair[1], value: pair[2].trim(), list: [] };
      frontmatter.push(current);
      continue;
    }
    const listItem = line.match(/^\s*-\s*(.*)$/);
    if (listItem && current) current.list.push(listItem[1].replace(/^"|"$/g, ''));
  }

  return { frontmatter, body, header };
}

function replaceMarkdownBody(original, nextBody) {
  const parsed = splitFrontmatter(original);
  return parsed.header ? `${parsed.header}\n${nextBody}` : nextBody;
}

function normalizeMarkdownLine(line) {
  return line
    .normalize('NFKC')
    .replace(/^[\u0000-\u0020\u007F-\u009F\u00A0\u061C\u180E\u2000-\u200F\u2028-\u202F\u205F-\u206F\u3000\uFEFF]+/, '');
}

function headingFromLine(line) {
  const normalizedLine = normalizeMarkdownLine(line);
  const heading = normalizedLine.match(/^(#{1,6})[\s\u00A0]+(.+)$/);
  if (!heading) return null;
  const markdownLevel = heading[1].length;
  const hiddenPrefix = line.slice(0, line.length - normalizedLine.length);
  return {
    type: `h${markdownLevel}`,
    visualType: `h${Math.min(6, markdownLevel + 1)}`,
    text: heading[2],
    prefix: `${hiddenPrefix}${heading[1]} `,
  };
}

function titleFromNote(note, body) {
  const heading = body
    .split(/\r?\n/)
    .map(normalizeMarkdownLine)
    .find((line) => /^#\s+.+/.test(line))
    ?.replace(/^#\s+/, '')
    .trim();
  return heading || note?.name || 'Untitled';
}

function markdownLine(line, inCode) {
  const normalizedLine = normalizeMarkdownLine(line);
  if (/^```/.test(normalizedLine)) return { type: 'codeFence', text: normalizedLine, prefix: line.slice(0, line.length - normalizedLine.length) };
  if (inCode) return { type: 'code', text: line, prefix: '' };
  if (/^\s*---+\s*$/.test(normalizedLine) || /^\s*\*\*\*+\s*$/.test(normalizedLine)) return { type: 'divider', text: '', prefix: line };
  const heading = normalizedLine.match(/^(\s{0,3})(#{1,6})[\s\u00A0]+(.+)$/);
  if (heading) {
    const markdownLevel = heading[2].length;
    const hiddenPrefix = line.slice(0, line.length - normalizedLine.length);
    return {
      type: `h${markdownLevel}`,
      visualType: `h${Math.min(6, markdownLevel + 1)}`,
      text: heading[3],
      prefix: `${hiddenPrefix}${heading[1]}${heading[2]} `,
    };
  }
  const quote = normalizedLine.match(/^>\s?(.*)$/);
  if (quote) return { type: 'quote', text: quote[1], prefix: '> ' };
  const task = normalizedLine.match(/^(\s*-\s+\[[ xX]\]\s+)(.*)$/);
  if (task) return { type: 'task', text: task[2], prefix: task[1] };
  const list = normalizedLine.match(/^(\s*(?:[-*]|\d+\.)\s+)(.*)$/);
  if (list) return { type: 'list', text: list[2], prefix: list[1] };
  return { type: line.trim() ? 'paragraph' : 'empty', text: line, prefix: '' };
}

function splitEscapedPipes(row) {
  const trimmed = row.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = [];
  let cell = '';
  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (char === '|' && trimmed[index - 1] !== '\\') {
      cells.push(cell.trim().replace(/\\\|/g, '|'));
      cell = '';
    } else {
      cell += char;
    }
  }
  cells.push(cell.trim().replace(/\\\|/g, '|'));
  return cells;
}

function escapeTableCell(value) {
  return value.replace(/\|/g, '\\|');
}

function isTableSeparator(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function isTableRow(line) {
  return line.trim().startsWith('|') && line.includes('|');
}

function parseBlocks(body) {
  const rawLines = body.split('\n');
  const blocks = [];
  let inCode = false;
  let index = 0;

  while (index < rawLines.length) {
    const line = rawLines[index];
    if (!inCode && isTableRow(line) && isTableSeparator(rawLines[index + 1] || '')) {
      const start = index;
      const rows = [line, rawLines[index + 1]];
      index += 2;
      while (index < rawLines.length && isTableRow(rawLines[index])) {
        rows.push(rawLines[index]);
        index += 1;
      }
      blocks.push({ type: 'table', start, end: index - 1, rows });
      continue;
    }

    const parsed = markdownLine(line, inCode);
    blocks.push({ type: 'line', ...parsed, raw: line, index });
    if (parsed.type === 'codeFence') inCode = !inCode;
    index += 1;
  }

  return blocks;
}

function normalizeLinkTarget(value) {
  return value
    .replace(/\\\|.*$/, '')
    .replace(/\|.*$/, '')
    .replace(/\.md$/i, '')
    .replace(/\\/g, '/')
    .trim()
    .toLowerCase();
}

function resolveWikilink(target, vault) {
  if (!vault) return null;
  const normalized = normalizeLinkTarget(target);
  return vault.files.find((file) => {
    const noExt = file.path.replace(/\.md$/i, '').toLowerCase();
    const base = file.name.toLowerCase();
    return noExt === normalized || base === normalized;
  });
}

function parseInlineTokens(text) {
  const tokens = [];
  const regex = /(\[\[[^\]]+\]\]|\[[^\]\n|]+\|[^\]\n]+\]|\[[^\]\n]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*\n]+\*|https?:\/\/[^\s]+|(^|\s)#[A-Za-z0-9_\-/]+)/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) tokens.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    const value = match[0];
    if (value.startsWith('[[')) {
      const raw = value.slice(2, -2);
      const separator = raw.includes('\\|') ? '\\|' : '|';
      const [target, label] = raw.split(separator);
      tokens.push({ type: 'wikilink', value, target, label: (label || target).replace(/\\/g, '') });
    } else if (value.startsWith('[') && value.includes('|')) {
      const raw = value.slice(1, -1);
      const [target, label] = raw.split('|');
      tokens.push({ type: 'wikilink', value, target, label: label || target });
    } else if (value.startsWith('[') && value.includes('](')) {
      const link = value.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      tokens.push({ type: 'markdownLink', value, label: link?.[1] || value, href: link?.[2] || '' });
    } else if (value.startsWith('http')) {
      tokens.push({ type: 'url', value });
    } else if (value.startsWith('`')) {
      tokens.push({ type: 'inlineCode', value: value.slice(1, -1) });
    } else if (value.startsWith('**')) {
      tokens.push({ type: 'strong', value: value.slice(2, -2) });
    } else if (value.startsWith('*')) {
      tokens.push({ type: 'emphasis', value: value.slice(1, -1) });
    } else {
      const leading = value.match(/^\s/)?.[0] || '';
      const tag = value.trim().slice(1);
      if (leading) tokens.push({ type: 'text', value: leading });
      tokens.push({ type: 'tag', value: tag });
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) tokens.push({ type: 'text', value: text.slice(lastIndex) });
  return tokens;
}

function visibleInlineText(text) {
  return parseInlineTokens(text).map((token) => {
    if (token.type === 'wikilink') return token.label;
    if (token.type === 'tag') return `#${token.value}`;
    return token.value;
  }).join('');
}

function InlineContent({ text, activeVault, onOpenFile, onTag }) {
  return parseInlineTokens(text).map((token, index) => {
    if (token.type === 'wikilink') {
      const target = resolveWikilink(token.target, activeVault);
      return (
        <button
          key={`${token.value}-${index}`}
          type="button"
          className={`inline-wikilink ${target ? '' : 'is-missing'}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => target && onOpenFile(target.path)}
          title={target?.path || token.target}
        >
          {token.label}
        </button>
      );
    }
    if (token.type === 'tag') {
      return (
        <button
          key={`${token.value}-${index}`}
          type="button"
          className="inline-tag"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onTag(token.value)}
        >
          #{token.value}
        </button>
      );
    }
    if (token.type === 'url') {
      return (
        <a
          key={`${token.value}-${index}`}
          className="inline-wikilink"
          href={token.value}
          target="_blank"
          rel="noreferrer"
        >
          {token.value}
        </a>
      );
    }
    if (token.type === 'markdownLink') {
      return (
        <a
          key={`${token.value}-${index}`}
          className="inline-wikilink"
          href={token.href}
          target={token.href.startsWith('http') ? '_blank' : undefined}
          rel={token.href.startsWith('http') ? 'noreferrer' : undefined}
        >
          {token.label}
        </a>
      );
    }
    if (token.type === 'inlineCode') return <code className="inline-code" key={`${token.value}-${index}`}>{token.value}</code>;
    if (token.type === 'strong') return <strong className="inline-strong" key={`${token.value}-${index}`}>{token.value}</strong>;
    if (token.type === 'emphasis') return <em className="inline-emphasis" key={`${token.value}-${index}`}>{token.value}</em>;
    return <span key={`${token.value}-${index}`}>{token.value}</span>;
  });
}

function MarkdownTable({ block, body, onChange, activeVault, onOpenFile, onTag }) {
  const header = splitEscapedPipes(block.rows[0]);
  const align = splitEscapedPipes(block.rows[1]).map((cell) => {
    if (/^:-+:$/.test(cell)) return 'center';
    if (/^-+:$/.test(cell)) return 'right';
    return 'left';
  });
  const rows = block.rows.slice(2).map(splitEscapedPipes);

  function updateCell(rowIndex, cellIndex, value) {
    const rawLines = body.split('\n');
    const rowLineIndex = block.start + rowIndex;
    const cells = splitEscapedPipes(rawLines[rowLineIndex]);
    cells[cellIndex] = value;
    rawLines[rowLineIndex] = `| ${cells.map(escapeTableCell).join(' | ')} |`;
    onChange(rawLines.join('\n'));
  }

  return (
    <div className="md-table-wrap">
      <table className="md-table">
        <thead>
          <tr>
            {header.map((cell, cellIndex) => (
              <th key={`${cell}-${cellIndex}`} style={{ textAlign: align[cellIndex] || 'left' }}>
                <InlineContent text={cell} activeVault={activeVault} onOpenFile={onOpenFile} onTag={onTag} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`row-${rowIndex}`}>
              {header.map((_, cellIndex) => (
                <td key={`cell-${rowIndex}-${cellIndex}`} style={{ textAlign: align[cellIndex] || 'left' }}>
                  <div
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(event) => {
                      const nextText = event.currentTarget.innerText.replace(/\n/g, ' ');
                      const previousText = row[cellIndex] || '';
                      if (nextText !== visibleInlineText(previousText)) updateCell(rowIndex + 2, cellIndex, nextText);
                    }}
                  >
                    <InlineContent text={row[cellIndex] || ''} activeVault={activeVault} onOpenFile={onOpenFile} onTag={onTag} />
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MarkdownEditableLine({ block, activeVault, onOpenFile, onTag, onCommit }) {
  const forcedHeading = block.type === 'paragraph' ? headingFromLine(block.text) : null;
  const renderedBlock = forcedHeading || block;
  const commonProps = {
    contentEditable: true,
    suppressContentEditableWarning: true,
    onBlur: (event) => {
      const nextText = event.currentTarget.innerText.replace(/\n/g, '');
      if (nextText !== visibleInlineText(renderedBlock.text)) onCommit(nextText);
    },
    'data-empty': renderedBlock.type === 'empty' ? 'true' : undefined,
    'data-visual-type': renderedBlock.visualType || undefined,
  };
  const content = <InlineContent text={renderedBlock.text} activeVault={activeVault} onOpenFile={onOpenFile} onTag={onTag} />;

  if (renderedBlock.visualType === 'h2') {
    return <h2 className="md-line md-heading md-render-h2 note-heading note-heading--h2" data-md-heading="h2" {...commonProps}>{content}</h2>;
  }
  if (renderedBlock.visualType === 'h3') {
    return <h3 className="md-line md-heading md-render-h3 note-heading note-heading--h3" data-md-heading="h3" {...commonProps}>{content}</h3>;
  }
  if (renderedBlock.visualType === 'h4') {
    return <h4 className="md-line md-heading md-render-h4 note-heading note-heading--h4" data-md-heading="h4" {...commonProps}>{content}</h4>;
  }

  return (
    <div className={`md-line md-${renderedBlock.type}`} {...commonProps}>
      {content}
    </div>
  );
}

function MarkdownBodyEditor({ body, onChange, activeVault, onOpenFile, onTag }) {
  const blocks = useMemo(() => parseBlocks(body), [body]);

  function updateLine(index, nextText) {
    const rawLines = body.split('\n');
    const parsed = markdownLine(rawLines[index] || '', false);
    rawLines[index] = `${parsed.prefix}${nextText}`;
    onChange(rawLines.join('\n'));
  }

  return (
    <div className="markdown-editor" data-renderer-version="heading-fallback-v2" spellCheck="false">
      {blocks.map((block) => (
        block.type === 'table' ? (
          <MarkdownTable
            key={`table-${block.start}`}
            block={block}
            body={body}
            onChange={onChange}
            activeVault={activeVault}
            onOpenFile={onOpenFile}
            onTag={onTag}
          />
        ) : (
          <MarkdownEditableLine
            key={`${block.index}-${block.type}`}
            block={block}
            activeVault={activeVault}
            onOpenFile={onOpenFile}
            onTag={onTag}
            onCommit={(nextText) => updateLine(block.index, nextText)}
          />
        )
      ))}
    </div>
  );
}

function VaultRail({ vaults, activeVault, onSelectVault, onReorderVaults }) {
  const [draggingVaultId, setDraggingVaultId] = useState('');

  function dropVault(event, targetVaultId) {
    event.preventDefault();
    const sourceVaultId = event.dataTransfer.getData('text/plain') || draggingVaultId;
    setDraggingVaultId('');
    if (!sourceVaultId || sourceVaultId === targetVaultId) return;
    onReorderVaults(sourceVaultId, targetVaultId);
  }

  return (
    <nav className="vault-rail" aria-label="Vaults">
      {vaults.map((vault) => (
        <button
          key={vault.id}
          className={`vault-avatar ${activeVault?.id === vault.id ? 'is-active' : ''} ${draggingVaultId === vault.id ? 'is-dragging' : ''}`}
          draggable
          aria-grabbed={draggingVaultId === vault.id}
          onClick={() => onSelectVault(vault)}
          onDragStart={(event) => {
            setDraggingVaultId(vault.id);
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', vault.id);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
          }}
          onDrop={(event) => dropVault(event, vault.id)}
          onDragEnd={() => setDraggingVaultId('')}
          title={vault.name}
        >
          <img src={avatars[vault.avatar] || adaAvatar} alt="" />
        </button>
      ))}
    </nav>
  );
}

function TreeNode({ node, activePath, query, openFolders, onToggleFolder, onOpenFile, depth = 0 }) {
  if (node.type === 'folder') {
    const open = openFolders.has(node.path);
    return (
      <div>
        <button className="tree-row tree-folder" style={{ paddingLeft: 10 + depth * 14 }} onClick={() => onToggleFolder(node.path)}>
          <span className={`chevron ${open ? 'is-open' : ''}`}>{'>'}</span>
          <span className="tree-label">{node.name}</span>
        </button>
        {open && node.children?.map((child) => (
          <TreeNode
            key={`${child.type}:${child.path}`}
            node={child}
            activePath={activePath}
            query={query}
            openFolders={openFolders}
            onToggleFolder={onToggleFolder}
            onOpenFile={onOpenFile}
            depth={depth + 1}
          />
        ))}
      </div>
    );
  }

  return (
    <button
      className={`tree-row tree-file ${activePath === node.path ? 'is-active' : ''}`}
      style={{ paddingLeft: 28 + depth * 14 }}
      onClick={() => onOpenFile(node.path)}
    >
      <span className="tree-label">{node.label}</span>
    </button>
  );
}

function filterTree(nodes, query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return nodes;
  return nodes.flatMap((node) => {
    if (node.type === 'file') {
      return node.path.toLowerCase().includes(normalized) || node.label.toLowerCase().includes(normalized) ? [node] : [];
    }
    const children = filterTree(node.children || [], query);
    return children.length ? [{ ...node, children }] : [];
  });
}

function collectFolderPaths(nodes, paths = []) {
  for (const node of nodes || []) {
    if (node.type === 'folder') {
      paths.push(node.path);
      collectFolderPaths(node.children, paths);
    }
  }
  return paths;
}

function FileExplorer({ vault, activePath, query, onQueryChange, onOpenFile, openFolders, onToggleFolder, onResizeStart, isResizing }) {
  const tree = useMemo(() => filterTree(vault?.tree || [], query), [vault, query]);
  const visibleFolders = query.trim() ? new Set(collectFolderPaths(tree)) : openFolders;

  return (
    <aside className="file-pane">
      <div className="pane-title">
        <span>{vault?.name || 'Vault'}</span>
        <strong>{vault?.notes || 0}</strong>
      </div>
      <input
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        className="search-input"
        placeholder="Search files..."
      />
      <div className="tree-list">
        {tree.map((node) => (
          <TreeNode
            key={`${node.type}:${node.path}`}
            node={node}
            activePath={activePath}
            query={query}
            openFolders={visibleFolders}
            onToggleFolder={onToggleFolder}
            onOpenFile={onOpenFile}
          />
        ))}
      </div>
      <div
        className={`resize-handle ${isResizing ? 'is-resizing' : ''}`}
        onMouseDown={onResizeStart}
      />
    </aside>
  );
}

function FlatFileSearch({ vault, activePath, query, onQueryChange, onOpenFile, onResizeStart, isResizing }) {
  const files = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return [...(vault?.files || [])].sort((a, b) => a.path.localeCompare(b.path)).filter((file) => {
      if (!normalized) return true;
      return file.path.toLowerCase().includes(normalized) || file.name.toLowerCase().includes(normalized);
    });
  }, [vault, query]);

  return (
    <aside className="file-pane">
      <div className="pane-title">
        <span>{vault?.name || 'Vault'}</span>
        <strong>{vault?.notes || 0}</strong>
      </div>
      <input
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        className="search-input"
        placeholder="Search files..."
      />
      <div className="file-list">
        {files.map((file) => (
          <button
            key={file.path}
            className={`file-row ${activePath === file.path ? 'is-active' : ''}`}
            onClick={() => onOpenFile(file.path)}
          >
            <span className="file-name">{file.name}</span>
            <span className="file-folder">{file.folder}</span>
          </button>
        ))}
      </div>
      <div
        className={`resize-handle ${isResizing ? 'is-resizing' : ''}`}
        onMouseDown={onResizeStart}
      />
    </aside>
  );
}

function cleanPropertyValue(value) {
  return value.trim().replace(/^"|"$/g, '');
}

function propertyValues(property) {
  if (property.list.length) return property.list.map(cleanPropertyValue);
  const value = cleanPropertyValue(property.value);
  if (value.startsWith('[') && value.endsWith(']') && !value.startsWith('[[')) {
    return value.slice(1, -1).split(/,\s*/).map(cleanPropertyValue).filter(Boolean);
  }
  return value ? [value] : [];
}

function Properties({ properties, activeVault, onOpenFile, onTag }) {
  if (!properties.length) return null;

  return (
    <section className="properties-block">
      <h2>Proprietes</h2>
      <div className="properties-grid">
        {properties.map((property) => {
          const values = propertyValues(property);
          const isTagList = property.key === 'tags' || property.key === 'tag';
          return (
            <div className="property-row" key={property.key}>
              <div className="property-key">
                <span className="property-icon">=</span>
                <span>{property.key}</span>
              </div>
              <div className="property-value">
                {values.map((value, index) => {
                  const normalized = value.replace(/^#/, '');
                  if (isTagList) {
                    return (
                      <button
                        type="button"
                        className="property-pill"
                        key={`${value}-${index}`}
                        onClick={() => onTag(normalized.replace(/\[\[|\]\]/g, ''))}
                      >
                        {normalized.replace(/\[\[|\]\]/g, '')}
                      </button>
                    );
                  }
                  return (
                    <span key={`${value}-${index}`}>
                      <InlineContent text={value} activeVault={activeVault} onOpenFile={onOpenFile} onTag={onTag} />
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <button className="add-property">+ Ajouter une propriete</button>
    </section>
  );
}

function MarkdownEditor({ note, content, setContent, saving, dirty, onSave, activeVault, onOpenFile, onTag }) {
  const parsed = useMemo(() => splitFrontmatter(content), [content]);
  const title = titleFromNote(note, parsed.body);

  if (!note) {
    return (
      <main className="editor-empty">
        <div>Select a note from the current vault.</div>
      </main>
    );
  }

  return (
    <main className="editor-pane">
      <header className="note-header">
        <div className="note-nav">
          <button aria-label="Back">{'<'}</button>
          <button aria-label="Forward">{'>'}</button>
        </div>
        <div className="note-breadcrumb">{note.path.replace(/\.md$/i, '').split('/').map((part, index, parts) => (
          <span key={`${part}-${index}`}>{part}{index < parts.length - 1 ? ' / ' : ''}</span>
        ))}</div>
        <div className="note-actions">
          <span className={dirty ? 'dirty is-dirty' : 'dirty'}>{dirty ? 'Unsaved' : 'Saved'}</span>
          <button onClick={onSave} disabled={saving || !dirty}>{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </header>
      <section className="note-workspace">
        <div className="obsidian-note">
          <h1>{title}</h1>
          <Properties properties={parsed.frontmatter} activeVault={activeVault} onOpenFile={onOpenFile} onTag={onTag} />
        </div>
        <MarkdownDocument
          body={parsed.body}
          title={title}
          onChange={(nextBody) => setContent(replaceMarkdownBody(content, nextBody))}
          activeVault={activeVault}
          onOpenFile={onOpenFile}
          onTag={onTag}
        />
      </section>
    </main>
  );
}

export default function App() {
  const [vaults, setVaults] = useState([]);
  const [root, setRoot] = useState('');
  const [activeVaultId, setActiveVaultId] = useState('');
  const [activePath, setActivePath] = useState('');
  const [content, setContent] = useState('');
  const [lastSaved, setLastSaved] = useState('');
  const [query, setQuery] = useState('');
  const [view, setView] = useState('note');
  const [graph, setGraph] = useState(null);
  const [openFoldersByVault, setOpenFoldersByVault] = useState({});
  const [vaultOrder, setVaultOrder] = useState(readStoredVaultOrder);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [filePaneWidth, setFilePaneWidth] = useState(() => {
    const saved = localStorage.getItem('file-pane-width');
    return saved ? parseInt(saved, 10) : 286;
  });
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e) => {
      const railWidth = window.innerWidth <= 1100 ? 88 : 96;
      const newWidth = Math.max(180, Math.min(600, e.clientX - railWidth));
      setFilePaneWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  useEffect(() => {
    if (!isResizing) {
      localStorage.setItem('file-pane-width', filePaneWidth.toString());
    }
  }, [isResizing, filePaneWidth]);

  const activeVault = vaults.find((vault) => vault.id === activeVaultId);
  const activeFile = activeVault?.files.find((file) => file.path === activePath);
  const dirty = content !== lastSaved;
  const allFolderPaths = useMemo(() => collectFolderPaths(activeVault?.tree || []), [activeVault]);
  const defaultOpenFolders = useMemo(() => [], [activeVaultId]);
  const currentOpenFolders = new Set(openFoldersByVault[activeVaultId] || defaultOpenFolders);
  const foldersExpanded = allFolderPaths.length > 0 && allFolderPaths.every((folderPath) => currentOpenFolders.has(folderPath));
  const orderedVaults = useMemo(() => {
    const byId = new Map(vaults.map((vault) => [vault.id, vault]));
    const orderedIds = vaultOrder.filter((vaultId) => byId.has(vaultId));
    const knownIds = new Set(orderedIds);
    const missingIds = vaults.map((vault) => vault.id).filter((vaultId) => !knownIds.has(vaultId));
    return [...orderedIds, ...missingIds].map((vaultId) => byId.get(vaultId)).filter(Boolean);
  }, [vaults, vaultOrder]);

  async function refreshVaults(nextVaultId = activeVaultId, nextPath = activePath) {
    const response = await fetch('/api/vaults');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Cannot load vaults');
    setRoot(data.root);
    setVaults(data.vaults);

    const selectedVault = data.vaults.find((vault) => vault.id === nextVaultId) || data.vaults[0];
    setActiveVaultId(selectedVault?.id || '');
    const selectedPath = selectedVault?.files.some((file) => file.path === nextPath)
      ? nextPath
      : selectedVault?.files[0]?.path || '';
    setActivePath(selectedPath);
  }

  async function openNote(vaultId, pathValue) {
    if (!vaultId || !pathValue) return;
    const response = await fetch(`/api/note?vaultId=${encodeURIComponent(vaultId)}&path=${encodeURIComponent(pathValue)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Cannot load note');
    setContent(data.content);
    setLastSaved(data.content);
  }

  async function loadGraph(vaultId, signal) {
    if (!vaultId) return;
    const response = await fetch(`/api/graph?vaultId=${encodeURIComponent(vaultId)}`, { signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Cannot load graph');
    if (signal?.aborted || data.vaultId !== vaultId) return;
    setGraph(data);
  }

  async function saveNote() {
    if (!activeVault || !activePath) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vaultId: activeVault.id, path: activePath, content }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Cannot save note');
      setLastSaved(content);
      await refreshVaults(activeVault.id, activePath);
      await openNote(activeVault.id, activePath);
      await loadGraph(activeVault.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function selectVault(vault) {
    setActiveVaultId(vault.id);
    setActivePath(vault.files[0]?.path || '');
    setGraph(null);
    setQuery('');
  }

  function reorderVaults(sourceVaultId, targetVaultId) {
    setVaultOrder((currentOrder) => {
      const currentIds = currentOrder.length ? currentOrder : vaults.map((vault) => vault.id);
      const availableIds = new Set(vaults.map((vault) => vault.id));
      const nextOrder = currentIds.filter((vaultId) => availableIds.has(vaultId) && vaultId !== sourceVaultId);
      const targetIndex = nextOrder.indexOf(targetVaultId);
      if (targetIndex === -1) return currentOrder;
      nextOrder.splice(targetIndex, 0, sourceVaultId);
      localStorage.setItem(VAULT_ORDER_KEY, JSON.stringify(nextOrder));
      return nextOrder;
    });
  }

  function toggleFolder(folderPath) {
    if (!activeVault) return;
    setOpenFoldersByVault((current) => {
      const next = new Set(current[activeVault.id] || []);
      if (next.has(folderPath)) next.delete(folderPath);
      else next.add(folderPath);
      return { ...current, [activeVault.id]: [...next] };
    });
  }

  function toggleAllFolders() {
    if (!activeVault) return;
    setOpenFoldersByVault((current) => ({
      ...current,
      [activeVault.id]: foldersExpanded ? [] : allFolderPaths,
    }));
  }

  useEffect(() => {
    refreshVaults().catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    openNote(activeVaultId, activePath).catch((err) => setError(err.message));
  }, [activeVaultId, activePath, vaults]);

  useEffect(() => {
    if (!activeVaultId) {
      setGraph(null);
      return undefined;
    }
    const controller = new AbortController();
    setGraph(null);
    loadGraph(activeVaultId, controller.signal).catch((err) => {
      if (err.name !== 'AbortError') setError(err.message);
    });
    return () => controller.abort();
  }, [activeVaultId, vaults]);

  useEffect(() => {
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveNote();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeVault, activePath, content]);

  return (
    <div className="obsidian-shell" style={{ '--file-pane-width': `${filePaneWidth}px` }}>
      <VaultRail vaults={orderedVaults} activeVault={activeVault} onSelectVault={selectVault} onReorderVaults={reorderVaults} />
      <FileExplorer
        vault={activeVault}
        activePath={activePath}
        query={query}
        onQueryChange={setQuery}
        onOpenFile={setActivePath}
        openFolders={currentOpenFolders}
        onToggleFolder={toggleFolder}
        onResizeStart={() => setIsResizing(true)}
        isResizing={isResizing}
      />
      <div className="main-column">
        <header className="top-bar">
          <nav className="top-menu" aria-label="Workspace menu">
            <button className={view === 'graph' ? 'is-selected' : ''} onClick={() => setView('graph')}>Synapse</button>
            <button onClick={toggleAllFolders} disabled={!allFolderPaths.length}>{foldersExpanded ? 'Replier dossiers' : 'Deplier dossiers'}</button>
            <button type="button">Codex</button>
            <button type="button">Gemini</button>
          </nav>
          <div className="top-title-row">
            <div className="top-title">
              <strong>{activeVault?.name || 'No vault'}</strong>
              <span>{root}</span>
            </div>
            <div className="top-actions">
              {error && <span className="error-text">{error}</span>}
              <button className={view === 'note' ? 'is-selected' : ''} onClick={() => setView('note')}>Note</button>
              <button onClick={() => refreshVaults(activeVaultId, activePath)}>Refresh</button>
            </div>
          </div>
        </header>
        {view === 'graph' ? (
          <GraphView vault={activeVault} graph={graph} activePath="" onOpenFile={(node) => { setActivePath(node.filePath); setView('note'); }} />
        ) : (
          <MarkdownEditor
            note={activeFile}
            content={content}
            setContent={setContent}
            saving={saving}
            dirty={dirty}
            onSave={saveNote}
            activeVault={activeVault}
            onOpenFile={setActivePath}
            onTag={(tag) => setQuery(tag)}
          />
        )}
      </div>
    </div>
  );
}
