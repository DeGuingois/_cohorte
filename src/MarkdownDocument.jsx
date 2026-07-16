import { useMemo } from 'react';

const rendererVersion = 'atomic-markdown-v1';

function stripLineStart(value) {
  return value
    .normalize('NFKC')
    .replace(/^[\u0000-\u0020\u007F-\u009F\u00A0\u061C\u180E\u2000-\u200F\u2028-\u202F\u205F-\u206F\u3000\uFEFF]+/, '');
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

function parseLine(raw, index, inCode) {
  const visible = stripLineStart(raw);
  const hiddenPrefix = raw.slice(0, raw.length - visible.length);

  if (/^```/.test(visible)) {
    return { kind: 'fence', index, raw, text: visible, prefix: hiddenPrefix };
  }
  if (inCode) {
    return { kind: 'code', index, raw, text: raw, prefix: '' };
  }

  const heading = visible.match(/^([ \t]{0,3})(#{1,6})(?:[ \t\u00A0]+)(.*)$/);
  if (heading) {
    const markdownLevel = heading[2].length;
    return {
      kind: 'heading',
      index,
      raw,
      text: heading[3],
      markdownLevel,
      visualLevel: Math.min(markdownLevel + 1, 6),
      prefix: `${hiddenPrefix}${heading[1]}${heading[2]} `,
    };
  }

  if (/^\s*---+\s*$/.test(visible) || /^\s*\*\*\*+\s*$/.test(visible)) {
    return { kind: 'divider', index, raw, text: '', prefix: raw };
  }

  const quote = visible.match(/^>\s?(.*)$/);
  if (quote) return { kind: 'quote', index, raw, text: quote[1], prefix: '> ' };

  const task = visible.match(/^(\s*-\s+\[[ xX]\]\s+)(.*)$/);
  if (task) return { kind: 'task', index, raw, text: task[2], prefix: task[1] };

  const list = visible.match(/^(\s*(?:[-*]|\d+\.)\s+)(.*)$/);
  if (list) return { kind: 'list', index, raw, text: list[2], prefix: list[1] };

  return { kind: visible.trim() ? 'paragraph' : 'empty', index, raw, text: raw, prefix: '' };
}

function parseDocument(markdown) {
  const lines = markdown.split(/\r?\n/);
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const visible = stripLineStart(lines[index]);

    if (/^```/.test(visible)) {
      const start = index;
      const opening = lines[index];
      const codeLines = [];
      index += 1;

      while (index < lines.length && !/^```/.test(stripLineStart(lines[index]))) {
        codeLines.push(lines[index]);
        index += 1;
      }

      const closing = index < lines.length ? lines[index] : '```';
      if (index < lines.length) index += 1;

      blocks.push({
        kind: 'codeBlock',
        start,
        end: index - 1,
        opening,
        closing,
        text: codeLines.join('\n'),
      });
      continue;
    }

    if (isTableRow(lines[index]) && isTableSeparator(lines[index + 1] || '')) {
      const rows = [lines[index], lines[index + 1]];
      const start = index;
      index += 2;
      while (index < lines.length && isTableRow(lines[index])) {
        rows.push(lines[index]);
        index += 1;
      }
      blocks.push({ kind: 'table', start, end: index - 1, rows });
      continue;
    }

    const block = parseLine(lines[index], index, false);
    blocks.push(block);
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
    const path = file.path.replace(/\.md$/i, '').toLowerCase();
    const base = file.name.toLowerCase();
    return path === normalized || base === normalized;
  });
}

function parseInline(text) {
  const tokens = [];
  const regex = /(\[\[[^\]]+\]\]|\[[^\]\n|]+\|[^\]\n]+\]|\[[^\]\n]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*\n]+\*|https?:\/\/[^\s]+|(^|\s)#[A-Za-z0-9_\-/]+)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) tokens.push({ kind: 'text', value: text.slice(lastIndex, match.index) });
    const value = match[0];

    if (value.startsWith('[[')) {
      const raw = value.slice(2, -2);
      const separator = raw.includes('\\|') ? '\\|' : '|';
      const [target, label] = raw.split(separator);
      tokens.push({ kind: 'wikilink', value, target, label: (label || target).replace(/\\/g, '') });
    } else if (value.startsWith('[') && value.includes('|')) {
      const raw = value.slice(1, -1);
      const [target, label] = raw.split('|');
      tokens.push({ kind: 'wikilink', value, target, label: label || target });
    } else if (value.startsWith('[') && value.includes('](')) {
      const link = value.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      tokens.push({ kind: 'markdownLink', value, label: link?.[1] || value, href: link?.[2] || '' });
    } else if (value.startsWith('http')) {
      tokens.push({ kind: 'url', value });
    } else if (value.startsWith('`')) {
      tokens.push({ kind: 'code', value: value.slice(1, -1) });
    } else if (value.startsWith('**')) {
      tokens.push({ kind: 'strong', value: value.slice(2, -2) });
    } else if (value.startsWith('*')) {
      tokens.push({ kind: 'emphasis', value: value.slice(1, -1) });
    } else {
      const leading = value.match(/^\s/)?.[0] || '';
      if (leading) tokens.push({ kind: 'text', value: leading });
      tokens.push({ kind: 'tag', value: value.trim().slice(1) });
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) tokens.push({ kind: 'text', value: text.slice(lastIndex) });
  return tokens;
}

function plainInlineText(text) {
  return parseInline(text).map((token) => {
    if (token.kind === 'wikilink') return token.label;
    if (token.kind === 'tag') return `#${token.value}`;
    return token.value;
  }).join('');
}

function InlineAtom({ text, activeVault, onOpenFile, onTag }) {
  return parseInline(text).map((token, index) => {
    if (token.kind === 'wikilink') {
      const target = resolveWikilink(token.target, activeVault);
      return (
        <button
          key={`${token.value}-${index}`}
          type="button"
          className={`atom-md-wikilink ${target ? '' : 'is-missing'}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => target && onOpenFile(target.path)}
          title={target?.path || token.target}
        >
          {token.label}
        </button>
      );
    }
    if (token.kind === 'tag') {
      return (
        <button
          key={`${token.value}-${index}`}
          type="button"
          className="atom-md-tag"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onTag(token.value)}
        >
          #{token.value}
        </button>
      );
    }
    if (token.kind === 'url') {
      return <a key={`${token.value}-${index}`} className="atom-md-link" href={token.value} target="_blank" rel="noreferrer">{token.value}</a>;
    }
    if (token.kind === 'markdownLink') {
      return <a key={`${token.value}-${index}`} className="atom-md-link" href={token.href} target={token.href.startsWith('http') ? '_blank' : undefined} rel={token.href.startsWith('http') ? 'noreferrer' : undefined}>{token.label}</a>;
    }
    if (token.kind === 'code') return <code key={`${token.value}-${index}`} className="atom-md-code-inline">{token.value}</code>;
    if (token.kind === 'strong') return <strong key={`${token.value}-${index}`} className="atom-md-strong">{token.value}</strong>;
    if (token.kind === 'emphasis') return <em key={`${token.value}-${index}`} className="atom-md-emphasis">{token.value}</em>;
    return <span key={`${token.value}-${index}`}>{token.value}</span>;
  });
}

function EditableAtom({ tag: Tag = 'div', className, block, activeVault, onOpenFile, onTag, onCommit, children }) {
  return (
    <Tag
      className={className}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-atomic-kind={block.kind}
      data-source-index={block.index}
      onBlur={(event) => {
        const nextText = event.currentTarget.innerText.replace(/\n/g, '');
        if (nextText !== plainInlineText(block.text)) onCommit(block, nextText);
      }}
    >
      {children || <InlineAtom text={block.text} activeVault={activeVault} onOpenFile={onOpenFile} onTag={onTag} />}
    </Tag>
  );
}

function MarkdownHeading({ block, activeVault, onOpenFile, onTag, onCommit }) {
  const Tag = `h${block.visualLevel}`;
  return (
    <EditableAtom
      tag={Tag}
      className={`atom-md-block atom-md-heading atom-md-heading-${block.visualLevel}`}
      block={block}
      activeVault={activeVault}
      onOpenFile={onOpenFile}
      onTag={onTag}
      onCommit={onCommit}
    />
  );
}

function MarkdownLineBlock({ block, activeVault, onOpenFile, onTag, onCommit }) {
  if (block.kind === 'heading') {
    return <MarkdownHeading block={block} activeVault={activeVault} onOpenFile={onOpenFile} onTag={onTag} onCommit={onCommit} />;
  }
  if (block.kind === 'divider') return <div className="atom-md-divider" data-atomic-kind="divider" />;

  return (
    <EditableAtom
      className={`atom-md-block atom-md-${block.kind}`}
      block={block}
      activeVault={activeVault}
      onOpenFile={onOpenFile}
      onTag={onTag}
      onCommit={onCommit}
    />
  );
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
    const lines = body.split(/\r?\n/);
    const lineIndex = block.start + rowIndex;
    const cells = splitEscapedPipes(lines[lineIndex]);
    cells[cellIndex] = value;
    lines[lineIndex] = `| ${cells.map(escapeTableCell).join(' | ')} |`;
    onChange(lines.join('\n'));
  }

  return (
    <div className="atom-md-table-wrap" data-atomic-kind="table">
      <table className="atom-md-table">
        <thead>
          <tr>
            {header.map((cell, cellIndex) => (
              <th key={`${cell}-${cellIndex}`} style={{ textAlign: align[cellIndex] || 'left' }}>
                <InlineAtom text={cell} activeVault={activeVault} onOpenFile={onOpenFile} onTag={onTag} />
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
                    spellCheck={false}
                    onBlur={(event) => {
                      const nextText = event.currentTarget.innerText.replace(/\n/g, ' ');
                      const previousText = row[cellIndex] || '';
                      if (nextText !== plainInlineText(previousText)) updateCell(rowIndex + 2, cellIndex, nextText);
                    }}
                  >
                    <InlineAtom text={row[cellIndex] || ''} activeVault={activeVault} onOpenFile={onOpenFile} onTag={onTag} />
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

function MarkdownCodeBlock({ block, body, onChange }) {
  function updateCode(nextText) {
    const lines = body.split(/\r?\n/);
    const replacement = [
      block.opening,
      ...nextText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n'),
      block.closing,
    ];
    lines.splice(block.start, block.end - block.start + 1, ...replacement);
    onChange(lines.join('\n'));
  }

  return (
    <pre className="atom-md-code-block" data-atomic-kind="codeBlock">
      <code
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onBlur={(event) => {
          const nextText = event.currentTarget.innerText.replace(/\n$/, '');
          if (nextText !== block.text) updateCode(nextText);
        }}
      >
        {block.text}
      </code>
    </pre>
  );
}

export default function MarkdownDocument({ body, title, onChange, activeVault, onOpenFile, onTag }) {
  const blocks = useMemo(() => parseDocument(body), [body]);
  const visibleBlocks = useMemo(() => {
    const firstContent = blocks.find((block) => block.kind !== 'empty');
    if (!title || firstContent?.kind !== 'heading' || firstContent.markdownLevel !== 1) return blocks;
    return firstContent.text.trim() === title.trim() ? blocks.filter((block) => block !== firstContent) : blocks;
  }, [blocks, title]);

  function commitBlock(block, nextText) {
    const lines = body.split(/\r?\n/);
    lines[block.index] = `${block.prefix || ''}${nextText}`;
    onChange(lines.join('\n'));
  }

  return (
    <section className="atomic-markdown" data-renderer-version={rendererVersion}>
      {visibleBlocks.map((block) => (
        block.kind === 'codeBlock' ? (
          <MarkdownCodeBlock
            key={`code-${block.start}`}
            block={block}
            body={body}
            onChange={onChange}
          />
        ) : block.kind === 'table' ? (
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
          <MarkdownLineBlock
            key={`${block.index}-${block.kind}`}
            block={block}
            activeVault={activeVault}
            onOpenFile={onOpenFile}
            onTag={onTag}
            onCommit={commitBlock}
          />
        )
      ))}
    </section>
  );
}
