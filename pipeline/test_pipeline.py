import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
from build import cle, normaliser, decouper_lecons  # noqa: E402
from elix_en_ligne import videos_de_page  # noqa: E402
from sources import lemme_depuis_titre, licence_commons  # noqa: E402


class TestNormalisation(unittest.TestCase):
    def test_cle(self):
        self.assertEqual(cle("Combien ?"), "combien")
        self.assertEqual(cle("Café"), "cafe")
        self.assertEqual(cle("  au   revoir "), "au revoir")

    def test_normaliser(self):
        n = normaliser("lui, elle")
        self.assertEqual(n["cle"], "lui")
        self.assertEqual(n["alias"], ["elle"])
        n = normaliser("chocolatine (pain au chocolat)")
        self.assertEqual((n["affichage"], n["glose"]), ("chocolatine", "pain au chocolat"))
        self.assertEqual(normaliser("beacoup")["cle"], "beaucoup")
        self.assertIsNone(normaliser("oumanie (?)"))
        self.assertEqual(normaliser("fille (la)")["cle"], "la fille")

    def test_decoupage(self):
        lecons = decouper_lecons(2, [str(i) for i in range(13)], True)
        types = [l["type"] for l in lecons]
        self.assertEqual(types, ["vocabulaire", "grammaire", "vocabulaire", "revision"])
        self.assertEqual(sum(len(l["sens"]) for l in lecons if l["type"] == "vocabulaire"), 13)


class TestCommons(unittest.TestCase):
    def test_titres(self):
        self.assertEqual(lemme_depuis_titre("File:LL-Q33302 (fsl)-Exemple-bonjour.webm"), ("bonjour", "", 1))
        self.assertEqual(lemme_depuis_titre("File:Chapeau_Nm_2_1_1_-_Elix.ogv"), ("Chapeau", "n.m.", 2))
        self.assertIsNone(lemme_depuis_titre("File:Une vidéo quelconque.webm"))

    def test_licences(self):
        ok = {"LicenseShortName": {"value": "CC BY-SA 4.0"}, "LicenseUrl": {"value": "https://creativecommons.org/licenses/by-sa/4.0"}}
        self.assertEqual(licence_commons(ok)[0], "CC BY-SA 4.0")
        self.assertEqual(licence_commons({"LicenseShortName": {"value": "CC0"}})[0], "CC0")
        self.assertIsNone(licence_commons({"LicenseShortName": {"value": "CC BY-NC 4.0"}}))
        self.assertIsNone(licence_commons({}))


class TestElixEnLigne(unittest.TestCase):
    def test_video_de_signe_exacte_uniquement(self):
        html = '''<script>window.__PRELOADED_STATE__ = {"search":{"results":[
          {"name":"bonjour","meanings":[{"wordSigns":[
            {"uri":"https://elix-lsf.s3.rbx.io.cloud.ovh.net/spip_videos/bonjour.mp4","author":"Signes de sens","image":"https://elix-lsf.s3.rbx.io.cloud.ovh.net/spip_images/bonjour.jpg"}
          ],"definitionSigns":[{"uri":"https://elix-lsf.s3.rbx.io.cloud.ovh.net/spip_videos/definition.mp4"}]}]},
          {"name":"bonsoir","meanings":[{"wordSigns":[
            {"uri":"https://elix-lsf.s3.rbx.io.cloud.ovh.net/spip_videos/bonsoir.mp4"}
          ]}]}
        ]}};</script>'''
        videos = videos_de_page(html, "Bonjour", "https://dico.elix-lsf.fr/dictionnaire/bonjour")
        self.assertEqual(len(videos), 1)
        self.assertTrue(videos[0]["video"].endswith("/bonjour.mp4"))
        self.assertEqual(videos[0]["auteur"], "Signes de sens")
        self.assertTrue(videos[0]["distante"])


if __name__ == "__main__":
    unittest.main()
