import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

/**
 * Buffer d'historique PTY par vaultId.
 * Stocké en dehors du composant pour persister entre les renders.
 */
const ptyBuffers = {};

/**
 * Ensemble des vaultIds ayant déjà reçu leur commande initiale.
 * Évite de rejouer la commande lors d'un switch de vault.
 */
const commandedVaults = new Set();

export default function TerminalPanel({ activeVaultId, isVisible, onClose, initialCommand }) {
  const domRef    = useRef(null);  // div DOM pour xterm
  const xtermRef  = useRef(null);  // instance Terminal xterm.js
  const fitRef    = useRef(null);  // instance FitAddon
  const unbindRef = useRef(null);  // fonction de nettoyage du listener IPC

  // Ref miroir de activeVaultId pour les closures stables (évite la capture stale).
  const activeVaultRef = useRef(activeVaultId);
  useEffect(() => { activeVaultRef.current = activeVaultId; }, [activeVaultId]);

  const [height, setHeight] = useState(280);
  const [isResizing, setIsResizing] = useState(false);

  // ─── Montage / démontage du terminal xterm ──────────────────────────────────
  useEffect(() => {
    if (!isVisible) return;

    // Initialise xterm une seule fois.
    if (!xtermRef.current) {
      const term = new Terminal({
        theme: { background: '#1a1b26', foreground: '#c0caf5', cursor: '#c0caf5' },
        fontFamily: '"Share Tech Mono", Consolas, monospace',
        fontSize: 13,
        cursorBlink: true,
        scrollback: 5000,
      });
      fitRef.current = new FitAddon();
      term.loadAddon(fitRef.current);
      term.open(domRef.current);
      xtermRef.current = term;

      // Entrée clavier → PTY du vault actif (via ref pour éviter la closure stale).
      term.onData((data) => {
        const vid = activeVaultRef.current;
        if (vid) window.electronAPI.terminal.input(vid, data);
      });

      // Redimensionnement xterm → PTY.
      term.onResize(({ cols, rows }) => {
        const vid = activeVaultRef.current;
        if (vid) window.electronAPI.terminal.resize(vid, cols, rows);
      });
    }

    // Écoute des données PTY → buffer + affichage si vault actif.
    unbindRef.current = window.electronAPI.terminal.onData((vaultId, data) => {
      if (!ptyBuffers[vaultId]) ptyBuffers[vaultId] = '';
      ptyBuffers[vaultId] += data;
      // Affiche uniquement si c'est le vault actuellement visible.
      if (vaultId === activeVaultRef.current && xtermRef.current) {
        xtermRef.current.write(data);
      }
    });

    return () => {
      unbindRef.current?.();
    };
  }, [isVisible]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Switch de vault actif ───────────────────────────────────────────────────
  useEffect(() => {
    if (!isVisible || !activeVaultId || !xtermRef.current) return;

    (async () => {
      // Crée ou récupère le PTY pour ce vault (cwd = vault.path).
      const { exists } = await window.electronAPI.terminal.create(activeVaultId);

      // Rejoue le buffer d'historique dans xterm.
      xtermRef.current.clear();
      if (ptyBuffers[activeVaultId]) {
        xtermRef.current.write(ptyBuffers[activeVaultId]);
      }

      // Redimensionne après le clear.
      setTimeout(() => fitRef.current?.fit(), 50);

      // Envoie la commande initiale uniquement si le PTY vient d'être créé
      // et n'a pas encore reçu de commande (évite de rejouer sur chaque switch).
      if (!exists && initialCommand && !commandedVaults.has(activeVaultId)) {
        commandedVaults.add(activeVaultId);
        window.electronAPI.terminal.input(activeVaultId, `${initialCommand}\r`);
      }
    })();
  }, [activeVaultId, isVisible]); // initialCommand intentionnellement absent — voir commentaire ci-dessus

  // Quand l'utilisateur clique à nouveau sur Codex/Gemini depuis un vault déjà ouvert,
  // on force la commande même si le PTY existe déjà.
  useEffect(() => {
    if (!isVisible || !activeVaultId || !initialCommand || !xtermRef.current) return;
    if (!commandedVaults.has(activeVaultId)) return; // géré par l'effet switch-vault
    // Renvoie la commande explicitement (clic volontaire depuis un terminal déjà ouvert).
    window.electronAPI.terminal.input(activeVaultId, `${initialCommand}\r`);
  }, [initialCommand]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Redimensionnement de la fenêtre → fit xterm ────────────────────────────
  useEffect(() => {
    const onResize = () => { if (isVisible) fitRef.current?.fit(); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isVisible]);

  // ─── Drag-to-resize du panel ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e) => {
      const next = Math.max(120, Math.min(700, window.innerHeight - e.clientY));
      setHeight(next);
    };
    const onUp = () => setIsResizing(false);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [isResizing]);

  // Refit après redimensionnement manuel du panel.
  useEffect(() => {
    if (!isResizing && isVisible) fitRef.current?.fit();
  }, [isResizing, height, isVisible]);

  // ─── Kill explicite du PTY du vault actif ────────────────────────────────────
  function killCurrentPty() {
    if (!activeVaultId) return;
    window.electronAPI.terminal.kill(activeVaultId);
    ptyBuffers[activeVaultId] = '';
    commandedVaults.delete(activeVaultId);
    xtermRef.current?.clear();
    // Recrée immédiatement un PTY propre.
    window.electronAPI.terminal.create(activeVaultId);
  }

  if (!isVisible) return null;

  return (
    <div className="terminal-panel" style={{ height: `${height}px` }}>
      {/* Poignée de redimensionnement (drag vers le haut) */}
      <div
        className={`terminal-resize-handle${isResizing ? ' is-resizing' : ''}`}
        onMouseDown={() => setIsResizing(true)}
      />

      {/* Barre de titre */}
      <div className="terminal-header">
        <span className="terminal-title">
          <span className="terminal-dot" />
          {activeVaultId}
        </span>
        <div className="terminal-actions">
          <button type="button" className="terminal-btn" onClick={killCurrentPty} title="Tuer le processus et redémarrer">
            ↺ Restart
          </button>
          <button type="button" className="terminal-btn terminal-btn--close" onClick={onClose} title="Fermer le panel (le processus continue en arrière-plan)">
            ×
          </button>
        </div>
      </div>

      {/* Zone xterm.js */}
      <div ref={domRef} className="terminal-xterm" />
    </div>
  );
}
