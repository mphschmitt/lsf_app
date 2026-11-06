#!/usr/bin/env python3
"""Construit le contenu de l'app à partir des ressources libres existantes.

Usage :
    python3 pipeline/build.py --parlr chemin/vers/lsf-data [--commons] [--sortie site/content]

Étapes : collecte, normalisation et licences, rapprochement des sens,
liens Elix, transcodage MP4, découpage en unités et leçons, rapport de
couverture. Une unité n'est publiée que si les ressources suffisent.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import urllib.parse
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))
from sources import Ressource, collecter_commons, collecter_parlr, sans_accents  # noqa: E402

ICI = os.path.dirname(os.path.abspath(__file__))
TAILLE_LECON = 6
ELIX = "https://dico.elix-lsf.fr/dictionnaire/"

# Corrections de noms de fichiers mal orthographiés dans les sources
CORRECTIONS = {
    "beacoup": "beaucoup",
    "vieu": "vieux",
    "verre de terre": "ver de terre",
    "vitrolle": "Vitrolles",
}
# Noms ignorés : sens incertain
IGNORES = {"oumanie (?)"}
# Noms dont la parenthèse change le sens : on garde un sens séparé
SENS_SEPARES = {"fille (la)": "la fille"}


def cle(s: str) -> str:
    """Clé de comparaison : minuscules, sans accents, espaces normalisés."""
    s = sans_accents(s.lower()).replace("’", "'")
    s = re.sub(r"\s*\?\s*$", "", s)
    return re.sub(r"\s+", " ", s).strip()


def slug(s: str) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", sans_accents(s.lower()))).strip("-")


def normaliser(lemme_brut: str) -> dict | None:
    """Renvoie {affichage, cle, alias, glose} ou None si le nom est ignoré."""
    brut = lemme_brut.strip()
    if brut in IGNORES:
        return None
    if brut in SENS_SEPARES:
        return {"affichage": brut, "cle": cle(SENS_SEPARES[brut]), "alias": [], "glose": ""}
    if cle(brut) in CORRECTIONS:
        brut = CORRECTIONS[cle(brut)]
    glose = ""
    m = re.match(r"^(.*?)\s*\(([^)]*)\)\s*$", brut)
    if m:
        brut, glose = m.group(1).strip(), m.group(2).strip()
    affichage = brut
    morceaux = [p.strip() for p in brut.split(",") if p.strip()]
    principal = morceaux[0] if morceaux else brut
    alias = [cle(p) for p in morceaux[1:]]
    return {"affichage": affichage, "cle": cle(principal), "alias": alias, "glose": glose}


def id_ressource(r: Ressource) -> str:
    return hashlib.sha1((r.source + "|" + r.page_origine + "|" + r.fichier).encode()).hexdigest()[:12]


def nom_fichier_origine(url: str) -> str:
    return urllib.parse.unquote(url.rsplit("File:", 1)[-1]).replace(" ", "_")


def transcoder(r: Ressource, rid: str, dossier: str) -> tuple[str, str] | None:
    """MP4 H.264 léger + vignette JPEG. Renvoie les chemins relatifs."""
    os.makedirs(os.path.join(dossier, "videos"), exist_ok=True)
    os.makedirs(os.path.join(dossier, "vignettes"), exist_ok=True)
    mp4 = os.path.join(dossier, "videos", rid + ".mp4")
    jpg = os.path.join(dossier, "vignettes", rid + ".jpg")
    if not os.path.exists(mp4):
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", r.fichier, "-an",
               "-vf", "scale=480:-2,fps=25", "-c:v", "libx264", "-profile:v", "main",
               "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p",
               "-movflags", "+faststart", mp4]
        if subprocess.run(cmd).returncode != 0:
            return None
    if not os.path.exists(jpg):
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-ss", "0.8", "-i", mp4,
               "-frames:v", "1", "-vf", "scale=240:-2", "-q:v", "6", jpg]
        if subprocess.run(cmd).returncode != 0:
            return None
    return f"content/videos/{rid}.mp4", f"content/vignettes/{rid}.jpg"


def construire_sens(ressources: list[Ressource]) -> "OrderedDict[str, dict]":
    """Regroupe les ressources par sens. Les sens Elix autres que le 1er
    restent séparés, pour ne jamais mélanger deux sens différents."""
    sens: "OrderedDict[str, dict]" = OrderedDict()
    for r in ressources:
        n = normaliser(r.lemme_brut)
        if not n:
            continue
        sid = slug(n["cle"])
        if r.sens > 1:
            sid = f"{sid}-sens-{r.sens}"
        s = sens.get(sid)
        if s is None:
            s = sens[sid] = {
                "id": sid,
                "mot": n["affichage"],
                "cle": n["cle"],
                "alias": list(n["alias"]),
                "glose": n["glose"] or (f"autre sens (n° {r.sens} dans Elix)" if r.sens > 1 else ""),
                "categorie": r.categorie,
                "elix": ELIX + urllib.parse.quote(n["cle"] if r.sens == 1 else n["affichage"]),
                "ressources": [],
            }
        else:
            if not s["glose"] and n["glose"]:
                s["glose"] = n["glose"]
            if not s["categorie"] and r.categorie:
                s["categorie"] = r.categorie
            for a in n["alias"]:
                if a not in s["alias"]:
                    s["alias"].append(a)
        s["ressources"].append(r)
    return sens


def dedoublonner(ressources: list[Ressource]) -> list[Ressource]:
    """Une même vidéo Commons peut venir de deux sources : on garde la première."""
    vus, out = set(), []
    for r in ressources:
        k = nom_fichier_origine(r.page_origine) if "commons.wikimedia.org" in r.page_origine else r.fichier
        if k in vus:
            continue
        vus.add(k)
        out.append(r)
    return out


def index_cles(sens: dict) -> dict:
    idx = {}
    for sid, s in sens.items():
        if "-sens-" in sid:
            continue
        idx.setdefault(s["cle"], sid)
        for a in s["alias"]:
            idx.setdefault(a, sid)
    return idx


def decouper_lecons(num: int, sens_ids: list[str], a_grammaire: bool) -> list[dict]:
    lecons = []
    paquets = [sens_ids[i:i + TAILLE_LECON] for i in range(0, len(sens_ids), TAILLE_LECON)]
    # un dernier paquet trop petit rejoint le précédent
    if len(paquets) > 1 and len(paquets[-1]) < 3:
        dernier = paquets.pop()
        paquets[-1] = paquets[-1] + dernier
    for i, p in enumerate(paquets, 1):
        lecons.append({"id": f"u{num}-l{i}", "type": "vocabulaire", "titre": f"Leçon {i}", "sens": p})
        if i == 1 and a_grammaire:
            lecons.append({"id": f"u{num}-g", "type": "grammaire", "titre": "Grammaire"})
    lecons.append({"id": f"u{num}-r", "type": "revision", "titre": "Révision de l'unité", "sens": sens_ids})
    return lecons


def etat_lettres(ids: list[str], lettres: dict) -> str:
    inverse = {v: k for k, v in lettres.items()}
    noms = [inverse[i].upper() for i in ids]
    return f"{noms[0]} à {noms[-1]}"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--parlr", help="chemin du dépôt parlr/lsf-data")
    ap.add_argument("--commons", action="store_true", help="interroger Wikimedia Commons (réseau requis)")
    ap.add_argument("--sortie", default=os.path.join(ICI, "..", "site", "content"))
    ap.add_argument("--rapport", default=os.path.join(ICI, "couverture.md"))
    ap.add_argument("--jobs", type=int, default=4)
    args = ap.parse_args()

    ressources: list[Ressource] = []
    sources_utilisees = []
    if args.parlr:
        r = collecter_parlr(args.parlr)
        ressources += r
        sources_utilisees.append(f"parlr/lsf-data : {len(r)} vidéos retenues")
    if args.commons:
        try:
            r = collecter_commons(os.path.join(ICI, ".cache"))
            ressources += r
            sources_utilisees.append(f"Wikimedia Commons : {len(r)} vidéos retenues")
        except Exception as e:  # le pipeline reste utilisable sans Commons
            sources_utilisees.append(f"Wikimedia Commons : inaccessible ({e.__class__.__name__})")
    ressources = dedoublonner(ressources)

    sortie = os.path.abspath(args.sortie)
    os.makedirs(sortie, exist_ok=True)

    # Transcodage en parallèle
    ids = [id_ressource(r) for r in ressources]
    with ThreadPoolExecutor(max_workers=args.jobs) as ex:
        fichiers = list(ex.map(lambda p: transcoder(p[0], p[1], sortie), zip(ressources, ids)))
    gardees = [(r, rid, f) for r, rid, f in zip(ressources, ids, fichiers) if f]
    rid_de = {id(r): (rid, f) for r, rid, f in gardees}

    sens = construire_sens([r for r, _, _ in gardees])
    sens_json = OrderedDict()
    for sid, s in sens.items():
        res_json = []
        for r in s["ressources"]:
            rid, (video, vignette) = rid_de[id(r)]
            res_json.append({
                "id": rid, "video": video, "vignette": vignette,
                "source": r.source_nom, "auteur": r.auteur,
                "licence": r.licence, "licenceUrl": r.licence_url, "origine": r.page_origine,
            })
        sens_json[sid] = {k: v for k, v in s.items() if k not in ("ressources", "cle")}
        sens_json[sid]["ressources"] = res_json

    plan = json.load(open(os.path.join(ICI, "units.json"), encoding="utf-8"))
    grammaire = json.load(open(os.path.join(ICI, "grammar.json"), encoding="utf-8"))
    idx = index_cles(sens)
    minimum = plan["min_signes"]

    unites, rapport = [], []
    for u in plan["unites"]:
        trouves, manquants = [], []
        for mot in u.get("mots", []):
            sid = idx.get(cle(mot))
            (trouves if sid else manquants).append(sid or mot)
        trouves = list(OrderedDict.fromkeys(trouves))
        entree = {"num": u["num"], "niveau": u["niveau"], "titre": u["titre"],
                  "facultative": u.get("facultative", False), "dactylologie": u.get("dactylologie", False)}
        if u.get("dactylologie"):
            lettres = {c: idx.get(c) for c in "abcdefghijklmnopqrstuvwxyz"}
            dispo = [c for c, s in lettres.items() if s]
            publiee = len(dispo) == 26
            raison = "" if publiee else f"alphabet incomplet : {len(dispo)} lettre(s) sur 26 sous licence libre"
            if publiee:
                ids_lettres = [lettres[c] for c in "abcdefghijklmnopqrstuvwxyz"]
                entree["lettres"] = lettres
                entree["sens"] = ids_lettres
                lecons = decouper_lecons(u["num"], ids_lettres, False)[:-1]
                for lec in lecons:
                    lec["titre"] = "Lettres " + etat_lettres(lec["sens"], lettres)
                lecons.append({"id": f"u{u['num']}-e", "type": "epeler", "titre": "Lire des mots épelés"})
                entree["lecons"] = lecons
        elif u.get("discours"):
            publiee, raison = False, "niveau fondé sur des vidéos de discours : aucune source libre trouvée"
        else:
            publiee = len(trouves) >= minimum
            raison = "" if publiee else f"{len(trouves)} signe(s) disponible(s), minimum {minimum}"
        g = u.get("grammaire")
        if publiee and not u.get("dactylologie"):
            entree["sens"] = trouves
            entree["lecons"] = decouper_lecons(u["num"], trouves, bool(g and g in grammaire["fiches"]))
            if g and g in grammaire["fiches"]:
                entree["grammaire"] = grammaire["fiches"][g]
        entree["publiee"] = publiee
        unites.append(entree)
        rapport.append((u, publiee, trouves, manquants, raison))

    contenu = {
        "version": datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S"),
        "genere": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "statutGrammaire": grammaire.get("statut", ""),
        "niveaux": plan["niveaux"],
        "unites": unites,
        "sens": sens_json,
        "sources": sources_utilisees,
    }
    with open(os.path.join(sortie, "contenu.json"), "w", encoding="utf-8") as f:
        json.dump(contenu, f, ensure_ascii=False, separators=(",", ":"))

    ecrire_rapport(args.rapport, rapport, sens_json, sources_utilisees)
    nb_pub = sum(1 for u in unites if u["publiee"])
    print(f"{len(sens_json)} sens, {sum(len(s['ressources']) for s in sens_json.values())} vidéos, "
          f"{nb_pub} unités publiées sur {len(unites)}")


def ecrire_rapport(chemin, rapport, sens_json, sources):
    lignes = ["# Rapport de couverture", "",
              f"Généré le {datetime.now(timezone.utc).strftime('%d/%m/%Y %H:%M')} UTC.", "",
              "## Sources", ""] + [f"- {s}" for s in sources] + [
              "", f"{len(sens_json)} sens, {sum(len(s['ressources']) for s in sens_json.values())} vidéos.", "",
              "## Unités", "", "| # | Unité | Publiée | Signes trouvés | Remarque |", "| --- | --- | --- | --- | --- |"]
    for u, pub, trouves, manquants, raison in rapport:
        lignes.append(f"| {u['num']} | {u['titre']} | {'oui' if pub else 'non'} | {len(trouves)} | {raison} |")
    lignes += ["", "## Mots du programme sans vidéo libre", ""]
    for u, pub, trouves, manquants, raison in rapport:
        if manquants:
            lignes.append(f"- **{u['num']}. {u['titre']}** : " + ", ".join(manquants))
    with open(chemin, "w", encoding="utf-8") as f:
        f.write("\n".join(lignes) + "\n")


if __name__ == "__main__":
    main()
