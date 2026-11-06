// Contenu publié et progression de l'apprenant.
import * as db from "./store.js";
import { nouvelleCarte, reviser, estDue, estExcluDesRevisions } from "./fsrs.js";

export const OBJECTIF_XP = 30;

export const etat = {
  contenu: null,
  sens: {},          // id -> sens
  unites: [],        // unités publiées
  toutesUnites: [],
  lecons: {},        // id -> { lecon, unite }
  chaine: [],        // ordre des leçons du parcours
  cartes: {},        // id -> carte FSRS
  faites: {},        // id leçon -> { id, date, score }
  reglages: {},
};

export async function charger() {
  const [r, rv] = await Promise.all([
    fetch("content/contenu.json", { cache: "no-cache" }),
    fetch("content/videos-en-ligne.json", { cache: "no-cache" }),
  ]);
  if (!r.ok) throw new Error("Contenu introuvable");
  if (!rv.ok) throw new Error("Ressources vidéo en ligne introuvables");
  const [c, videosEnLigne] = await Promise.all([r.json(), rv.json()]);
  for (const [mot, videos] of Object.entries(videosEnLigne)) {
    for (const sens of Object.values(c.sens)) {
      if (sens.mot.toLocaleLowerCase("fr") === mot.toLocaleLowerCase("fr")) sens.videosEnLigne = videos;
    }
  }
  etat.contenu = c;
  etat.sens = c.sens;
  etat.toutesUnites = c.unites;
  etat.unites = c.unites.filter((u) => u.publiee);
  etat.lecons = {};
  etat.chaine = [];
  for (const u of etat.unites) {
    for (const l of u.lecons || []) {
      etat.lecons[l.id] = { lecon: l, unite: u };
      if (!u.facultative) etat.chaine.push(l.id);
    }
  }
  for (const c of await db.lireTout("cartes")) etat.cartes[c.id] = c;
  for (const f of await db.lireTout("lecons")) etat.faites[f.id] = f;
  for (const r of await db.lireTout("reglages")) etat.reglages[r.id] = r.valeur;
}

export const reglage = (k, d = null) => (k in etat.reglages ? etat.reglages[k] : d);
export async function definir(k, v) {
  etat.reglages[k] = v;
  await db.definirReglage(k, v);
}

export function leconDebloquee(id) {
  const i = etat.chaine.indexOf(id);
  if (i < 0) return true; // leçon d'une unité facultative
  return etat.chaine.slice(0, i).every((p) => etat.faites[p]);
}

export function leconCourante() {
  return etat.chaine.find((id) => !etat.faites[id]) || null;
}

export function sensAppris() {
  return Object.values(etat.cartes).filter((c) => c.revisions > 0 && etat.sens[c.id]).map((c) => c.id);
}

export function sensDus(maintenant = Date.now()) {
  return Object.values(etat.cartes)
    .filter((c) => etat.sens[c.id] && estDue(c, maintenant) && !estExcluDesRevisions(etat.sens[c.id]))
    .map((c) => c.id);
}

export function sensRates() {
  return Object.values(etat.cartes).filter((c) => etat.sens[c.id] && c.revisions > 0 && (c.note === 1 || c.oublis > 0)).map((c) => c.id);
}

export async function appliquerNotes(notes, maintenant = Date.now()) {
  const maj = [];
  for (const [id, note] of Object.entries(notes)) {
    if (!note) continue;
    const c = reviser(etat.cartes[id] || nouvelleCarte(id), note, maintenant);
    etat.cartes[id] = c;
    maj.push(c);
  }
  if (maj.length) await db.ecrireTout("cartes", maj);
}

export async function marquerLecon(id, score) {
  const f = { id, date: Date.now(), score };
  etat.faites[id] = f;
  await db.ecrire("lecons", f);
}

export const jourCourant = (d = new Date()) => {
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};

export function xpDuJour() {
  const j = reglage("jour");
  return j && j.date === jourCourant() ? j.xp : 0;
}

export function serie() {
  const s = reglage("serie", { jours: 0, dernier: null });
  if (!s.dernier) return 0;
  const hier = jourCourant(new Date(Date.now() - 86400000));
  return s.dernier === jourCourant() || s.dernier === hier ? s.jours : 0;
}

export async function gagnerXp(n) {
  await definir("xp", reglage("xp", 0) + n);
  const auj = jourCourant();
  const j = reglage("jour");
  await definir("jour", { date: auj, xp: (j && j.date === auj ? j.xp : 0) + n });
  const s = reglage("serie", { jours: 0, dernier: null });
  if (s.dernier !== auj) {
    const hier = jourCourant(new Date(Date.now() - 86400000));
    await definir("serie", { jours: s.dernier === hier ? s.jours + 1 : 1, dernier: auj });
  }
}

export function uniteDactylo() {
  return etat.unites.find((u) => u.dactylologie) || null;
}
