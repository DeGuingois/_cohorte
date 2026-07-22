import { useEffect, useState, useRef } from 'react';
import { sessionBuffers, startedSessions } from './TerminalPanel.jsx';

// Translate VT100 alternate character set (line drawing codes like q, x, etc.) to Unicode characters
const translateAltCharSet = (str) => {
  if (!str) return '';
  let result = '';
  let inAltSet = false;
  const map = {
    'q': '─',
    'x': '│',
    'l': '┌',
    'k': '┐',
    'm': '└',
    'j': '┘',
    'w': '┬',
    'v': '┴',
    'n': '┼',
    'u': '┤',
    't': '├'
  };
  let i = 0;
  while (i < str.length) {
    if (str.startsWith('\u001b(0', i)) {
      inAltSet = true;
      result += '\u001b(0';
      i += 3;
      continue;
    }
    if (str.startsWith('\u001b(B', i)) {
      inAltSet = false;
      result += '\u001b(B';
      i += 3;
      continue;
    }
    const char = str[i];
    if (inAltSet && map[char]) {
      result += map[char];
    } else {
      result += char;
    }
    i++;
  }
  return result;
};

// RegEx to strip ANSI escape sequences (CSI & OSC sequences)
const stripAnsi = (str) => {
  if (!str) return '';
  const ST = '(?:\\u0007|\\u001B\\\\|\\u009C)';
  const osc = `(?:\\u001B\\][\\s\\S]*?${ST})`;
  const csi = '[\\u001B\\u009B][[\\]()#;?]*(?:\\d{1,4}(?:[;:]\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]';
  const pattern = new RegExp(`${osc}|${csi}`, 'g');
  return str.replace(pattern, '');
};

export default function TerminalHoverPreview({ vaultId, terminalId, label, command, placement = 'bottom', inline = false, isExpanded = false }) {
  const sessionKey = `${vaultId}::${terminalId}`;
  const [content, setContent] = useState(() => {
    return sessionBuffers.get(sessionKey) || '';
  });
  const [isActive, setIsActive] = useState(() => startedSessions.has(sessionKey));
  const preRef = useRef(null);

  useEffect(() => {
    // Check initially if it exists in the active sessions
    if (window.electronAPI?.terminal?.listActive) {
      window.electronAPI.terminal.listActive().then((list) => {
        const found = list.some((s) => s.vaultId === vaultId && s.terminalId === terminalId);
        setIsActive(found);
      });
    }

    // Load initial buffer cache from the backend
    if (window.electronAPI?.terminal?.getBuffer) {
      window.electronAPI.terminal.getBuffer(vaultId, terminalId).then((buf) => {
        if (buf) setContent(buf);
      }).catch(() => {});
    }

    if (!window.electronAPI?.terminal?.onData) return;

    const unsubData = window.electronAPI.terminal.onData((exVaultId, exTerminalId, data) => {
      if (exVaultId === vaultId && exTerminalId === terminalId) {
        setContent((prev) => prev + data);
        setIsActive(true);
      }
    });

    const unsubExit = window.electronAPI.terminal.onExit?.((exVaultId, exTerminalId) => {
      if (exVaultId === vaultId && exTerminalId === terminalId) {
        setIsActive(false);
      }
    });

    return () => {
      unsubData();
      unsubExit?.();
    };
  }, [vaultId, terminalId]);

  // Scroll to bottom of preview content when it updates
  useEffect(() => {
    if (preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [content]);

  // Translate VT100 alternate character set to Unicode lines/boxes, then strip standard ANSI
  const translatedContent = translateAltCharSet(content);
  const cleanLines = stripAnsi(translatedContent).split('\n');

  // Remove the last line because it's either the active prompt or currently being typed/written (in-progress)
  const completedLines = cleanLines.slice(0, -1);

  const filteredLines = [];
  let prevWasEmpty = false;

  for (const line of completedLines) {
    const trimmed = line.trim();
    
    // Strip leading/trailing Unicode box drawing characters and spacing to remove borders cleanly from text lines
    const cleanLine = trimmed.replace(/^[─│┌┐└┘┬┴┼┤├\s]+|[─│┌┐└┘┬┴┼┤├\s]+$/g, '');

    // 1. Check if it's a prompt
    const isPrompt = 
      // Windows Cmd Prompt: C:\Users\name>
      /^[a-zA-Z]:\\[^>]*>$/.test(cleanLine) ||
      // PowerShell Prompt: PS C:\Users\name>
      /^PS\s+[a-zA-Z]:\\[^>]*>$/.test(cleanLine) ||
      // Unix/Bash/Zsh prompts: user@host:~/dir$ or similar
      /^[^@]+@[^:]+:[^$#]*[$#]$/.test(cleanLine) ||
      // Simple prompt detection fallback (ends with > or $ or # with path/shell characteristics)
      ((cleanLine.endsWith('>') || cleanLine.endsWith('$') || cleanLine.endsWith('#')) && 
       (cleanLine.includes('\\') || cleanLine.includes('/') || cleanLine.includes('~') || cleanLine.startsWith('PS '))) ||
      // Single prompt character
      cleanLine === '>' || cleanLine === '$' || cleanLine === '#';

    // 2. Check if it's CLI Selector or UI Junk
    const isJunk = 
      cleanLine.includes('───') || 
      cleanLine.includes('═══') ||
      cleanLine.includes('Navigate') || 
      cleanLine.includes('Select') || 
      cleanLine.includes('Complete') ||
      cleanLine.includes('? for shortcuts') || 
      cleanLine.includes('Gemini 3.5') || 
      cleanLine.includes('Flash') ||
      cleanLine.includes('XFile') || 
      cleanLine.includes('XDirectory') ||
      cleanLine.includes('File        /') || 
      cleanLine.includes('Directory   /') ||
      cleanLine.includes('↑/↓') || 
      cleanLine.includes('↓ 10 more') || 
      (cleanLine.includes('↓ ') && cleanLine.includes('more'));

    // If it's a prompt, junk, or empty line, we treat it as an empty line spacer to separate text blocks
    if (isPrompt || isJunk || cleanLine === '') {
      if (!prevWasEmpty) {
        filteredLines.push('');
        prevWasEmpty = true;
      }
    } else {
      filteredLines.push(cleanLine);
      prevWasEmpty = false;
    }
  }

  // Trim empty lines from start and end of the filtered lines array
  while (filteredLines.length > 0 && filteredLines[0].trim() === '') {
    filteredLines.shift();
  }
  while (filteredLines.length > 0 && filteredLines[filteredLines.length - 1].trim() === '') {
    filteredLines.pop();
  }

  const sliceCount = isExpanded ? -30 : -10;
  const previewLines = filteredLines.slice(sliceCount).join('\n');

  if (inline) {
    return (
      <div className="terminal-preview-inline">
        <div className="terminal-preview-header">
          <span className="terminal-preview-title">
            🖥️ Terminal Live ({command})
          </span>
          <div className="terminal-preview-status">
            <span className={`status-dot ${isActive ? 'active' : 'inactive'}`} />
            {isActive ? 'En ligne' : 'Hors-ligne'}
          </div>
        </div>
        <div className="terminal-preview-body">
          {isActive ? (
            <pre ref={preRef} className="terminal-preview-pre">
              {previewLines || 'En attente de sortie...\n'}
              <span className="terminal-cursor">█</span>
            </pre>
          ) : (
            <div className="terminal-preview-empty">
              <span className="empty-title">Terminal Hors-ligne</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`terminal-preview-tooltip is-${placement}`}>
      <div className="terminal-preview-header">
        <div className="terminal-preview-dots">
          <span className="dot red" />
          <span className="dot yellow" />
          <span className="dot green" />
        </div>
        <span className="terminal-preview-title">
          {label} ({command})
        </span>
        <div className="terminal-preview-status">
          <span className={`status-dot ${isActive ? 'active' : 'inactive'}`} />
          {isActive ? 'Live' : 'Inactif'}
        </div>
      </div>
      <div className="terminal-preview-body">
        {isActive ? (
          <pre ref={preRef} className="terminal-preview-pre">
            {previewLines || 'En attente de sortie...\n'}
            <span className="terminal-cursor">█</span>
          </pre>
        ) : (
          <div className="terminal-preview-empty">
            <span className="empty-title">Terminal Hors-ligne</span>
            <span className="empty-subtitle">Cliquez sur l'onglet pour lancer "{command}"</span>
          </div>
        )}
      </div>
    </div>
  );
}
