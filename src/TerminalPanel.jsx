import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

const sessionBuffers = new Map();
const startedSessions = new Set();
const sessionKey = (vaultId, terminalId) => `${vaultId}::${terminalId}`;

export default function TerminalPanel({ activeVaultId, terminal, isVisible, onKill }) {
  const domRef = useRef(null);
  const xtermRef = useRef(null);
  const fitRef = useRef(null);
  const activeSessionRef = useRef({ vaultId: '', terminalId: '', key: '' });
  const switchRef = useRef(0);

  useEffect(() => {
    if (!xtermRef.current) {
      const term = new Terminal({
        theme: { background: '#1a1b26', foreground: '#c0caf5', cursor: '#c0caf5' },
        fontFamily: '"Share Tech Mono", Consolas, monospace',
        fontSize: 13,
        cursorBlink: true,
        scrollback: 5000,
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(domRef.current);
      xtermRef.current = term;
      fitRef.current = fit;

      term.attachCustomKeyEventHandler((arg) => {
        if (arg.type !== 'keydown') return true;
        const isMod = arg.ctrlKey || arg.metaKey;
        if (isMod && arg.code === 'KeyC' && term.hasSelection()) {
          navigator.clipboard.writeText(term.getSelection());
          return false;
        }
        if (isMod && arg.code === 'KeyV') {
          navigator.clipboard.readText().then((text) => {
            if (text) {
              const { vaultId, terminalId } = activeSessionRef.current;
              if (vaultId && terminalId) window.electronAPI.terminal.input(vaultId, terminalId, text);
            }
          }).catch(() => {});
          return false;
        }
        return true;
      });

      const handleContextMenu = (e) => {
        e.preventDefault();
        navigator.clipboard.readText().then((text) => {
          if (text) {
            const { vaultId, terminalId } = activeSessionRef.current;
            if (vaultId && terminalId) window.electronAPI.terminal.input(vaultId, terminalId, text);
          }
        }).catch(() => {});
      };

      const handlePaste = (e) => {
        e.preventDefault();
        const text = e.clipboardData?.getData('text/plain');
        if (text) {
          const { vaultId, terminalId } = activeSessionRef.current;
          if (vaultId && terminalId) window.electronAPI.terminal.input(vaultId, terminalId, text);
        }
      };

      const dom = domRef.current;
      dom?.addEventListener('contextmenu', handleContextMenu);
      dom?.addEventListener('paste', handlePaste);

      term.onData((data) => {
        const { vaultId, terminalId } = activeSessionRef.current;
        if (vaultId && terminalId) window.electronAPI.terminal.input(vaultId, terminalId, data);
      });
      term.onResize(({ cols, rows }) => {
        const { vaultId, terminalId } = activeSessionRef.current;
        if (vaultId && terminalId) window.electronAPI.terminal.resize(vaultId, terminalId, cols, rows);
      });
    }

    const unsubData = window.electronAPI.terminal.onData((vaultId, terminalId, data) => {
      const key = sessionKey(vaultId, terminalId);
      sessionBuffers.set(key, `${sessionBuffers.get(key) || ''}${data}`);
      if (key === activeSessionRef.current.key) xtermRef.current?.write(data);
    });

    const unsubExit = window.electronAPI.terminal.onExit((vaultId, terminalId) => {
      const key = sessionKey(vaultId, terminalId);
      sessionBuffers.delete(key);
      startedSessions.delete(key);
      if (key === activeSessionRef.current.key && onKill) {
        onKill();
      }
    });

    return () => {
      unsubData();
      unsubExit?.();
    };
  }, []);

  useEffect(() => {
    if (!isVisible || !activeVaultId || !terminal?.id || !xtermRef.current) return undefined;

    const vaultId = activeVaultId;
    const terminalId = terminal.id;
    const key = sessionKey(vaultId, terminalId);
    const switchId = ++switchRef.current;
    activeSessionRef.current = { vaultId, terminalId, key };
    xtermRef.current.reset();
    fitRef.current?.fit();
    const dims = fitRef.current?.proposeDimensions() || { cols: 80, rows: 30 };

    window.electronAPI.terminal.create(vaultId, terminalId, dims.cols, dims.rows).then(({ exists }) => {
      if (switchId !== switchRef.current || activeSessionRef.current.key !== key) return;
      xtermRef.current.reset();
      fitRef.current?.fit();
      if (sessionBuffers.get(key)) xtermRef.current.write(sessionBuffers.get(key));

      if (!exists && !startedSessions.has(key)) {
        startedSessions.add(key);
        window.electronAPI.terminal.input(vaultId, terminalId, `${terminal.command}\r`);
      }
    }).catch((error) => {
      if (switchId === switchRef.current) xtermRef.current?.write(`\r\n\x1b[31m${error.message}\x1b[0m\r\n`);
    });

    return () => {
      if (switchId === switchRef.current) switchRef.current += 1;
    };
  }, [activeVaultId, terminal?.id, isVisible]);

  useEffect(() => {
    if (!isVisible || !domRef.current) return undefined;

    const doFit = () => {
      try {
        fitRef.current?.fit();
        const { cols, rows } = xtermRef.current || {};
        const { vaultId, terminalId } = activeSessionRef.current;
        if (vaultId && terminalId && cols && rows) {
          window.electronAPI.terminal.resize(vaultId, terminalId, cols, rows);
        }
      } catch { /* ignore */ }
    };

    doFit();
    const observer = new ResizeObserver(() => doFit());
    observer.observe(domRef.current);
    window.addEventListener('resize', doFit);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', doFit);
    };
  }, [isVisible]);

  function killCurrentTerminal() {
    if (!activeVaultId || !terminal?.id) return;
    const key = sessionKey(activeVaultId, terminal.id);
    window.electronAPI.terminal.kill(activeVaultId, terminal.id);
    sessionBuffers.delete(key);
    startedSessions.delete(key);
    activeSessionRef.current = { vaultId: '', terminalId: '', key: '' };
    xtermRef.current?.reset();
    onKill();
  }

  return (
    <div className={`terminal-panel${isVisible ? '' : ' is-hidden'}`}>
      <div className="terminal-header">
        <span className="terminal-title"><span className="terminal-dot" />{terminal?.label || 'Terminal'} · {activeVaultId}</span>
        <div className="terminal-actions">
          <button type="button" className="terminal-btn terminal-btn--kill" onClick={killCurrentTerminal} title="Arrêter et fermer ce terminal">Kill terminal</button>
        </div>
      </div>
      <div ref={domRef} className="terminal-xterm" />
    </div>
  );
}