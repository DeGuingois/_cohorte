import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

const sessionBuffers = new Map();
const startedSessions = new Set();
const sessionKey = (vaultId, terminalId) => `${vaultId}\0${terminalId}`;

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

      term.onData((data) => {
        const { vaultId, terminalId } = activeSessionRef.current;
        if (vaultId && terminalId) window.electronAPI.terminal.input(vaultId, terminalId, data);
      });
      term.onResize(({ cols, rows }) => {
        const { vaultId, terminalId } = activeSessionRef.current;
        if (vaultId && terminalId) window.electronAPI.terminal.resize(vaultId, terminalId, cols, rows);
      });
    }

    return window.electronAPI.terminal.onData((vaultId, terminalId, data) => {
      const key = sessionKey(vaultId, terminalId);
      sessionBuffers.set(key, `${sessionBuffers.get(key) || ''}${data}`);
      if (key === activeSessionRef.current.key) xtermRef.current?.write(data);
    });
  }, []);

  useEffect(() => {
    if (!isVisible || !activeVaultId || !terminal?.id || !xtermRef.current) return undefined;

    const vaultId = activeVaultId;
    const terminalId = terminal.id;
    const key = sessionKey(vaultId, terminalId);
    const switchId = ++switchRef.current;
    activeSessionRef.current = { vaultId, terminalId, key };
    xtermRef.current.reset();
    xtermRef.current.write(`\x1b[2mOuverture de ${terminal.label} dans ${vaultId}…\x1b[0m\r\n`);

    window.electronAPI.terminal.create(vaultId, terminalId).then(({ exists }) => {
      if (switchId !== switchRef.current || activeSessionRef.current.key !== key) return;
      xtermRef.current.reset();
      if (sessionBuffers.get(key)) xtermRef.current.write(sessionBuffers.get(key));
      requestAnimationFrame(() => fitRef.current?.fit());

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
    if (!isVisible) return undefined;
    const fit = () => fitRef.current?.fit();
    const frame = requestAnimationFrame(fit);
    window.addEventListener('resize', fit);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', fit);
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