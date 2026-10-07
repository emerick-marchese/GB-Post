# GB Post

<img src="assets/icon.png" width="120" alt="Logo GB Post">

Des post-its à poser sur ton bureau (Windows, macOS, Linux).

## Fonctionnalités

- **Post-its sur le bureau** : chaque post-it est une petite fenêtre que tu déplaces (par la barre du haut) et redimensionnes (par les bords) où tu veux.
- **Checklists** : bouton ☑ (ou `Ctrl+L`) pour ajouter une case à cocher.
  `Entrée` crée l'élément suivant, `Retour arrière` sur un élément vide le supprime, `⋮⋮` permet de les réordonner par glisser-déposer. Le compteur en bas indique la progression (ex. `2/5 faits`).
- **Couleurs** : bouton 🎨 → 10 couleurs prêtes + « Autre… » pour n'importe quelle couleur.
- **Nouveau post-it** : bouton ＋ (ou `Ctrl+N`), ou double-clic sur l'icône GB Post dans la zone de notification.
- **📌 Toujours au premier plan** pour un post-it important.
- **✕ Supprimer** (confirmation demandée si le post-it n'est pas vide).
- **Sauvegarde automatique à chaque changement** : texte, cases cochées, couleur, position et taille. Rien à enregistrer à la main ; tout est restauré au prochain lancement.
- **Actif au démarrage** : GB Post se lance tout seul à l'ouverture de session (désactivable via clic droit sur l'icône de la zone de notification → « Lancer au démarrage »).

L'application tourne en fond dans la zone de notification (à côté de l'horloge). Clic droit sur le logo pour : nouveau post-it, afficher tous les post-its, lancer au démarrage, quitter.

## Lancer en développement

Il faut [Node.js](https://nodejs.org) (version 18 ou plus).

```bash
npm install
npm start
```

## Créer l'installateur

```bash
npm run dist:win     # Windows  -> dist/GB Post Setup 1.0.0.exe
npm run dist:mac     # macOS    -> dist/GB Post-1.0.0.dmg
npm run dist:linux   # Linux    -> dist/GB Post-1.0.0.AppImage
```

Lance la commande sur le système visé (l'installateur Windows se construit de préférence sous Windows).
Installe ensuite l'application : au premier lancement elle s'inscrit pour démarrer automatiquement avec l'ordinateur.

## Où sont mes post-its ?

Dans un fichier `gb-post-data.json` du dossier de l'application :

- Windows : `%APPDATA%\GB Post\`
- macOS : `~/Library/Application Support/GB Post/`
- Linux : `~/.config/GB Post/`

## Logo

Le logo est dans `assets/` : `icon.png` (512×512, fond transparent), `icon.ico` (Windows) et `tray.png` (zone de notification).
