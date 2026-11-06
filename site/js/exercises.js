// Génération des exercices. Fonctions pures, testées dans tests/.

export function normaliser(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, "'")
    .replace(/[?!.,;:()·\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Réponses acceptées pour un sens : le mot affiché, chaque partie avant/après
// une virgule, et les alias.
export function reponsesAcceptees(sens) {
  const r = new Set([normaliser(sens.mot)]);
  for (const p of (sens.mot || "").split(",")) r.add(normaliser(p));
  for (const a of sens.alias || []) r.add(normaliser(a));
  r.delete("");
  return r;
}

export function estBonneSaisie(sens, saisie) {
  return reponsesAcceptees(sens).has(normaliser(saisie));
}

export function melanger(liste, alea = Math.random) {
  const t = [...liste];
  for (let i = t.length - 1; i > 0; i--) {
    const j = Math.floor(alea() * (i + 1));
    [t[i], t[j]] = [t[j], t[i]];
  }
  return t;
}

// Choisit n distracteurs : d'abord dans le groupe proche (même unité),
// puis dans le reste. Jamais deux sens qui s'affichent pareil.
export function distracteurs(cible, proches, reste, n, sensParId, alea = Math.random) {
  const vus = new Set([normaliser(sensParId[cible].mot)]);
  const out = [];
  for (const groupe of [melanger(proches, alea), melanger(reste, alea)]) {
    for (const id of groupe) {
      if (out.length >= n) return out;
      if (id === cible || !sensParId[id]) continue;
      const k = normaliser(sensParId[id].mot);
      if (vus.has(k)) continue;
      vus.add(k);
      out.push(id);
    }
  }
  return out;
}

export const TYPES = {
  videoMot: "Vidéo → mot",
  motVideo: "Mot → vidéo",
  saisie: "Saisie",
  vraiFaux: "Vrai ou faux",
  paires: "Paires",
  signer: "Signer",
};

function exercicePour(type, id, proches, reste, sensParId, alea) {
  if (type === "videoMot" || type === "motVideo") {
    const d = distracteurs(id, proches, reste, 3, sensParId, alea);
    if (d.length < 3) return null;
    return { type, sens: id, options: melanger([id, ...d], alea) };
  }
  if (type === "vraiFaux") {
    const correct = alea() < 0.5;
    if (correct) return { type, sens: id, montre: id, correct: true };
    const d = distracteurs(id, proches, reste, 1, sensParId, alea);
    if (!d.length) return null;
    return { type, sens: id, montre: d[0], correct: false };
  }
  return { type, sens: id };
}

// Construit une suite d'exercices sur `ids`.
// - proches : sens du même groupe (distracteurs prioritaires)
// - reste : autres sens connus
// - types : types autorisés
// - nombre : nombre d'exercices visé
export function construireSerie({ ids, proches = ids, reste = [], types, nombre, sensParId, alea = Math.random }) {
  const simples = types.filter((t) => t !== "paires");
  const serie = [];
  if (!ids.length || !types.length) return serie;
  let tour = melanger(ids, alea);
  let i = 0;
  let essais = 0;
  while (serie.length < nombre && essais < nombre * 6) {
    essais++;
    if (types.includes("paires") && ids.length >= 4 && (!simples.length || serie.length % 5 === 4)) {
      serie.push({ type: "paires", sens: melanger(ids, alea).slice(0, 4) });
      continue;
    }
    if (!simples.length) break;
    if (i >= tour.length) { tour = melanger(ids, alea); i = 0; }
    const id = tour[i++];
    const type = simples[Math.floor(alea() * simples.length)];
    const ex = exercicePour(type, id, proches, reste, sensParId, alea);
    if (ex) serie.push(ex);
  }
  return serie;
}

// Leçon de vocabulaire : découverte de chaque signe nouveau, puis exercices.
export function construireLecon({ ids, nouveaux, reste, sensParId, alea = Math.random }) {
  const etapes = nouveaux.map((id) => ({ type: "decouverte", sens: id }));
  const types = ["videoMot", "motVideo", "vraiFaux", "saisie", "paires"];
  const nombre = Math.min(14, Math.max(8, ids.length * 2));
  return etapes.concat(construireSerie({ ids, proches: ids, reste, types, nombre, sensParId, alea }));
}

// Leçon de grammaire : la fiche, puis ses exercices.
export function construireGrammaire(fiche) {
  return [{ type: "fiche" }].concat((fiche.exercices || []).map((e, i) => ({ ...e, type: e.type === "ordre" ? "ordre" : "qcmGrammaire", index: i })));
}

// Note FSRS d'un sens à partir des résultats d'une session.
export function noteDuSens(resultats) {
  if (!resultats.length) return null;
  if (resultats.some((r) => r === "rate")) return 1;
  if (resultats.some((r) => r === "hesite")) return 2;
  return 3;
}
