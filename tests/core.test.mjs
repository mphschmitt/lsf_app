import test from "node:test";
import assert from "node:assert/strict";
import { reviser, nouvelleCarte, Note, intervalle, retenue, estDue } from "../site/js/fsrs.js";
import { construireSerie, construireLecon, distracteurs, estBonneSaisie, noteDuSens, normaliser, construireGrammaire } from "../site/js/exercises.js";
import { ressourcesVideo, ressourceVideoAttitree } from "../site/js/player.js";
import { retourPositif } from "../site/js/feedback.js";
import fs from "node:fs";

const JOUR = 86400000;

test("Retours positifs : les effets peuvent être désactivés séparément", () => {
  assert.doesNotThrow(() => retourPositif({ son: false, vibration: false }));
});

test("Ressources vidéo : les ressources locales passent avant les distantes hors ligne", () => {
  const local = { video: "local.mp4" };
  const distante = { video: "https://elix.example/video.mp4", distante: true };
  const mot = { ressources: [distante, local], videosEnLigne: [] };
  assert.deepEqual(ressourcesVideo(mot, true), [local, distante]);
  assert.deepEqual(ressourcesVideo(mot, false), [distante, local]);
  assert.deepEqual(ressourcesVideo({ ressources: [distante], videosEnLigne: [] }, true), [distante]);
});

test("Vidéo attitrée : choisit toujours la première ressource locale", () => {
  const locale = { id: "locale" };
  const distante = { id: "elix", distante: true };
  assert.equal(ressourceVideoAttitree({ ressources: [distante, locale], videosEnLigne: [] }), locale);
  assert.equal(ressourceVideoAttitree({ ressources: [], videosEnLigne: [distante] }), distante);
});

test("FSRS : R(S, S) vaut 0,9 et l'intervalle vaut S", () => {
  assert.ok(Math.abs(retenue(10, 10) - 0.9) < 1e-9);
  assert.ok(Math.abs(intervalle(7) - 7) < 1e-9);
});

test("FSRS : première révision réussie, puis l'intervalle grandit", () => {
  const t0 = Date.UTC(2026, 0, 1);
  let c = reviser(nouvelleCarte("x"), Note.Bien, t0);
  assert.equal(c.revisions, 1);
  assert.ok(c.stabilite > 3 && c.stabilite < 3.3);
  const i1 = c.echeance - t0;
  c = reviser(c, Note.Bien, c.echeance);
  const i2 = c.echeance - c.derniere;
  assert.ok(i2 > i1, "le deuxième intervalle doit être plus long");
});

test("FSRS : un oubli fait revenir le signe vite et baisse la stabilité", () => {
  const t0 = Date.UTC(2026, 0, 1);
  let c = reviser(nouvelleCarte("x"), Note.Bien, t0);
  c = reviser(c, Note.Bien, c.echeance);
  const s = c.stabilite;
  const t = c.echeance;
  c = reviser(c, Note.Raté, t);
  assert.ok(c.stabilite < s);
  assert.equal(c.oublis, 1);
  assert.ok(c.echeance - t <= 10 * 60000);
  assert.ok(estDue(c, t + 11 * 60000));
  assert.ok(c.difficulte >= 1 && c.difficulte <= 10);
});

const sens = Object.fromEntries(["a", "b", "c", "d", "e", "f"].map((id, i) => [id, { id, mot: ["bonjour", "merci", "lui, elle", "combien ?", "café", "au revoir"][i], alias: id === "c" ? ["elle"] : [] }]));

test("Saisie : accents, majuscules, ponctuation et alias tolérés", () => {
  assert.ok(estBonneSaisie(sens.e, "CAFE"));
  assert.ok(estBonneSaisie(sens.d, "combien"));
  assert.ok(estBonneSaisie(sens.c, "elle"));
  assert.ok(estBonneSaisie(sens.c, "lui"));
  assert.ok(!estBonneSaisie(sens.a, "merci"));
  assert.equal(normaliser("  Au   Revoir! "), "au revoir");
});

test("Distracteurs : jamais la cible ni un doublon", () => {
  const d = distracteurs("a", ["b", "c"], ["d", "e", "f"], 3, sens, () => 0.3);
  assert.equal(d.length, 3);
  assert.ok(!d.includes("a"));
  assert.equal(new Set(d).size, 3);
});

test("Série : bon nombre d'exercices, options valides", () => {
  const ids = Object.keys(sens);
  const serie = construireSerie({ ids, types: ["videoMot", "motVideo", "vraiFaux", "saisie", "paires"], nombre: 12, sensParId: sens });
  assert.equal(serie.length, 12);
  for (const ex of serie) {
    if (ex.options) {
      assert.equal(ex.options.length, 4);
      assert.ok(ex.options.includes(ex.sens));
    }
    if (ex.type === "paires") assert.equal(ex.sens.length, 4);
  }
});

test("Série : seulement des paires si c'est le seul type", () => {
  const serie = construireSerie({ ids: Object.keys(sens), types: ["paires"], nombre: 3, sensParId: sens });
  assert.equal(serie.length, 3);
  assert.ok(serie.every((e) => e.type === "paires"));
});

test("Leçon : chaque signe nouveau est découvert avant les exercices", () => {
  const etapes = construireLecon({ ids: ["a", "b", "c", "d"], nouveaux: ["a", "b", "c", "d"], reste: ["e", "f"], sensParId: sens });
  assert.deepEqual(etapes.slice(0, 4).map((e) => e.type), Array(4).fill("decouverte"));
  assert.ok(etapes.length >= 12);
});

test("Note d'un sens selon les résultats", () => {
  assert.equal(noteDuSens(["ok", "ok"]), 3);
  assert.equal(noteDuSens(["ok", "hesite"]), 2);
  assert.equal(noteDuSens(["ok", "rate"]), 1);
  assert.equal(noteDuSens([]), null);
});

test("Contenu publié : unités, leçons et ressources cohérentes", () => {
  const c = JSON.parse(fs.readFileSync(new URL("../site/content/contenu.json", import.meta.url)));
  const videosEnLigne = JSON.parse(fs.readFileSync(new URL("../site/content/videos-en-ligne.json", import.meta.url)));
  const publiees = c.unites.filter((u) => u.publiee);
  assert.ok(publiees.length > 0);
  for (const u of publiees) {
    for (const l of u.lecons) {
      for (const s of l.sens || []) assert.ok(c.sens[s], `sens ${s} manquant (unité ${u.num})`);
      if (l.type === "grammaire") {
        assert.ok(u.grammaire, `fiche manquante pour l'unité ${u.num}`);
        const etapes = construireGrammaire(u.grammaire);
        assert.equal(etapes[0].type, "fiche");
        for (const e of u.grammaire.exercices) {
          if (e.type === "qcm") assert.ok(e.reponse >= 0 && e.reponse < e.options.length);
          if (e.type === "ordre") assert.ok(e.tokens.length >= 2);
        }
      }
    }
  }
  for (const s of Object.values(c.sens)) {
    assert.ok(s.ressources.length > 0);
    for (const r of s.ressources) {
      assert.ok(r.licence && r.licenceUrl && r.auteur && r.origine, `attribution incomplète pour ${s.mot}`);
      assert.ok(fs.existsSync(new URL("../site/" + r.video, import.meta.url)), `vidéo absente : ${r.video}`);
      assert.ok(fs.existsSync(new URL("../site/" + r.vignette, import.meta.url)), `vignette absente : ${r.vignette}`);
    }
  }
  for (const [mot, videos] of Object.entries(videosEnLigne)) {
    assert.ok(Object.values(c.sens).some((s) => s.mot.toLocaleLowerCase("fr") === mot.toLocaleLowerCase("fr")),
      `mot Elix absent du dictionnaire : ${mot}`);
    for (const r of videos) {
      assert.ok(r.distante && r.video.startsWith("https://elix-lsf.s3.rbx.io.cloud.ovh.net/"),
        `vidéo Elix en ligne incorrecte pour ${mot}`);
      assert.ok(r.auteur && r.origine, `attribution manquante pour la vidéo Elix de ${mot}`);
    }
  }
  for (const mot of ["de rien", "au revoir"]) {
    const s = Object.values(c.sens).find((x) => x.mot === mot);
    const videos = videosEnLigne[mot];
    assert.ok(s && videos?.some((r) => r.source === "Elix (Signes de sens)"), `vidéo Elix en ligne absente pour ${mot}`);
    for (const r of videos) {
      assert.ok(r.distante && r.video.startsWith("https://"), `vidéo en ligne incorrecte pour ${mot}`);
      assert.ok(r.auteur && r.origine, `attribution manquante pour la vidéo en ligne de ${mot}`);
    }
  }
});
