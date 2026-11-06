// Révision espacée : implémentation de l'algorithme FSRS-5 avec ses
// paramètres par défaut. Référence : https://github.com/open-spaced-repetition
// Les durées sont en jours ; les dates en millisecondes.

export const Note = { Raté: 1, Difficile: 2, Bien: 3, Facile: 4 };

const W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046,
  1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898,
  0.51655, 0.6621];
const DECAY = -0.5;
const FACTOR = 19 / 81; // R(S, S) = 0,9
const JOUR = 86400000;
const RETENTION = 0.9;
const MOTS_NON_RECOMMANDES = new Set(["bonjour", "bonsoir", "merci"]);

const borne = (x, min, max) => Math.min(max, Math.max(min, x));

export function retenue(jours, stabilite) {
  return Math.pow(1 + FACTOR * jours / stabilite, DECAY);
}

function difficulteInitiale(note) {
  return borne(W[4] - Math.exp(W[5] * (note - 1)) + 1, 1, 10);
}

function prochaineDifficulte(d, note) {
  const delta = -W[6] * (note - 3);
  const d1 = d + delta * (10 - d) / 9;
  return borne(W[7] * difficulteInitiale(4) + (1 - W[7]) * d1, 1, 10);
}

function stabiliteApresSucces(d, s, r, note) {
  const penalite = note === Note.Difficile ? W[15] : 1;
  const bonus = note === Note.Facile ? W[16] : 1;
  return s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) *
    (Math.exp(W[10] * (1 - r)) - 1) * penalite * bonus);
}

function stabiliteApresOubli(d, s, r) {
  const sf = W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r));
  return Math.min(s, sf);
}

function stabiliteCourtTerme(s, note) {
  return s * Math.exp(W[17] * (note - 3 + W[18]));
}

export function intervalle(stabilite) {
  return stabilite / FACTOR * (Math.pow(RETENTION, 1 / DECAY) - 1);
}

export function nouvelleCarte(id) {
  return { id, stabilite: 0, difficulte: 0, revisions: 0, oublis: 0, derniere: 0, echeance: 0, note: 0 };
}

// Renvoie une nouvelle carte, révisée avec la note donnée à l'instant `maintenant`.
export function reviser(carte, note, maintenant = Date.now()) {
  const c = { ...carte };
  if (c.revisions === 0) {
    c.stabilite = W[note - 1];
    c.difficulte = difficulteInitiale(note);
  } else {
    const jours = Math.max(0, (maintenant - c.derniere) / JOUR);
    if (jours < 1) {
      c.stabilite = stabiliteCourtTerme(c.stabilite, note);
    } else {
      const r = retenue(jours, c.stabilite);
      c.stabilite = note === Note.Raté
        ? stabiliteApresOubli(c.difficulte, c.stabilite, r)
        : stabiliteApresSucces(c.difficulte, c.stabilite, r, note);
    }
    c.difficulte = prochaineDifficulte(c.difficulte, note);
  }
  c.stabilite = Math.max(0.1, c.stabilite);
  if (note === Note.Raté) c.oublis += 1;
  c.revisions += 1;
  c.derniere = maintenant;
  c.note = note;
  // Un signe raté revient dans 10 minutes ; sinon intervalle FSRS, au moins 1 jour.
  c.echeance = note === Note.Raté
    ? maintenant + 10 * 60000
    : maintenant + Math.max(1, Math.round(intervalle(c.stabilite))) * JOUR;
  return c;
}

export function estDue(carte, maintenant = Date.now()) {
  return carte.revisions > 0 && carte.echeance <= maintenant;
}

export function estExcluDesRevisions(sens) {
  return MOTS_NON_RECOMMANDES.has(sens.mot.toLocaleLowerCase("fr"));
}

export function selectionnerRevisions(cartes, sensParId, maintenant = Date.now(), limite = 5) {
  return cartes
    .filter((carte) => {
      const sens = sensParId[carte.id];
      return sens && estDue(carte, maintenant) && !estExcluDesRevisions(sens);
    })
    .sort((a, b) => a.echeance - b.echeance)
    .slice(0, Math.max(0, limite))
    .map((carte) => carte.id);
}
