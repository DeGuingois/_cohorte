import { useEffect, useMemo, useState } from 'react';
import MarkdownDocument from './MarkdownDocument.jsx';
import GraphView from './GraphView.jsx';
import TerminalPanel from './TerminalPanel.jsx';

const avatarModules = import.meta.glob('./avatars/*.png', { eager: true, import: 'default' });

const avatars = {};
for (const pathKey in avatarModules) {
  const filename = pathKey.split('/').pop();
  const name = filename.replace(/\.png$/i, '');
  avatars[name] = avatarModules[pathKey];
  const normalizedKey = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!avatars[normalizedKey]) {
    avatars[normalizedKey] = avatarModules[pathKey];
  }
}

function getAvatarSrc(vault) {
  if (!vault) return avatars.ada || Object.values(avatars)[0];

  if (vault.avatar && avatars[vault.avatar]) {
    return avatars[vault.avatar];
  }

  if (vault.avatar) {
    const normAvatar = vault.avatar.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (avatars[normAvatar]) return avatars[normAvatar];
  }

  const vaultName = vault.name || vault.id || '';
  const normVaultName = vaultName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const matches = Object.keys(avatars).filter((key) => {
    const normKey = key.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return normVaultName.includes(normKey);
  });

  if (matches.length > 0) {
    matches.sort((a, b) => b.length - a.length);
    return avatars[matches[0]];
  }

  return avatars.ada || Object.values(avatars)[0];
}

const VAULT_ORDER_KEY = 'vault-order';
const DEFAULT_TERMINAL_BUTTONS = [{ id: 'codex', label: 'Codex', command: 'codex' }, { id: 'gemini', label: 'Gemini', command: 'agy' }];

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
          <img src={getAvatarSrc(vault)} alt="" draggable={false} />
        </button>
      ))}
    </nav>
  );
}

function TreeNode({ node, activePath, query, openFolders, onToggleFolder, onOpenFile, onCreateFile, depth = 0 }) {
  const [creating, setCreating] = useState(false);
  const [fileName, setFileName] = useState('');
  const [createError, setCreateError] = useState('');

  async function submitNewFile(event) {
    event.preventDefault();
    event.stopPropagation();
    try {
      await onCreateFile(node.path, fileName);
      setCreating(false);
      setFileName('');
      setCreateError('');
    } catch (error) {
      setCreateError(error.message);
    }
  }

  if (node.type === 'folder') {
    const open = openFolders.has(node.path);
    return (
      <div>
        <div className="tree-row tree-folder" style={{ paddingLeft: 10 + depth * 14 }}>
          <button type="button" className="tree-folder-toggle" onClick={() => onToggleFolder(node.path)}>
            <span className={`chevron ${open ? 'is-open' : ''}`}>{'>'}</span>
            <span className="tree-label">{node.name}</span>
          </button>
          <button
            type="button"
            className="tree-create-file"
            title={`Créer une note dans ${node.name}`}
            aria-label={`Créer une note dans ${node.name}`}
            onClick={() => {
              if (!open) onToggleFolder(node.path);
              setCreating(true);
              setCreateError('');
            }}
          >
            +
          </button>
        </div>
        {creating && (
          <form className="tree-create-form" style={{ paddingLeft: 28 + (depth + 1) * 14 }} onSubmit={submitNewFile}>
            <input
              autoFocus
              value={fileName}
              onChange={(event) => setFileName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setCreating(false);
                  setFileName('');
                  setCreateError('');
                }
              }}
              onBlur={() => { if (!fileName.trim()) setCreating(false); }}
              placeholder="Nouvelle note"
              aria-label="Nom de la nouvelle note"
            />
            {createError && <span className="tree-create-error" title={createError}>!</span>}
          </form>
        )}
        {open && node.children?.map((child) => (
          <TreeNode
            key={`${child.type}:${child.path}`}
            node={child}
            activePath={activePath}
            query={query}
            openFolders={openFolders}
            onToggleFolder={onToggleFolder}
            onOpenFile={onOpenFile}
            onCreateFile={onCreateFile}
            depth={depth + 1}
          />
        ))}
      </div>
    );
  }

  return (
    <button className={`tree-row tree-file ${activePath === node.path ? 'is-active' : ''}`} style={{ paddingLeft: 28 + depth * 14 }} onClick={() => onOpenFile(node.path)}>
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

function FileExplorer({ vault, activePath, query, onQueryChange, onOpenFile, onCreateFile, openFolders, onToggleFolder, onResizeStart, isResizing }) {
  const tree = useMemo(() => filterTree(vault?.tree || [], query), [vault, query]);
  const visibleFolders = query.trim() ? new Set(collectFolderPaths(tree)) : openFolders;
  const [creatingRoot, setCreatingRoot] = useState(false);
  const [rootFileName, setRootFileName] = useState('');
  const [rootCreateError, setRootCreateError] = useState('');

  async function submitRootFile(event) {
    event.preventDefault();
    event.stopPropagation();
    try {
      await onCreateFile('', rootFileName);
      setCreatingRoot(false);
      setRootFileName('');
      setRootCreateError('');
    } catch (error) {
      setRootCreateError(error.message);
    }
  }

  return (
    <aside className="file-pane">
      <div className="pane-title">
        <span>{vault?.name || 'Vault'}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <strong>{vault?.notes || 0}</strong>
          <button
            type="button"
            className="tree-create-file"
            title="Créer une note à la racine"
            aria-label="Créer une note à la racine"
            onClick={() => {
              setCreatingRoot(true);
              setRootCreateError('');
            }}
          >
            +
          </button>
        </div>
      </div>
      {creatingRoot && (
        <form className="tree-create-form" style={{ padding: '4px 10px' }} onSubmit={submitRootFile}>
          <input
            autoFocus
            value={rootFileName}
            onChange={(event) => setRootFileName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setCreatingRoot(false);
                setRootFileName('');
                setRootCreateError('');
              }
            }}
            placeholder="Nouvelle note"
            aria-label="Nom de la nouvelle note à la racine"
          />
          {rootCreateError && <span className="tree-create-error" title={rootCreateError}>!</span>}
        </form>
      )}
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
            onCreateFile={onCreateFile}
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
  const [editorMode, setEditorMode] = useState('preview');
  const parsed = useMemo(() => splitFrontmatter(content), [content]);
  const title = titleFromNote(note, parsed.body);

  useEffect(() => {
    setEditorMode('preview');
  }, [note?.path]);

  if (!note) {
    return (
      <main className="editor-empty">
        <div>Select a note from the current vault.</div>
      </main>
    );
  }

  const handleBodyChange = (nextBody) => {
    setContent(replaceMarkdownBody(content, nextBody));
  };

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
        <div className="note-mode-toggle">
          <button
            type="button"
            className={`mode-btn ${editorMode === 'edit' ? 'is-active' : ''}`}
            onClick={() => setEditorMode('edit')}
            title="Éditeur texte brut"
          >
            ✏️ Édition
          </button>
          <button
            type="button"
            className={`mode-btn ${editorMode === 'preview' ? 'is-active' : ''}`}
            onClick={() => setEditorMode('preview')}
            title="Aperçu rendu"
          >
            👁️ Aperçu
          </button>
          <button
            type="button"
            className={`mode-btn ${editorMode === 'live' ? 'is-active' : ''}`}
            onClick={() => setEditorMode('live')}
            title="Édition et rendu côte à côte"
          >
            🌗 Scindé
          </button>
        </div>
        <div className="note-actions">
          <span className={dirty ? 'dirty is-dirty' : 'dirty'}>{dirty ? 'Unsaved' : 'Saved'}</span>
          <button onClick={onSave} disabled={saving || !dirty}>{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </header>
      <section className={`note-workspace mode-${editorMode}`}>
        {(editorMode === 'edit' || editorMode === 'live') && (
          <div className="note-editor-wrapper">
            <div className="obsidian-note">
              <h1>{title}</h1>
              <Properties properties={parsed.frontmatter} activeVault={activeVault} onOpenFile={onOpenFile} onTag={onTag} />
            </div>
            <textarea
              className="note-raw-textarea"
              value={parsed.body}
              onChange={(e) => handleBodyChange(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                  e.preventDefault();
                  onSave?.();
                }
              }}
              placeholder="Saisissez votre note Markdown ici..."
              spellCheck={false}
            />
          </div>
        )}
        {(editorMode === 'preview' || editorMode === 'live') && (
          <div className="note-preview-wrapper">
            {editorMode === 'preview' && (
              <div className="obsidian-note">
                <h1>{title}</h1>
                <Properties properties={parsed.frontmatter} activeVault={activeVault} onOpenFile={onOpenFile} onTag={onTag} />
              </div>
            )}
            <MarkdownDocument
              body={parsed.body}
              title={title}
              activeVault={activeVault}
              onOpenFile={onOpenFile}
              onTag={onTag}
            />
          </div>
        )}
      </section>
    </main>
  );
}

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function OptionsModal({ currentRoot, terminalButtons, onClose, onSaved }) {
  const [inputValue, setInputValue] = useState(currentRoot);
  const [buttonDrafts, setButtonDrafts] = useState(() => terminalButtons.map((item) => ({ ...item })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function handleSave(event) {
    event.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      const normalizedButtons = buttonDrafts.map(({ id, label, command }) => ({ id, label: label.trim(), command: command.trim() }));
      if (!normalizedButtons.length || normalizedButtons.some(({ label, command }) => !label || !command)) throw new Error('Chaque bouton doit avoir un nom et une commande.');
      const data = await window.electronAPI.saveSettings({ vaultsRoot: trimmed, terminalButtons: normalizedButtons });
      if (!data.ok) throw new Error(data.error || 'Erreur lors de la sauvegarde');
      setSuccess(true);
      await onSaved(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleBackdropClick(event) {
    if (event.target === event.currentTarget) onClose();
  }

  return (
    <div className="options-backdrop" onClick={handleBackdropClick} role="dialog" aria-modal="true" aria-label="Options">
      <div className="options-modal">
        <div className="options-modal-header">
          <div className="options-modal-title">
            <GearIcon />
            <span>Options</span>
          </div>
          <button className="options-close" onClick={onClose} aria-label="Fermer">&times;</button>
        </div>
        <div className="options-modal-body">
          <form onSubmit={handleSave}>
            <fieldset className="options-fieldset">
              <legend className="options-legend">Répertoire des vaults</legend>
              <p className="options-description">
                Chemin absolu vers le dossier contenant vos vaults Obsidian.
                Chaque sous-dossier sera traité comme un vault distinct.
              </p>
              <label className="options-label" htmlFor="vaults-root-input">
                <FolderIcon />
                <span>Chemin du répertoire</span>
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  id="vaults-root-input"
                  className="options-input"
                  type="text"
                  value={inputValue}
                  readOnly
                  placeholder="Ex: C:\Users\Vous\Documents\mes-vaults"
                />
                <button 
                  type="button" 
                  className="options-btn options-btn--secondary" 
                  onClick={async () => {
                    const dir = await window.electronAPI.pickDirectory();
                    if (dir) setInputValue(dir);
                  }}
                >
                  Parcourir
                </button>
              </div>
            <fieldset className="options-fieldset">
              <legend className="options-legend">Boutons terminal</legend>
              <p className="options-description">Choisissez le nom affiché et la commande exécutée.</p>
              {buttonDrafts.map((item, index) => (
                <div className="terminal-button-setting" key={index}>
                  <label><span>Nom du bouton</span><input className="options-input" value={item.label} onChange={(event) => setButtonDrafts((current) => current.map((button, i) => i === index ? { ...button, label: event.target.value } : button))} /></label>
                  <label><span>Commande</span><input className="options-input" value={item.command} onChange={(event) => setButtonDrafts((current) => current.map((button, i) => i === index ? { ...button, command: event.target.value } : button))} /></label>
                  <button type="button" className="options-btn options-btn--secondary" onClick={() => setButtonDrafts((current) => current.filter((_, i) => i !== index))}>&times;</button>
                </div>
              ))}
              <button type="button" className="options-btn options-btn--secondary" onClick={() => setButtonDrafts((current) => [...current, { id: crypto.randomUUID(), label: '', command: '' }])}>+ Ajouter un bouton</button>
            </fieldset>              {error && <p className="options-error">{error}</p>}
              {success && <p className="options-success">✓ Répertoire mis à jour — vaults rechargés.</p>}
            </fieldset>
            <div className="options-modal-footer">
              <button type="button" className="options-btn options-btn--secondary" onClick={onClose}>Annuler</button>
              <button type="submit" className="options-btn options-btn--primary" disabled={saving || !inputValue.trim()}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
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
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [filePaneWidth, setFilePaneWidth] = useState(() => {
    const saved = localStorage.getItem('file-pane-width');
    return saved ? parseInt(saved, 10) : 286;
  });
  const [isResizing, setIsResizing] = useState(false);
  const [activeTerminalId, setActiveTerminalId] = useState('');
  const [terminalButtons, setTerminalButtons] = useState(DEFAULT_TERMINAL_BUTTONS);

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
    const data = await window.electronAPI.getVaults();
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
    const data = await window.electronAPI.getNote(vaultId, pathValue);
    setContent(data.content);
    setLastSaved(data.content);
  }

  async function loadGraph(vaultId, signal) {
    if (!vaultId) return;
    const data = await window.electronAPI.getGraph(vaultId);
    if (signal?.aborted || data.vaultId !== vaultId) return;
    setGraph(data);
  }

  async function saveNote() {
    if (!activeVault || !activePath) return;
    setSaving(true);
    setError('');
    try {
      const data = await window.electronAPI.saveNote(activeVault.id, activePath, content);
      if (!data.ok) throw new Error(data.error || 'Cannot save note');
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

  useEffect(() => {
    if (!activeVault || !activePath || !dirty || saving) return undefined;
    const timer = setTimeout(() => {
      saveNote();
    }, 700);
    return () => clearTimeout(timer);
  }, [content, dirty, activeVault, activePath, saving]);

  async function createNote(folderPath, requestedName) {
    if (!activeVault) throw new Error('Aucun vault sélectionné.');
    const trimmed = requestedName.trim();
    if (!trimmed) throw new Error('Saisissez un nom de fichier.');
    if (/[\\/:*?"<>|]/.test(trimmed) || trimmed === '.' || trimmed === '..') {
      throw new Error('Ce nom de fichier contient un caractère interdit.');
    }
    const cleanTitle = trimmed.replace(/\.md$/i, '');
    const fileName = `${cleanTitle}.md`;
    const notePath = (folderPath && folderPath !== '/') ? `${folderPath}/${fileName}` : fileName;
    const res = await window.electronAPI.createNote(activeVault.id, notePath, `# ${cleanTitle}\n\n`);
    const finalPath = res?.path || notePath;
    await refreshVaults(activeVault.id, finalPath);
    await openNote(activeVault.id, finalPath);
    setActivePath(finalPath);
    setView('note');
  }
  function selectVault(vault) {
    setActiveVaultId(vault.id);
    setActivePath(vault.files[0]?.path || '');
    setView('note');
    setGraph(null);
    setQuery('');
  }

  function reorderVaults(sourceVaultId, targetVaultId) {
    setVaultOrder((currentOrder) => {
      const byId = new Map(vaults.map((v) => [v.id, v]));
      const orderedIds = currentOrder.filter((vId) => byId.has(vId));
      const knownIds = new Set(orderedIds);
      const missingIds = vaults.map((v) => v.id).filter((vId) => !knownIds.has(vId));
      const fullOrder = [...orderedIds, ...missingIds];

      const nextOrder = fullOrder.filter((vId) => vId !== sourceVaultId);
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
    window.electronAPI.getSettings()
      .then((settings) => setTerminalButtons(settings.terminalButtons || DEFAULT_TERMINAL_BUTTONS))
      .catch((err) => setError(err.message));
  }, []);
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
    document.title = 'Cohorte - Orchrestration LLM souveraine';
  }, []);

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
        onCreateFile={createNote}
        openFolders={currentOpenFolders}
        onToggleFolder={toggleFolder}
        onResizeStart={() => setIsResizing(true)}
        isResizing={isResizing}
      />
      <div className="main-column">
        <header className="top-bar">
          <nav className="top-menu" aria-label="Workspace menu">
            <button className={view === 'note' ? 'is-selected' : ''} onClick={() => setView('note')}>Note</button>
            <button className={view === 'graph' ? 'is-selected' : ''} onClick={() => setView('graph')}>Synapse</button>
            {terminalButtons.map((item) => (
              <button type="button" key={item.id} className={view === 'terminal' && activeTerminalId === item.id ? 'is-selected' : ''} onClick={() => { setActiveTerminalId(item.id); setView('terminal'); }}>{item.label}</button>
            ))}
            <button onClick={toggleAllFolders} disabled={!allFolderPaths.length}>{foldersExpanded ? 'Replier dossiers' : 'Déplier dossiers'}</button>
            <button onClick={() => refreshVaults(activeVaultId, activePath)}>Refresh</button>
            <button id="settings-btn" className={`top-settings-btn ${optionsOpen ? 'is-active' : ''}`} aria-label="Options" title="Options" onClick={() => setOptionsOpen(true)}><GearIcon /></button>
          </nav>
          <div className="top-title">
            <strong>{activeVault?.name || 'No vault'}</strong>
            <span>{error || root}</span>
          </div>
        </header>
        {view === 'graph' ? (
          <GraphView vault={activeVault} graph={graph} activePath="" onOpenFile={(node) => { setActivePath(node.filePath); setView('note'); }} />
        ) : view === 'note' ? (
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
        ) : null}
        <TerminalPanel
          activeVaultId={activeVaultId}
          terminal={terminalButtons.find((item) => item.id === activeTerminalId)}
          isVisible={view === 'terminal'}
          onKill={() => setView('note')}
        />
      </div>
      {optionsOpen && (
        <OptionsModal
          currentRoot={root}
          terminalButtons={terminalButtons}
          onClose={() => setOptionsOpen(false)}
          onSaved={async (settings) => {
            setTerminalButtons(settings.terminalButtons);
            await refreshVaults();
          }}
        />
      )}
    </div>
  );
}
