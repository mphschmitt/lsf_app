"""Collecte des ressources vidéo sous licence libre.

Chaque source renvoie des objets Ressource. Une ressource sans licence
libre clairement identifiée n'est jamais renvoyée.
"""
from __future__ import annotations

import json
import os
import re
import unicodedata
import urllib.parse
import urllib.request
from dataclasses import dataclass, field

LICENCES_ACCEPTEES = {
    "CC BY 3.0": "https://creativecommons.org/licenses/by/3.0/",
    "CC BY 4.0": "https://creativecommons.org/licenses/by/4.0/",
    "CC BY-SA 3.0": "https://creativecommons.org/licenses/by-sa/3.0/",
    "CC BY-SA 4.0": "https://creativecommons.org/licenses/by-sa/4.0/",
    "CC0": "https://creativecommons.org/publicdomain/zero/1.0/",
    "Public domain": "",
}


@dataclass
class Ressource:
    lemme_brut: str          # nom tel que fourni par la source
    fichier: str             # chemin local ou URL du fichier vidéo
    source: str              # identifiant court de la source
    source_nom: str          # nom affiché
    auteur: str
    licence: str
    licence_url: str
    page_origine: str
    categorie: str = ""      # n.m., v., adj. quand la source le dit
    sens: int = 1            # numéro de sens quand la source le dit
    notes: list[str] = field(default_factory=list)


def sans_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def cle_simple(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", sans_accents(s.lower()))


# ---------------------------------------------------------------------------
# Source 1 : dépôt parlr/lsf-data (GitHub)
# ---------------------------------------------------------------------------

JAUVERT_VIDEOS = {
    1: "https://www.youtube.com/watch?v=rz3jw0_XXoc",
    2: "https://www.youtube.com/watch?v=DbTKAbY-i0A",
}


def _mots_sous_titres(chemin_ass: str) -> list[str]:
    mots = []
    with open(chemin_ass, encoding="utf-8") as f:
        for ligne in f:
            if ligne.startswith("Dialogue:"):
                texte = ligne.rstrip("\n").split(",", 9)[-1].strip()
                if texte:
                    mots.append(texte)
    return mots


def collecter_parlr(racine: str) -> list[Ressource]:
    """Vidéos du dépôt parlr/lsf-data dont la licence est documentée.

    - Laura Jauvert : seules les vidéos issues de « Apprendre 300 mots du
      quotidien en LSF » parties 1 et 2, publiées en CC BY 3.0 selon
      parlr/lsf. Les autres vidéos du même auteur ne sont pas retenues.
    - Elix : les 100 vidéos versées par Signes de sens sur Wikimedia
      Commons en CC BY-SA 4.0.
    - Éducation nationale : licence non documentée, non retenues.
    """
    res: list[Ressource] = []

    # Laura Jauvert
    partie_de = {}
    for p in (1, 2):
        ass = os.path.join(racine, "data", f"partie-{p}:-Apprendre-300-mots-du-quotidien-en-LSF.jauvert-laura.hd.ass")
        for mot in _mots_sous_titres(ass):
            partie_de.setdefault(mot, p)
    dossier = os.path.join(racine, "videos", "jauvert")
    for nom in sorted(os.listdir(dossier)):
        if not nom.endswith(".webm"):
            continue
        mot = nom[:-5]
        p = partie_de.get(mot)
        if p is None:
            continue  # licence non documentée pour cette vidéo
        res.append(Ressource(
            lemme_brut=mot,
            fichier=os.path.join(dossier, nom),
            source="jauvert",
            source_nom="Laura Jauvert, via parlr/lsf-data",
            auteur="Laura Jauvert",
            licence="CC BY 3.0",
            licence_url=LICENCES_ACCEPTEES["CC BY 3.0"],
            page_origine=JAUVERT_VIDEOS[p],
        ))

    # Elix (Commons)
    script = open(os.path.join(racine, "scripts", "get-elix-videos.bash"), encoding="utf-8").read()
    noms_commons = re.findall(r"/([^/]+_-_Elix\.ogv)/", script)
    par_cle = {cle_simple(n.split("_")[0]): n for n in noms_commons}
    dossier = os.path.join(racine, "videos", "elix")
    for nom in sorted(os.listdir(dossier)):
        if not nom.endswith(".webm"):
            continue
        mot = nom[:-5]
        commons = par_cle.get(cle_simple(mot))
        if not commons:
            continue
        categorie, sens = _categorie_sens_elix(commons)
        res.append(Ressource(
            lemme_brut=mot,
            fichier=os.path.join(dossier, nom),
            source="elix-commons",
            source_nom="Elix (Signes de sens), via Wikimedia Commons",
            auteur="Signes de sens",
            licence="CC BY-SA 4.0",
            licence_url=LICENCES_ACCEPTEES["CC BY-SA 4.0"],
            page_origine="https://commons.wikimedia.org/wiki/File:" + urllib.parse.quote(commons),
            categorie=categorie,
            sens=sens,
        ))
    return res


CATEGORIES_ELIX = {"Nm": "n.m.", "Nf": "n.f.", "N": "n.", "Adj": "adj.", "Adv": "adv.", "V": "v.", "Prep": "prép."}


def _categorie_sens_elix(nom_commons: str) -> tuple[str, int]:
    morceaux = nom_commons.split("_")
    categorie = CATEGORIES_ELIX.get(morceaux[1], "") if len(morceaux) > 1 else ""
    try:
        sens = int(morceaux[2])
    except (IndexError, ValueError):
        sens = 1
    return categorie, sens


# ---------------------------------------------------------------------------
# Source 2 : Wikimedia Commons (API MediaWiki)
# ---------------------------------------------------------------------------

API_COMMONS = "https://commons.wikimedia.org/w/api.php"
# Catégories candidates : celles qui n'existent pas renvoient simplement zéro fichier.
CATEGORIES_COMMONS = [
    "Category:Videos Langue des signes française",
    "Category:Videos Langue des signes francaise",
    "Category:Lingua Libre pronunciation-fsl",
    "Category:Files supported by Wikimedia France - Elix",
]
UA = "lsf-app-pipeline/1.0 (https://github.com/{}; contenu pédagogique libre)".format(
    os.environ.get("GITHUB_REPOSITORY", "lsf-app"))


def _api(params: dict) -> dict:
    params = {**params, "format": "json", "formatversion": "2"}
    url = API_COMMONS + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def _membres(categorie: str, profondeur: int, vus: set[str]) -> list[str]:
    fichiers: list[str] = []
    cont: dict = {}
    while True:
        data = _api({"action": "query", "list": "categorymembers", "cmtitle": categorie,
                     "cmtype": "file|subcat", "cmlimit": "500", **cont})
        for m in data.get("query", {}).get("categorymembers", []):
            titre = m["title"]
            if m.get("ns") == 14 and profondeur > 0 and titre not in vus:
                vus.add(titre)
                fichiers += _membres(titre, profondeur - 1, vus)
            elif m.get("ns") == 6:
                fichiers.append(titre)
        if "continue" not in data:
            return fichiers
        cont = data["continue"]


def licence_commons(extmeta: dict) -> tuple[str, str] | None:
    """Renvoie (licence normalisée, url) si la licence est acceptée."""
    brut = (extmeta.get("LicenseShortName", {}) or {}).get("value", "").strip()
    url = (extmeta.get("LicenseUrl", {}) or {}).get("value", "").strip()
    normal = brut.replace("CC-BY", "CC BY").replace("CC BY SA", "CC BY-SA")
    if normal.lower() in ("cc0", "cc0 1.0", "cc-zero"):
        return "CC0", LICENCES_ACCEPTEES["CC0"]
    if normal.lower().startswith("public domain"):
        return "Public domain", url
    if normal in LICENCES_ACCEPTEES:
        return normal, url or LICENCES_ACCEPTEES[normal]
    return None


def lemme_depuis_titre(titre: str) -> tuple[str, str, int] | None:
    """Déduit le mot signé du nom de fichier Commons.

    Formats reconnus :
    - Lingua Libre : « File:LL-Q33302 (fsl)-Utilisateur-mot.webm »
    - Elix : « File:Mot_Nm_1_1_1_-_Elix.ogv »
    Les autres fichiers sont ignorés plutôt que devinés.
    """
    nom = titre.split(":", 1)[-1]
    m = re.match(r"LL-Q\d+ \(fsl\)-[^-]+-(.+)\.(webm|ogv|mp4)$", nom)
    if m:
        return m.group(1).strip(), "", 1
    m = re.match(r"(.+?)_([A-Z][a-z]*)_(\d+)_\d+(?:_\d+)?_-_Elix\.(ogv|webm)$", nom)
    if m:
        mot = m.group(1).replace("_", " ")
        return mot, CATEGORIES_ELIX.get(m.group(2), ""), int(m.group(3))
    return None


def _nettoyer_html(s: str) -> str:
    return re.sub(r"<[^>]+>", "", s or "").strip()


def collecter_commons(cache: str) -> list[Ressource]:
    """Interroge Commons. Nécessite un accès réseau (lancé en CI)."""
    os.makedirs(cache, exist_ok=True)
    vus: set[str] = set()
    titres: list[str] = []
    for cat in CATEGORIES_COMMONS:
        titres += _membres(cat, profondeur=2, vus=vus)
    titres = sorted(set(titres))
    res: list[Ressource] = []
    for i in range(0, len(titres), 50):
        lot = titres[i:i + 50]
        data = _api({"action": "query", "titles": "|".join(lot), "prop": "imageinfo",
                     "iiprop": "url|extmetadata|mime"})
        for page in data.get("query", {}).get("pages", []):
            info = (page.get("imageinfo") or [{}])[0]
            if not info.get("mime", "").startswith(("video/", "application/ogg")):
                continue
            lic = licence_commons(info.get("extmetadata", {}))
            lem = lemme_depuis_titre(page["title"])
            if not lic or not lem:
                continue
            mot, categorie, sens = lem
            res.append(Ressource(
                lemme_brut=mot,
                fichier=info["url"],
                source="commons",
                source_nom="Wikimedia Commons",
                auteur=_nettoyer_html(info.get("extmetadata", {}).get("Artist", {}).get("value", "")) or "Contributeur Wikimedia Commons",
                licence=lic[0],
                licence_url=lic[1],
                page_origine=info.get("descriptionurl", ""),
                categorie=categorie,
                sens=sens,
            ))
    return res
