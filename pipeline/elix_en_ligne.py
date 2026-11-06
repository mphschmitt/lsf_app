#!/usr/bin/env python3
"""Repère les vidéos de signe Elix correspondant au vocabulaire de l'app."""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ICI = Path(__file__).resolve().parent
CONTENU = ICI.parent / "site" / "content" / "contenu.json"
MANIFESTE = ICI / "elix-en-ligne.json"
PUBLIC = ICI.parent / "site" / "content" / "videos-en-ligne.json"
ELIX = "https://dico.elix-lsf.fr/dictionnaire/"
HOTE_VIDEO = "elix-lsf.s3.rbx.io.cloud.ovh.net"
DEBUT_ETAT = re.compile(r"window\.__PRELOADED_STATE__\s*=\s*")


def cle_mot(mot: str) -> str:
    mot = unicodedata.normalize("NFKC", mot).casefold().replace("’", "'")
    return " ".join(mot.split())


def videos_de_page(html: str, mot: str, origine: str) -> list[dict]:
    match = DEBUT_ETAT.search(html)
    if not match:
        raise ValueError("état de recherche Elix introuvable")
    etat, _ = json.JSONDecoder().raw_decode(html[match.end():].lstrip())
    resultats = etat.get("search", {}).get("results")
    if not isinstance(resultats, list):
        raise ValueError("résultats de recherche Elix invalides")

    videos = []
    vus = set()
    for resultat in resultats:
        if cle_mot(str(resultat.get("name", ""))) != cle_mot(mot):
            continue
        for sens in resultat.get("meanings", []):
            for video in sens.get("wordSigns", []):
                url = video.get("uri")
                if not isinstance(url, str):
                    continue
                parsed = urllib.parse.urlparse(url)
                if parsed.scheme != "https" or parsed.hostname != HOTE_VIDEO or not parsed.path.lower().endswith(".mp4"):
                    continue
                if url in vus:
                    continue
                vus.add(url)
                numero = len(videos) + 1
                identifiant = "elix-" + re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", unicodedata.normalize(
                    "NFKD", mot.casefold()).encode("ascii", "ignore").decode()).strip("-"))
                if numero > 1:
                    identifiant += f"-{numero}"
                image = video.get("image")
                if not isinstance(image, str) or not image.startswith("https://" + HOTE_VIDEO + "/"):
                    image = None
                ressource = {
                    "id": identifiant,
                    "video": url,
                    "source": "Elix (Signes de sens)",
                    "auteur": video.get("author") or "Signes de sens",
                    "origine": origine,
                    "distante": True,
                }
                if image:
                    ressource["vignette"] = image
                videos.append(ressource)
    return videos


def charger_page(mot: str, delai: float) -> tuple[str, str]:
    url = ELIX + urllib.parse.quote(mot, safe="")
    requete = urllib.request.Request(
        url,
        headers={"User-Agent": "LSFApp/1.0 (+https://github.com/mphschmitt/lsf_app)"},
    )
    for tentative in range(4):
        try:
            with urllib.request.urlopen(requete, timeout=30) as reponse:
                page = reponse.read().decode("utf-8")
            return page, url
        except urllib.error.HTTPError as erreur:
            if erreur.code == 404:
                return "", url
            if erreur.code not in (429, 500, 502, 503, 504) or tentative == 3:
                raise
        except (TimeoutError, urllib.error.URLError):
            if tentative == 3:
                raise
        time.sleep(max(delai, 0.5) * (2**tentative))
    raise RuntimeError(f"échec de récupération de {url}")


def decouvrir(mots: list[str], existant: dict, delai: float) -> tuple[dict, list[str]]:
    manifeste = {}
    sans_video = []
    for index, mot in enumerate(mots, 1):
        page, origine = charger_page(mot, delai)
        videos = videos_de_page(page, mot, origine) if page else []
        if videos:
            manifeste[mot] = videos
        elif mot in existant:
            manifeste[mot] = existant[mot]
        else:
            sans_video.append(mot)
        print(f"\rRecherche Elix : {index}/{len(mots)}", end="", flush=True)
        if index < len(mots):
            time.sleep(delai)
    print()
    return manifeste, sans_video


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contenu", type=Path, default=CONTENU)
    parser.add_argument("--manifeste", type=Path, default=MANIFESTE)
    parser.add_argument("--public", type=Path, default=PUBLIC)
    parser.add_argument("--delai", type=float, default=0.35, help="pause entre les pages Elix (secondes)")
    args = parser.parse_args()
    if args.delai < 0:
        parser.error("--delai doit être positif ou nul")

    contenu = json.loads(args.contenu.read_text(encoding="utf-8"))
    mots = list(dict.fromkeys(s["mot"] for s in contenu["sens"].values()))
    existant = json.loads(args.manifeste.read_text(encoding="utf-8")) if args.manifeste.exists() else {}
    manifeste, sans_video = decouvrir(mots, existant, args.delai)

    for chemin in (args.manifeste, args.public):
        chemin.parent.mkdir(parents=True, exist_ok=True)
        chemin.write_text(json.dumps(manifeste, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    total = sum(len(videos) for videos in manifeste.values())
    print(f"{len(manifeste)} mots avec vidéos Elix, {total} vidéos, {len(sans_video)} mots sans résultat vidéo exact.")
    if sans_video:
        print("Sans vidéo :", ", ".join(sans_video))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, urllib.error.URLError) as erreur:
        print(f"Erreur de collecte Elix : {erreur}", file=sys.stderr)
        sys.exit(1)
