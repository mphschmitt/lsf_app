"""Parcours de bout en bout dans un vrai navigateur (Playwright + Chrome).

Lance un serveur local sur site/, ouvre l'app en taille iPhone, joue la
première leçon en répondant juste, puis vérifie progression, entraînement,
dictionnaire, fiche mot, profil et crédits. Enregistre des captures.

    python3 tests/e2e.py [--chrome /usr/bin/google-chrome] [--captures dossier]
"""
import argparse
import functools
import http.server
import json
import os
import threading

from playwright.sync_api import sync_playwright

ICI = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(ICI, "..", "site")


def serveur(port):
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=SITE)
    h.func.log_message = lambda *a: None
    s = http.server.ThreadingHTTPServer(("127.0.0.1", port), h)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--chrome", default="/usr/bin/google-chrome")
    ap.add_argument("--captures", default=os.path.join(ICI, "captures"))
    ap.add_argument("--port", type=int, default=8765)
    args = ap.parse_args()
    os.makedirs(args.captures, exist_ok=True)
    contenu = json.load(open(os.path.join(SITE, "content", "contenu.json"), encoding="utf-8"))
    video_vers_sens = {r["video"]: sid for sid, s in contenu["sens"].items() for r in s["ressources"]}
    mot_vers_sens = {s["mot"]: sid for sid, s in contenu["sens"].items()}
    erreurs = []
    s = serveur(args.port)
    base = f"http://localhost:{args.port}/"

    with sync_playwright() as p:
        nav = p.chromium.launch(executable_path=args.chrome, args=["--autoplay-policy=no-user-gesture-required"])
        ctx = nav.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, locale="fr-FR")
        page = ctx.new_page()
        page.on("pageerror", lambda e: erreurs.append(f"JS : {e}"))
        page.on("console", lambda m: m.type == "error" and erreurs.append(f"console : {m.text}"))
        cap = lambda nom: page.screenshot(path=os.path.join(args.captures, nom + ".png"))

        page.goto(base)
        page.wait_for_selector(".bienvenue")
        cap("01-bienvenue")
        page.click(".carte-choix.fort")
        page.wait_for_selector(".parcours")
        page.wait_for_timeout(400)
        cap("02-parcours")

        # Première leçon
        page.click(".noeud.courant")
        page.wait_for_selector(".corps-session")
        etapes = 0
        while etapes < 60:
            etapes += 1
            page.wait_for_timeout(150)
            if page.query_selector(".fin"):
                break
            consigne = page.inner_text(".consigne") if page.query_selector(".consigne") else ""
            if page.query_selector(".surtitre") and not page.query_selector(".consigne"):
                if etapes == 1:
                    cap("03-decouverte")
                page.click(".pied-session .btn.principal")
                continue
            principal = ".lecteur video"
            if consigne.startswith("Quel mot est signé"):
                sid = video_vers_sens[page.get_attribute(principal, "src")]
                page.click(f'.choix[data-id="{sid}"]')
                if etapes < 12:
                    cap("04-question-video-mot")
            elif consigne.startswith("Quelle vidéo signe"):
                mot = consigne.split("« ", 1)[1].rsplit(" »", 1)[0]
                cible = mot_vers_sens[mot]
                for b in page.query_selector_all(".choix-video"):
                    if video_vers_sens[b.query_selector("video").get_attribute("src")] == cible:
                        b.click()
                        break
            elif consigne.startswith("Ce signe veut-il dire"):
                mot = consigne.split("« ", 1)[1].rsplit(" »", 1)[0]
                montre = mot_vers_sens[mot]
                vrai = video_vers_sens[page.get_attribute(principal, "src")]
                page.click(".grille-choix .choix >> nth=0" if montre == vrai else ".grille-choix .choix >> nth=1")
            elif consigne.startswith("Écris le mot"):
                sid = video_vers_sens[page.get_attribute(principal, "src")]
                page.fill("#saisie", contenu["sens"][sid]["mot"])
            elif consigne.startswith("Associe"):
                for b in page.query_selector_all(".paires .col:first-child .choix-video"):
                    sid = video_vers_sens[b.query_selector("video").get_attribute("src")]
                    b.click()
                    page.click(f'.paires .col:last-child .choix[data-id="{sid}"]')
                cap("05-paires")
                page.wait_for_selector(".pied-session.succes")
                page.click(".pied-session .btn.principal")
                continue
            else:
                erreurs.append(f"étape inconnue : {consigne!r}")
                break
            page.click(".pied-session .btn.principal")
            page.wait_for_selector(".pied-session.succes, .pied-session.echec")
            if page.query_selector(".pied-session.echec"):
                erreurs.append(f"réponse jugée fausse : {consigne!r}")
                cap("erreur")
            page.click(".pied-session .btn.principal")
        page.wait_for_selector(".fin")
        cap("06-fin-lecon")
        page.click(".pied-session .btn.principal")
        page.wait_for_selector(".parcours")
        if not page.query_selector(".noeud.fait"):
            erreurs.append("la leçon terminée n'apparaît pas comme faite")
        page.evaluate("window.scrollTo(0, 0)")
        cap("07-parcours-apres")

        # Leçon de grammaire (débloquée)
        page.click(".noeud.courant")
        page.wait_for_selector(".fiche")
        cap("08-grammaire")
        page.goto(base + "#/")

        # Entraînement
        page.goto(base + "#/entrainement")
        page.wait_for_selector(".carte")
        cap("09-entrainement")
        page.click("text=Lancer la session")
        page.wait_for_selector(".corps-session")
        cap("10-session-entrainement")
        page.click('[aria-label="Quitter la session"]')

        # Dictionnaire et fiche mot
        page.goto(base + "#/dico")
        page.fill('input[type="search"]', "croissant")
        page.wait_for_timeout(200)
        cap("11-dico")
        page.click(".liste-mots a >> nth=0")
        page.wait_for_selector(".liste-ressources")
        cap("12-fiche-mot")
        if len(page.query_selector_all(".ressource")) < 2:
            erreurs.append("croissant devrait avoir au moins 2 ressources")
        else:
            premiere_video = page.get_attribute(".lecteur video", "src")
            cadre = page.locator(".cadre-video").bounding_box()
            x = cadre["x"] + cadre["width"] / 2
            y = cadre["y"] + cadre["height"] / 2
            page.mouse.move(x, y)
            page.mouse.down()
            page.mouse.move(x - 80, y, steps=5)
            page.mouse.up()
            page.wait_for_function("(src) => document.querySelector('.lecteur video').getAttribute('src') !== src", premiere_video)
            if not page.query_selector("li:nth-child(2) .ressource.actif"):
                erreurs.append("le balayage n'a pas synchronisé la ressource sélectionnée")
            page.mouse.move(x, y)
            page.mouse.down()
            page.mouse.move(x + 80, y, steps=5)
            page.mouse.up()
            page.locator("li:nth-child(1) .ressource.actif").wait_for()
            if page.get_attribute(".lecteur video", "src") != premiere_video:
                erreurs.append("le balayage inverse n'a pas réaffiché la première vidéo")

        # Profil, crédits
        page.goto(base + "#/profil")
        page.wait_for_selector(".grille-stats")
        cap("13-profil")
        page.goto(base + "#/credits")
        page.wait_for_selector(".carte")
        cap("14-credits")

        # La progression survit à un rechargement
        page.reload()
        page.goto(base + "#/profil")
        page.wait_for_selector(".grille-stats")
        appris = page.inner_text(".stat-carte strong >> nth=0")
        if appris == "0":
            erreurs.append("progression perdue après rechargement")

        # Service worker actif
        page.goto(base)
        page.wait_for_timeout(1500)
        sw = page.evaluate("navigator.serviceWorker && navigator.serviceWorker.controller ? 'ok' : 'non'")
        if sw != "ok":
            page.reload()
            page.wait_for_timeout(1000)
            sw = page.evaluate("navigator.serviceWorker && navigator.serviceWorker.controller ? 'ok' : 'non'")
        if sw != "ok":
            erreurs.append("service worker non actif")
        nav.close()
    s.shutdown()
    print(f"{etapes} étapes jouées dans la première leçon")
    if erreurs:
        print("ÉCHECS :")
        for e in erreurs:
            print(" -", e)
        raise SystemExit(1)
    print("Parcours de bout en bout : OK")


if __name__ == "__main__":
    main()
