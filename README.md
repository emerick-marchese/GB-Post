# GB Post

<img src="assets/icon.png" width="120" alt="Logo GB Post">

Des post-its à poser sur ton bureau (Windows, macOS, Linux).

## Fonctionnalités

### La fenêtre GB Post

En ouvrant GB Post (raccourci du bureau, menu Démarrer ou clic sur le logo à côté de l'horloge), une vraie fenêtre de gestion s'ouvre, avec un menu sur le côté :

- **📝 Post-its** : tous tes post-its en un coup d'œil (aperçu du texte et des cases), recherche, filtres (sur le bureau / épinglés / masqués), et pour chacun : ✏️ modifier, 👁 afficher ou 🙈 masquer du bureau, 🎨 couleur, 📌 épingler, 🗑 supprimer. « Tout afficher » / « Tout masquer » et « ＋ Nouveau post-it ».
- **⏰ Alarmes**, **⏳ Minuteurs**, **⏱ Chrono** : tous les rappels (voir plus bas).
- **⚙️ Réglages** : lancement au démarrage, emplacement de la sauvegarde.
- En bas du menu : le **prochain rappel** à venir.

Fermer la fenêtre ne quitte pas GB Post : les post-its et les rappels restent actifs (logo à côté de l'horloge → « Quitter GB Post » pour vraiment quitter). Au démarrage de l'ordinateur, GB Post se lance discrètement (post-its sur le bureau, sans ouvrir la fenêtre).

### Les post-its sur le bureau

- **Post-its sur le bureau** : chaque post-it est une petite fenêtre que tu déplaces (par la barre du haut) et redimensionnes (par les bords) où tu veux.
- **Titre** : chaque post-it a un champ titre en haut (affiché en gras, et dans la fenêtre GB Post).
- **Texte libre + cases à cocher, mélangés** : écris normalement, et ajoute des cases à cocher où tu veux avec « ＋ Case à cocher » (`Ctrl+L`) ou « ＋ Texte » (`Ctrl+T`).
  - Dans une case : `Entrée` crée la case suivante ; `Entrée` sur une case vide repasse en texte normal.
  - `Retour arrière` au début d'une case la retransforme en texte.
  - Taper `[] ` ou `- ` au début d'une ligne la transforme en case à cocher.
  - `⋮⋮` permet de déplacer un élément par glisser-déposer. Le compteur en bas indique la progression (ex. `2/5 faits`).
- **📌 Épingler sur le bureau** : le post-it devient tout simple, sans aucun bouton, juste le logo et ton contenu, et il ne bouge plus. Les cases restent cochables. Passe la souris dessus : un **crayon ✏️** apparaît pour repasser en mode modification.
- **Couleurs** : bouton 🎨 → 10 couleurs prêtes + « Autre… » pour n'importe quelle couleur.
- **Nouveau post-it** : bouton ＋ (ou `Ctrl+N`) sur un post-it, ou depuis la fenêtre GB Post. Le logo en haut d'un post-it ouvre la fenêtre GB Post, et **－** le masque du bureau (il reste dans GB Post).
- **✕ Supprimer** (confirmation demandée si le post-it n'est pas vide).
- **Sauvegarde automatique à chaque changement** : texte, cases cochées, couleur, épinglage, position et taille, ainsi que les alarmes, minuteurs et le chrono. Rien à enregistrer à la main ; tout est restauré au prochain lancement.
- **Actif au démarrage** : GB Post se lance tout seul à l'ouverture de session (désactivable via clic droit sur l'icône de la zone de notification → « Lancer au démarrage »).

## Rappels : alarme, minuteur, chrono

Dans la fenêtre GB Post (ou clic droit sur le logo à côté de l'horloge → ⏰ / ⏳ / ⏱) :

- **⏰ Alarme** : une heure + la tâche à faire. Choisis les jours pour la répéter (L M M J V S D) ; sans jour, elle sonne une seule fois puis se désactive. Interrupteur pour activer/désactiver, clic sur une alarme pour la modifier.
- **⏳ Minuteur** : durée en h / min / s ou raccourcis (1, 5, 10, 15, 30 min, 1 h) + la tâche. Plusieurs minuteurs en même temps, avec pause / reprise.
- **⏱ Chrono** : démarrer, pause, tours, réinitialiser.

Les rappels tournent en fond même si la fenêtre est fermée, et sont sauvegardés (un minuteur continue après un redémarrage de l'app).

**Quand c'est l'heure**, pas de sonnerie : une alerte apparaît **au milieu de l'écran**, par-dessus tout, avec l'heure et la tâche. Elle arrive en « pop » puis grossit / rétrécit en continu pour bien se voir (la pulsation s'arrête quand la souris passe dessus pour cliquer facilement). Boutons **C'est fait ✓** (ou `Entrée` / `Échap`) et **Dans 5 min** pour la reporter.

L'application tourne en fond dans la zone de notification (à côté de l'horloge). Clic sur le logo : ouvre la fenêtre GB Post. Clic droit : nouveau post-it, afficher tous les post-its, rappels, lancer au démarrage, quitter.

## Télécharger l'installateur

Dernière version : **https://github.com/emerick-marchese/GB-Post/releases/latest/download/GB-Post-Setup.exe**

### Mises à jour

GB Post **se met à jour tout seul** : il vérifie au démarrage puis toutes les 4 h s'il existe une nouvelle version, la télécharge en arrière-plan et affiche « Nouvelle version prête — Redémarrer ». Si tu ne cliques pas, elle s'installe à la prochaine fermeture. C'est la **même application** qui est mise à jour : tes post-its, rappels et réglages sont conservés. (Réglages → Mises à jour → « Rechercher » pour vérifier à la main.)

Relancer l'installateur sur un PC où GB Post est déjà installé fait aussi une simple mise à jour, sans créer de deuxième application.

Côté développement : chaque push construit une nouvelle version `1.1.<n°>` via GitHub Actions et la publie dans les Releases (avec le fichier `latest.yml` lu par l'app).

## Lancer en développement

Il faut [Node.js](https://nodejs.org) (version 18 ou plus).

```bash
npm install
npm start
```

## Créer l'installateur

```bash
npm run dist:win     # Windows  -> dist/GB-Post-Setup.exe
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
