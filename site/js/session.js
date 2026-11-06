// Déroulé d'une session : leçon, entraînement ou défi chrono.
import { h, icone, aller } from "./ui.js";
import { rendreEtape } from "./exos.js";
import { noteDuSens } from "./exercises.js";
import { appliquerNotes, gagnerXp, marquerLecon, etat } from "./etat.js";
import { retourPositif } from "./feedback.js";

// options : { etapes, suivante?, duree?, lecon?, retour, titreFin, ctx, videoFixe?, record? }
export function session(racine, options) {
  const etapes = [...(options.etapes || [])];
  const resultats = {}; // id du sens -> ["ok" | "rate" | "hesite"]
  let index = 0, bonnes = 0, notees = 0, fini = false, quitter = null;
  let finChrono = options.duree ? Date.now() + options.duree * 1000 : null;
  let minuteur = null;

  const barre = h("div", { class: "progression" }, h("div", { class: "progression-remplie" }));
  const compteur = h("span", { class: "compteur" });
  const fermer = h("button", { type: "button", class: "btn-icone", "aria-label": "Quitter la session",
    onclick: () => { nettoyer(); aller(options.retour || "/"); } }, icone("croix"));
  const corps = h("main", { class: "corps-session" });
  const pied = h("footer", { class: "pied-session" });
  racine.replaceChildren(h("div", { class: "ecran session" }, h("header", { class: "entete-session" }, fermer, barre, compteur), corps, pied));

  function nettoyer() {
    if (minuteur) clearInterval(minuteur);
    if (quitter) quitter();
    for (const v of racine.querySelectorAll("video")) { v.pause(); v.removeAttribute("src"); }
  }
  window.addEventListener("hashchange", nettoyer, { once: true });

  function majProgression() {
    const total = finChrono ? options.duree : etapes.length;
    const fait = finChrono ? options.duree - Math.max(0, Math.ceil((finChrono - Date.now()) / 1000)) : index;
    barre.firstChild.style.width = `${Math.min(100, (fait / total) * 100)}%`;
    compteur.textContent = finChrono ? `${Math.max(0, Math.ceil((finChrono - Date.now()) / 1000))} s` : `${Math.min(index + 1, total)} / ${total}`;
  }

  if (finChrono) {
    minuteur = setInterval(() => {
      majProgression();
      if (Date.now() >= finChrono) { clearInterval(minuteur); terminer(); }
    }, 250);
  }

  function noter(r) {
    for (const [id, v] of Object.entries(r.sens || {})) (resultats[id] ||= []).push(v);
    if (r.ok !== null && r.ok !== undefined) { notees++; if (r.ok) bonnes++; }
  }

  function afficher() {
    if (fini) return;
    if (index >= etapes.length) {
      if (options.suivante && (!finChrono || Date.now() < finChrono)) etapes.push(options.suivante());
      else return terminer();
    }
    majProgression();
    const etape = etapes[index];
    let verrou = false, pretA = false, etiquette = "Vérifier", masque = false;
    quitter = null;
    const bouton = h("button", { type: "button", class: "btn principal", disabled: true, onclick: () => valider() }, "Vérifier");
    const api = {
      pret(ok, texte) { pretA = ok; if (texte) etiquette = texte; bouton.textContent = etiquette; bouton.disabled = !ok; },
      verrouille: () => verrou,
      valider: () => valider(),
      masquerVerifier() { masque = true; },
      surQuitter(f) { quitter = f; },
      terminer(r) { verrou = true; noter(r); retour(r); },
    };
    const rendu = rendreEtape(etape, api, {
      ...(options.ctx || {}),
      videoFixe: options.videoFixe ?? options.ctx?.videoFixe ?? false,
    });
    corps.replaceChildren(rendu.el);
    corps.scrollTop = 0;
    pied.className = "pied-session";
    pied.replaceChildren(masque ? h("div") : bouton);

    function valider() {
      if (verrou || !pretA) return;
      verrou = true;
      const r = rendu.verifier();
      noter(r);
      if (r.ok === null) { index++; afficher(); return; }
      retour(r);
    }
  }

  function retour(r) {
    if (r.ok) {
      retourPositif({
        son: etat.reglages.sonBonneReponse !== false,
        vibration: etat.reglages.vibrationBonneReponse !== false,
      });
      corps.querySelectorAll(".bon").forEach((el) => el.classList.add("effet-reussite"));
    }
    if (finChrono) { index++; setTimeout(afficher, r.ok ? 250 : 900); pied.className = "pied-session " + (r.ok ? "succes" : "echec"); return; }
    pied.className = "pied-session " + (r.ok ? "succes" : "echec");
    const suite = h("button", { type: "button", class: "btn principal", onclick: () => { index++; afficher(); } }, "Continuer");
    pied.replaceChildren(h("div", { class: "retour" },
      h("p", { class: "verdict" }, icone(r.ok ? "check" : "croix", 24), r.ok ? " Bonne réponse" : " Pas tout à fait"),
      !r.ok && r.correction ? h("p", {}, "Réponse : ", h("strong", {}, r.correction)) : null,
      r.explication ? h("p", { class: "explication" }, r.explication) : null,
      Object.keys(r.sens || {}).length === 1 && etat.sens[Object.keys(r.sens)[0]]
        ? h("a", { class: "lien", href: "#/mot/" + Object.keys(r.sens)[0] }, "Voir toutes les ressources du mot") : null,
      suite));
    suite.focus({ preventScroll: true });
  }

  async function terminer() {
    if (fini) return;
    fini = true;
    nettoyer();
    const notes = {};
    for (const [id, rs] of Object.entries(resultats)) notes[id] = noteDuSens(rs);
    await appliquerNotes(notes);
    const xp = bonnes * 2 + (options.lecon ? 10 : 0);
    if (xp) await gagnerXp(xp);
    if (options.lecon) await marquerLecon(options.lecon, notees ? Math.round((bonnes / notees) * 100) : 100);
    let record = null;
    if (options.record) record = await options.record(bonnes);
    const taux = notees ? Math.round((bonnes / notees) * 100) : null;
    corps.replaceChildren(h("div", { class: "etape fin" },
      h("div", { class: "medaille" }, icone("check", 40, { epaisseur: 3 })),
      h("h1", { class: "mot-titre" }, options.titreFin || "Session terminée"),
      h("div", { class: "stats-fin" },
        h("div", {}, h("strong", {}, `+${xp}`), h("span", {}, "XP")),
        taux !== null ? h("div", {}, h("strong", {}, `${taux} %`), h("span", {}, "de réussite")) : null,
        finChrono ? h("div", {}, h("strong", {}, String(bonnes)), h("span", {}, "bonnes réponses")) : null),
      record ? h("p", { class: "info" }, record) : null));
    pied.className = "pied-session";
    pied.replaceChildren(h("button", { type: "button", class: "btn principal", onclick: () => aller(options.retour || "/") }, "Continuer"));
  }

  afficher();
}
