# Signes : apprendre la LSF

Application gratuite, façon Duolingo, pour apprendre la langue des signes française (LSF). Elle s'installe sur iPhone, Android et ordinateur depuis le navigateur, sans App Store, et fonctionne hors ligne.

L'app utilise des vidéos sous licence libre et peut aussi lire les vidéos de signe Elix directement depuis leurs serveurs, sans les télécharger ni les stocker dans le dépôt. Les liens sont recherchés pour tout le vocabulaire du dictionnaire ; seuls les résultats correspondant exactement au mot sont retenus, et un mot sans vidéo Elix disponible garde ses autres ressources.
Hors connexion, le lecteur et les exercices privilégient les vidéos locales. Les vidéos Elix nécessitent Internet ; si l'une d'elles ne peut pas être chargée, l'app l'indique et propose une autre ressource locale quand elle existe.

## Ce qu'il y a dedans

- **Parcours** : unités et leçons à débloquer, leçons de grammaire, révisions d'unité, série de jours et XP.
- **Entraînement** : révision du jour (répétition espacée FSRS), sessions sur le vocabulaire appris avec choix du contenu, de la durée et des types de questions, défi chrono, cartes.
- **Types de questions** : vidéo vers mot, mot vers vidéo, saisie, vrai ou faux, paires, signer devant la caméra en miroir (rien n'est enregistré), remettre une phrase en glose dans l'ordre, QCM de grammaire.
- **Dactylologie** : unité 1 facultative (commencer, tester son niveau ou passer). Elle s'ouvre automatiquement quand le pipeline trouve un alphabet complet sous licence libre.
- **Dictionnaire** : recherche, fiche de chaque mot avec toutes ses vidéos, leur auteur et leur licence.
- **Profil** : statistiques, effets sonores et vibration réglables, export et import de la progression, crédits.

La progression reste sur l'appareil (IndexedDB). Aucun compte, aucun serveur, aucune publicité.

## Contenu actuel

Le fichier [`pipeline/couverture.md`](pipeline/couverture.md) détaille ce qui est publié. Au premier passage, avec le dépôt [parlr/lsf-data](https://github.com/parlr/lsf-data) seulement : 658 signes, 669 vidéos, 31 unités publiées sur les 60 du programme.

Ne sont pas publiées, faute de vidéos libres : la dactylologie, les chiffres, l'hypothèse et les niveaux B1 et B2 (qui demandent des vidéos de discours). Le pipeline peut aussi interroger Wikimedia Commons lors de la génération du contenu avec l'option `--commons`.

## Mettre l'app en ligne (GitHub Pages)

1. Envoie ce dépôt sur GitHub (il est actuellement configuré pour `mphschmitt/lsf_app`, branche `master`).
2. Dans le dépôt GitHub : **Settings › Pages › Build and deployment › Source : GitHub Actions**.
3. Le workflow « Publier sur GitHub Pages » publie le dossier `site/` à chaque push sur `master`. Tu peux aussi le lancer manuellement depuis **Actions**.
4. Une fois le premier déploiement terminé, l'adresse s'affiche dans **Settings › Pages** et dans le résumé du workflow, sous la forme `https://mphschmitt.github.io/lsf_app/`.

Le site est statique : aucune étape de build ni dépendance supplémentaire n'est nécessaire. L'application vérifie les mises à jour en arrière-plan et propose un bouton « Mettre à jour » quand une nouvelle version est prête. Les mises à jour sont aussi vérifiées à l'ouverture de l'app.

## Installer l'app sur iPhone

1. Ouvre l'adresse de l'app dans **Safari**.
2. Touche **Partager**, puis **Sur l'écran d'accueil**, puis **Ajouter**.
3. Ouvre l'app depuis son icône.

Sur Android, Chrome propose **Installer l'application** dans son menu. L'app affiche aussi ces étapes sur iPhone.

## Développer

Aucune dépendance ni étape de build : le dossier `site/` est l'app telle qu'elle est publiée (HTML, CSS et modules JavaScript).

```bash
# Lancer l'app en local
python3 -m http.server 8000 --directory site
# puis ouvrir http://localhost:8000

# Tests unitaires (Node 20 ou plus)
node --test tests/*.test.mjs
python3 -m unittest discover -s pipeline -p "test_*.py"

# Test de bout en bout dans Chrome (nécessite Playwright pour Python)
python3 tests/e2e.py
```

### Régénérer le contenu à la main

Il faut Python 3.10 ou plus et `ffmpeg`.

```bash
git clone --depth 1 https://github.com/parlr/lsf-data.git /tmp/lsf-data
python3 pipeline/build.py --parlr /tmp/lsf-data            # ajouter --commons pour Wikimedia Commons
```

Le pipeline collecte les vidéos, vérifie leur licence, regroupe les vidéos par sens, construit les liens Elix, convertit les vidéos libres en MP4 légers (lisibles sur iPhone), découpe les unités en leçons et écrit `site/content/contenu.json`, `site/content/videos-en-ligne.json` et `pipeline/couverture.md`. Les vidéos listées dans le second fichier restent hébergées par Elix et ne sont pas téléchargées.

Pour actualiser les vidéos Elix en ligne pour chaque mot du dictionnaire, exécuter `python3 pipeline/elix_en_ligne.py` avec une connexion Internet. Le script met à jour le manifeste source et celui du site sans télécharger les vidéos.

### Modifier le programme

- `pipeline/units.json` : les 60 unités et les mots visés par chacune. Une unité n'est publiée que si au moins 5 de ses mots ont une vidéo libre.
- `pipeline/grammar.json` : les fiches de grammaire (texte et exercices). Elles sont marquées « à relire » : elles doivent être validées par un enseignant de LSF sourd.

## Structure

```
site/                 l'app publiée
  js/                 main (écrans), session, exos, exercises, fsrs, etat, store, player, ui
  css/ fonts/ icons/
  content/            contenu généré : contenu.json, vidéos MP4, vignettes
  sw.js               service worker (hors ligne)
pipeline/             collecte et construction du contenu (Python)
tests/                tests unitaires (Node) et test de bout en bout (Playwright)
.github/workflows/    publication sur Pages et mise à jour du contenu
```

## Licences

- Code : MIT (voir `LICENSE`).
- Contenu vidéo : licences des auteurs, détaillées dans [`LICENCES-CONTENU.md`](LICENCES-CONTENU.md) et dans l'écran « Sources et licences » de l'app.
- Polices Atkinson Hyperlegible et Bricolage Grotesque : SIL Open Font License (`site/fonts/`).
