# COHORTE // Multi‑Vault Prototype

Prototype React d’une interface web locale inspirée d’Obsidian, capable de basculer entre plusieurs vaults présents dans un même dossier et d’afficher un « cerveau » global avec les liens inter-vaults.

## Stack

- React + Vite
- Tailwind CSS
- CSS custom pour les détails HUD (grille, angles découpés, rayures, animations)
- Graphe SVG interactif sans dépendance externe

## Lancer le prototype

```bash
npm install
npm run dev
```

Puis ouvrir l’URL affichée par Vite.

## Interactions incluses

- Sélection d’un vault dans la colonne gauche
- Vue globale ou vue isolée du vault actif
- Recherche de nœuds en temps réel
- Sélection d’une note dans le graphe et inspection des métadonnées
- Palette de commandes avec `Ctrl/Cmd + K`
- Layout responsive

## Portage vers une vraie application locale

Le prototype utilise des données simulées. Pour une version fonctionnelle, remplacer la couche de données par :

1. File System Access API côté navigateur, ou un shell Tauri/Electron pour un accès local fiable.
2. Un indexeur Markdown qui extrait les `[[wikilinks]]`, tags et frontmatter.
3. Une base locale (SQLite, IndexedDB ou DuckDB) pour le cache du graphe.
4. Un watcher du dossier pour réindexer les fichiers modifiés.

Le fichier `public/brain-reference.png` contient la capture de référence fournie.
