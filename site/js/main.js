import { h, icone, aller, barreOnglets, lienExterne, toast, estIOS, estInstallee } from "./ui.js";
import {
  etat, charger, reglage, definir, leconDebloquee, leconCourante, sensAppris, sensDus, sensRates,
  xpDuJour, serie, OBJECTIF_XP, uniteDactylo, marquerLecon,
} from "./etat.js";
import { construireLecon, construireGrammaire, construireSerie, TYPES, melanger, normaliser } from "./exercises.js";
import { session } from "./session.js";
import { lecteur } from "./player.js";
import * as db from "./store.js";

const app = document.getElementById("app");

// ---------------------------------------------------------------- Routeur
const routes = [
  [/^\/$/, ecranParcours],
  [/^\/bienvenue$/, ecranBienvenue],
  [/^\/installer$/, ecranInstaller],
  [/^\/lecon\/([^/]+)$/, ecranLecon],
  [/^\/entrainement$/, ecranEntrainement],
  [/^\/session\/([a-z]+)$/, ecranSession],
  [/^\/dico$/, ecranDico],
  [/^\/mot\/([^/]+)$/, ecranMot],
  [/^\/profil$/, ecranProfil],
  [/^\/credits$/, ecranCredits],
  [/^\/unite\/(\d+)$/, ecranUnite],
];

function router() {
  const chemin = decodeURIComponent(location.hash.slice(1) || "/");
  for (const [re, f] of routes) {
    const m = chemin.match(re);
    if (m) { window.scrollTo(0, 0); return f(...m.slice(1)); }
  }
  aller("/");
}

// ---------------------------------------------------------------- Parcours
function entete() {
  const xp = xpDuJour();
  return h("header", { class: "entete" },
    h("div", { class: "stat" }, icone("flamme", 22), h("span", {}, `${serie()} jour${serie() > 1 ? "s" : ""}`)),
    h("div", { class: "stat" }, icone("eclair", 20), h("span", {}, `${reglage("xp", 0)} XP`)),
    h("div", { class: "objectif" }, h("span", {}, "Objectif du jour"),
      h("div", { class: "jauge", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": OBJECTIF_XP, "aria-valuenow": Math.min(xp, OBJECTIF_XP) },
        h("div", { style: { width: `${Math.min(100, (xp / OBJECTIF_XP) * 100)}%` } }))));
}

function ecranParcours() {
  if (!reglage("bienvenue")) return aller("/bienvenue");
  const courante = leconCourante();
  const blocs = [];
  if (estIOS() && !estInstallee() && !reglage("installCache")) {
    blocs.push(h("a", { href: "#/installer", class: "bandeau" }, icone("partager", 20),
      h("span", {}, h("strong", {}, "Installer l'app"), " sur l'écran d'accueil")));
  }
  const dac = uniteDactylo();
  if (dac && reglage("dactylo") === "passer") {
    blocs.push(h("a", { href: "#/unite/1", class: "bandeau orange" }, icone("main", 20),
      h("span", { style: { flex: 1 } }, h("strong", {}, "Unité 1 · Dactylologie"), " passée"), h("span", { class: "fort" }, "Reprendre")));
  }
  for (const niv of etat.contenu.niveaux) {
    const unites = etat.unites.filter((u) => u.niveau === niv.id && !(u.dactylologie && reglage("dactylo") === "passer"));
    if (!unites.length) continue;
    blocs.push(h("h2", { class: "titre-niveau" }, `Niveau ${niv.id} · ${niv.titre}`, h("span", { class: "cecrl" }, niv.cecrl)));
    for (const u of unites) blocs.push(carteUnite(u, courante));
  }
  const nonPubliees = etat.toutesUnites.filter((u) => !u.publiee).length;
  if (nonPubliees) {
    blocs.push(h("p", { class: "info centre" }, `${nonPubliees} unités du programme attendent des vidéos sous licence libre. `,
      h("a", { href: "#/credits" }, "En savoir plus")));
  }
  app.replaceChildren(h("div", { class: "ecran" }, entete(), h("main", { class: "contenu parcours" }, blocs), barreOnglets("parcours")));
  const cible = document.querySelector(".noeud.courant");
  if (cible) cible.scrollIntoView({ block: "center" });
}

function carteUnite(u, courante) {
  const lecons = u.lecons || [];
  const faites = lecons.filter((l) => etat.faites[l.id]).length;
  const decalages = [-56, 24, -12, 52, -20, 36, -44];
  const noeuds = lecons.map((l, i) => {
    const fait = !!etat.faites[l.id];
    const ouvert = leconDebloquee(l.id);
    const estCourant = l.id === courante;
    const ic = fait ? icone("check", 30, { epaisseur: 3, label: "Leçon terminée" })
      : !ouvert ? icone("cadenas", 24, { label: "Leçon verrouillée" })
        : l.type === "grammaire" ? h("span", { class: "lettre-noeud" }, "G")
          : l.type === "revision" ? icone("bouclier", 26) : icone("lecture", 30);
    const contenu = [
      estCourant ? h("span", { class: "bulle" }, l.titre) : null,
      ouvert
        ? h("a", { href: "#/lecon/" + l.id, class: "noeud" + (fait ? " fait" : "") + (estCourant ? " courant" : ""), "aria-label": `${l.titre}${fait ? ", terminée" : ""}` }, ic)
        : h("span", { class: "noeud verrouille" }, ic),
      h("span", { class: "nom-noeud" }, l.type === "vocabulaire" ? exemplesLecon(l) : l.titre),
    ];
    return h("div", { class: "pas", style: { transform: `translateX(${decalages[i % decalages.length]}px)` } }, contenu);
  });
  return h("section", { class: "unite" },
    h("a", { href: "#/unite/" + u.num, class: "banniere-unite" + (u.dactylologie ? " orange" : "") },
      h("div", {}, h("span", { class: "num-unite" }, `Unité ${u.num}${u.facultative ? " · facultative" : ""}`),
        h("h3", {}, u.titre),
        h("span", { class: "sous" }, u.grammaire ? `Grammaire : ${u.grammaire.titre}` : `${(u.sens || []).length} signes`)),
      h("span", { class: "avancement" }, `${faites}/${lecons.length}`)),
    h("div", { class: "chemin" }, noeuds));
}

function exemplesLecon(l) {
  return l.sens.slice(0, 2).map((id) => etat.sens[id].mot).join(", ") + (l.sens.length > 2 ? "…" : "");
}

function ecranUnite(num) {
  const u = etat.unites.find((x) => String(x.num) === num);
  if (!u) return aller("/");
  const signes = (u.sens || []).map((id) => etat.sens[id]);
  app.replaceChildren(h("div", { class: "ecran" },
    h("header", { class: "entete-simple" }, h("a", { href: "#/", class: "btn-icone", "aria-label": "Retour" }, icone("retour")),
      h("div", {}, h("h1", {}, u.titre), h("p", { class: "sous" }, `Unité ${u.num}`))),
    h("main", { class: "contenu" },
      u.grammaire ? h("section", { class: "carte" }, h("h2", {}, "Grammaire : ", u.grammaire.titre),
        u.grammaire.points.map((p) => h("p", {}, p))) : null,
      signes.length ? h("section", { class: "carte" }, h("h2", {}, `${signes.length} signes`),
        h("ul", { class: "liste-mots" }, signes.map((s) => h("li", {}, h("a", { href: "#/mot/" + s.id }, s.mot,
          etat.cartes[s.id]?.revisions ? h("span", { class: "pastille" }, "appris") : null))))) : null,
      signes.length ? h("button", { type: "button", class: "btn secondaire large", onclick: () => telechargerUnite(u) },
        icone("telecharger", 20), " Garder cette unité hors ligne") : null),
    barreOnglets("parcours")));
}

async function telechargerUnite(u) {
  if (!("caches" in window)) return toast("Ce navigateur ne permet pas le hors-ligne.");
  const urls = [];
  for (const id of u.sens || []) for (const r of etat.sens[id].ressources) urls.push(r.video, r.vignette);
  const cache = await caches.open("lsf-videos");
  let n = 0;
  for (const url of urls) {
    try { if (!(await cache.match(url))) await cache.add(url); n++; } catch { /* on continue */ }
  }
  await db.demanderPersistance();
  toast(`${n} fichiers gardés hors ligne`);
}

// ---------------------------------------------------------------- Bienvenue
function ecranBienvenue() {
  const dac = uniteDactylo();
  const choix = (titre, texte, action, fort) => h("button", { type: "button", class: "carte-choix" + (fort ? " fort" : ""), onclick: action },
    h("span", { class: "titre-choix" }, titre), h("span", { class: "texte-choix" }, texte));
  const finir = async (val, dest) => {
    if (val) await definir("dactylo", val);
    await definir("bienvenue", true);
    db.demanderPersistance();
    aller(dest);
  };
  const corps = dac
    ? [
      h("h1", {}, "Par quoi commencer ?"),
      h("p", { class: "intro" }, "La première unité apprend l'alphabet manuel, la dactylologie. Il sert à épeler les prénoms et les mots qui n'ont pas de signe."),
      choix("Commencer par l'alphabet", "Unité 1", () => finir("faire", "/lecon/u1-l1"), true),
      choix("Je connais déjà l'alphabet", "Petit test : 10 mots épelés, 8 bonnes réponses pour valider l'unité", () => finir("test", "/session/test")),
      choix("Passer pour l'instant", "Aller aux premiers signes. L'alphabet reste accessible à tout moment.", () => finir("passer", "/")),
    ]
    : [
      h("h1", {}, "Bienvenue"),
      h("p", { class: "intro" }, "Apprends la langue des signes française en quelques minutes par jour, à partir de vidéos sous licence libre."),
      h("p", { class: "intro" }, "Chaque signe renvoie aussi vers sa page sur le Dico Elix, pour voir d'autres signeurs et la définition en LSF."),
      choix("Commencer", "Unité 2 · Se saluer", () => finir(null, "/"), true),
    ];
  app.replaceChildren(h("div", { class: "ecran bienvenue" }, h("div", { class: "logo" }, icone("main", 40, { epaisseur: 1.8 })), corps,
    h("p", { class: "info centre" }, "Ta progression reste sur ton appareil.")));
}

function ecranInstaller() {
  app.replaceChildren(h("div", { class: "ecran" },
    h("header", { class: "entete-simple" }, h("a", { href: "#/", class: "btn-icone", "aria-label": "Retour" }, icone("retour")), h("h1", {}, "Installer l'app")),
    h("main", { class: "contenu" },
      h("ol", { class: "etapes-install" },
        h("li", {}, "Ouvre ce site dans ", h("strong", {}, "Safari"), "."),
        h("li", {}, "Touche le bouton ", h("strong", {}, "Partager"), " ", icone("partager", 18), " en bas de l'écran."),
        h("li", {}, "Choisis ", h("strong", {}, "« Sur l'écran d'accueil »"), ", puis « Ajouter »."),
        h("li", {}, "Ouvre l'app depuis son icône : elle fonctionne aussi hors ligne.")),
      h("p", { class: "info" }, "Sur Android, Chrome propose « Installer l'application » dans son menu."),
      h("button", { type: "button", class: "btn secondaire large", onclick: async () => { await definir("installCache", true); aller("/"); } }, "Ne plus afficher le rappel")),
    barreOnglets("parcours")));
}

// ---------------------------------------------------------------- Leçons
function ecranLecon(id) {
  const ref = etat.lecons[id];
  if (!ref || !leconDebloquee(id)) return aller("/");
  const { lecon, unite } = ref;
  const sensParId = etat.sens;
  const connus = sensAppris();
  if (lecon.type === "epeler") {
    return session(app, { etapes: etapesEpeler(8), lecon: id, retour: "/", titreFin: "Bravo !", ctx: { lettres: unite.lettres } });
  }
  if (lecon.type === "grammaire") {
    return session(app, { etapes: construireGrammaire(unite.grammaire), lecon: id, retour: "/",
      titreFin: "Leçon de grammaire terminée", ctx: { fiche: unite.grammaire, statut: etat.contenu.statutGrammaire } });
  }
  if (lecon.type === "revision") {
    const etapes = construireSerie({ ids: lecon.sens, proches: lecon.sens, reste: connus,
      types: ["videoMot", "motVideo", "vraiFaux", "saisie", "paires"], nombre: 15, sensParId });
    return session(app, { etapes, lecon: id, retour: "/", titreFin: "Unité révisée" });
  }
  const nouveaux = lecon.sens.filter((s) => !etat.cartes[s]?.revisions);
  const etapes = construireLecon({ ids: lecon.sens, nouveaux, reste: [...unite.sens, ...connus], sensParId });
  session(app, { etapes, lecon: id, retour: "/", titreFin: "Leçon terminée" });
}

const MOTS_EPELES = ["LEA", "PAUL", "EMMA", "HUGO", "CHLOE", "LUCAS", "INES", "JULES", "SARAH", "TOM", "NOAH", "ZOE",
  "LYON", "PARIS", "NICE", "LILLE", "METZ", "BREST", "CAEN", "DIJON", "SOURD", "CAFE", "TAXI", "WIFI", "KIWI", "JAZZ", "QUIZ", "YOGA", "VELO", "BUS"];

function etapesEpeler(n) {
  return melanger(MOTS_EPELES).slice(0, n).map((mot) => ({ type: "lireMot", mot }));
}

// ---------------------------------------------------------------- Entraînement
const prefs = { contenu: "tout", duree: 10, types: ["videoMot", "motVideo", "saisie", "vraiFaux", "paires"], unite: null };

function ecranEntrainement() {
  const appris = sensAppris();
  const dus = sensDus();
  const pastilles = (options, valeur, maj, multi) => h("div", { class: "pastilles" }, options.map(([v, t]) => {
    const actif = multi ? valeur.includes(v) : valeur === v;
    return h("button", { type: "button", class: "pastille-choix" + (actif ? " actif" : ""), "aria-pressed": String(actif), onclick: () => { maj(v); ecranEntrainement(); } }, t);
  }));
  const unitesApprises = etat.unites.filter((u) => (u.sens || []).some((s) => etat.cartes[s]?.revisions));
  const contenu = [["tout", "Tout"], ["unite", "Une unité"], ["erreurs", "Mes erreurs"]];
  const blocs = [];
  if (!appris.length) {
    blocs.push(h("section", { class: "carte" }, h("h2", {}, "Rien à réviser pour l'instant"),
      h("p", {}, "Termine une première leçon du parcours : les signes appris apparaîtront ici."),
      h("a", { href: "#/", class: "btn principal" }, "Aller au parcours")));
  } else {
    blocs.push(h("section", { class: "carte sombre" },
      h("div", {}, h("h2", {}, "Révision du jour"), h("p", {}, dus.length ? `${dus.length} signe${dus.length > 1 ? "s" : ""} à revoir` : "Rien à revoir aujourd'hui")),
      dus.length ? h("a", { href: "#/session/revision", class: "btn clair" }, "Réviser") : null));
    blocs.push(h("section", { class: "carte" },
      h("h2", {}, icone("video", 22), " Vocabulaire appris"),
      h("p", { class: "etiquette" }, "Contenu"),
      pastilles(contenu, prefs.contenu, (v) => { prefs.contenu = v; }),
      prefs.contenu === "unite" ? h("select", { class: "champ", "aria-label": "Unité", onchange: (e) => { prefs.unite = e.target.value; } },
        unitesApprises.map((u) => h("option", { value: u.num, selected: String(prefs.unite) === String(u.num) }, `${u.num}. ${u.titre}`))) : null,
      h("p", { class: "etiquette" }, "Durée"),
      pastilles([[10, "10 questions"], [20, "20 questions"], [120, "2 min chrono"]], prefs.duree, (v) => { prefs.duree = v; }),
      h("p", { class: "etiquette" }, `Types de questions · ${prefs.types.length} sur ${Object.keys(TYPES).length}`),
      pastilles(Object.entries(TYPES), prefs.types, (v) => {
        prefs.types = prefs.types.includes(v) ? prefs.types.filter((x) => x !== v) : [...prefs.types, v];
        if (!prefs.types.length) prefs.types = ["videoMot"];
      }, true),
      h("a", { href: "#/session/vocabulaire", class: "btn principal large" }, "Lancer la session")));
  }
  const dac = uniteDactylo();
  blocs.push(dac
    ? h("a", { href: "#/session/epeler", class: "carte lien-carte" }, icone("main", 24), h("div", {}, h("h2", {}, "Dactylologie"), h("p", {}, "Lire des mots épelés, vitesse réglable")))
    : h("section", { class: "carte grise" }, h("h2", {}, icone("main", 22), " Dactylologie"),
      h("p", {}, "Aucune vidéo de l'alphabet sous licence libre n'a encore été trouvée. Le module s'ouvrira dès que le pipeline en trouvera.")));
  if (appris.length >= 4) {
    blocs.push(h("div", { class: "deux" },
      h("a", { href: "#/session/chrono", class: "carte lien-carte" }, h("div", {}, h("h2", {}, "Défi chrono"), h("p", {}, `Record : ${reglage("record", 0)} en 60 s`))),
      h("a", { href: "#/session/cartes", class: "carte lien-carte" }, h("div", {}, h("h2", {}, "Cartes"), h("p", {}, "Réviser sans score")))));
  }
  app.replaceChildren(h("div", { class: "ecran" },
    h("header", { class: "entete-simple" }, h("div", {}, h("h1", {}, "Entraînement"), h("p", { class: "sous" }, `${appris.length} signes appris`))),
    h("main", { class: "contenu" }, blocs), barreOnglets("entrainement")));
}

function ecranSession(mode) {
  const appris = sensAppris();
  const sensParId = etat.sens;
  const dac = uniteDactylo();
  if (mode === "test" && dac) {
    return session(app, { etapes: etapesEpeler(10), retour: "/", titreFin: "Test terminé", ctx: { lettres: dac.lettres },
      record: async (n) => {
        if (n >= 8) {
          for (const l of dac.lecons) await marquerLecon(l.id, 100);
          await definir("dactylo", "faire");
          return `${n} sur 10 : l'unité 1 est validée.`;
        }
        await definir("dactylo", "faire");
        return `${n} sur 10 : l'unité 1 reste dans ton parcours pour t'entraîner.`;
      } });
  }
  if (mode === "epeler" && dac) {
    return session(app, { etapes: etapesEpeler(10), retour: "/entrainement", titreFin: "Session terminée", ctx: { lettres: dac.lettres } });
  }
  if (!appris.length) return aller("/entrainement");
  if (mode === "revision") {
    const dus = sensDus();
    if (!dus.length) return aller("/entrainement");
    const etapes = construireSerie({ ids: dus, proches: dus, reste: appris, types: ["videoMot", "motVideo", "vraiFaux", "saisie"], nombre: Math.min(30, dus.length * 2), sensParId });
    return session(app, { etapes, retour: "/entrainement", titreFin: "Révision terminée" });
  }
  if (mode === "vocabulaire") {
    let ids = appris;
    if (prefs.contenu === "erreurs") ids = sensRates();
    if (prefs.contenu === "unite") {
      const u = etat.unites.find((x) => String(x.num) === String(prefs.unite)) || etat.unites.find((x) => (x.sens || []).some((s) => appris.includes(s)));
      ids = (u?.sens || []).filter((s) => appris.includes(s));
    }
    if (!ids.length) { toast("Aucun signe ne correspond à ce choix."); return aller("/entrainement"); }
    if (prefs.duree === 120) {
      return session(app, { duree: 120, retour: "/entrainement", titreFin: "Temps écoulé",
        suivante: () => construireSerie({ ids, reste: appris, types: prefs.types.filter((t) => t !== "paires" && t !== "signer").length ? prefs.types.filter((t) => t !== "paires" && t !== "signer") : ["videoMot"], nombre: 1, sensParId })[0] });
    }
    const etapes = construireSerie({ ids, reste: appris, types: prefs.types, nombre: prefs.duree, sensParId });
    return session(app, { etapes, retour: "/entrainement", titreFin: "Session terminée" });
  }
  if (mode === "chrono") {
    return session(app, { duree: 60, retour: "/entrainement", titreFin: "Défi terminé",
      suivante: () => construireSerie({ ids: appris, reste: appris, types: ["videoMot"], nombre: 1, sensParId })[0],
      record: async (n) => {
        const r = reglage("record", 0);
        if (n > r) { await definir("record", n); return `Nouveau record : ${n} bonnes réponses !`; }
        return `Record actuel : ${r}`;
      } });
  }
  if (mode === "cartes") return ecranCartes(melanger(appris));
  aller("/entrainement");
}

function ecranCartes(ids, i = 0, retournee = false) {
  const s = etat.sens[ids[i]];
  app.replaceChildren(h("div", { class: "ecran session" },
    h("header", { class: "entete-session" }, h("a", { href: "#/entrainement", class: "btn-icone", "aria-label": "Quitter" }, icone("croix")),
      h("div", { class: "progression" }, h("div", { class: "progression-remplie", style: { width: `${((i + 1) / ids.length) * 100}%` } })),
      h("span", { class: "compteur" }, `${i + 1} / ${ids.length}`)),
    h("main", { class: "corps-session" }, h("div", { class: "etape" }, lecteur(s),
      retournee ? h("h1", { class: "mot-titre centre" }, s.mot) : h("p", { class: "info centre" }, "Quel est ce signe ? Retourne la carte pour vérifier."))),
    h("footer", { class: "pied-session" }, retournee
      ? h("button", { type: "button", class: "btn principal", onclick: () => (i + 1 < ids.length ? ecranCartes(ids, i + 1) : aller("/entrainement")) }, i + 1 < ids.length ? "Carte suivante" : "Terminer")
      : h("button", { type: "button", class: "btn principal", onclick: () => ecranCartes(ids, i, true) }, "Retourner la carte"))));
}

// ---------------------------------------------------------------- Dictionnaire
let recherche = "";
function ecranDico() {
  const liste = h("ul", { class: "liste-mots dico" });
  const tous = Object.values(etat.sens).sort((a, b) => a.mot.localeCompare(b.mot, "fr"));
  const remplir = () => {
    const q = normaliser(recherche);
    const r = q ? tous.filter((s) => normaliser(s.mot).includes(q) || (s.alias || []).some((a) => normaliser(a).includes(q))) : tous;
    liste.replaceChildren(...r.slice(0, 300).map((s) => h("li", {}, h("a", { href: "#/mot/" + s.id },
      h("span", {}, s.mot, s.glose ? h("span", { class: "glose-liste" }, ` (${s.glose})`) : null),
      h("span", { class: "nb" }, s.ressources.length > 1 ? `${s.ressources.length} vidéos` : "")))));
    if (r.length > 300) liste.append(h("li", { class: "info" }, `${r.length - 300} autres résultats : précise ta recherche.`));
    if (!r.length) liste.append(h("li", { class: "info" }, "Aucun signe libre trouvé. ",
      lienExterne("https://dico.elix-lsf.fr/dictionnaire/" + encodeURIComponent(recherche), "Chercher sur le Dico Elix")));
  };
  const champ = h("input", { type: "search", class: "champ", placeholder: "Rechercher un mot", "aria-label": "Rechercher un mot", value: recherche,
    oninput: (e) => { recherche = e.target.value; remplir(); } });
  remplir();
  app.replaceChildren(h("div", { class: "ecran" },
    h("header", { class: "entete-simple" }, h("div", {}, h("h1", {}, "Dictionnaire"), h("p", { class: "sous" }, `${tous.length} signes sous licence libre`))),
    h("main", { class: "contenu" }, champ, liste), barreOnglets("dico")));
}

function ecranMot(id) {
  const s = etat.sens[id];
  if (!s) return aller("/dico");
  let index = 0;
  const zone = h("div");
  const items = s.ressources.map((r, i) => h("li", {}, h("button", { type: "button", class: "ressource" + (i === index ? " actif" : ""), onclick: () => { index = i; dessiner(); } },
    h("img", { src: r.vignette, alt: "", width: 64, height: 48, loading: "lazy" }),
    h("span", {}, h("strong", {}, r.auteur), h("br"), `${r.source} · ${r.licence}`))));
  function dessiner() {
    zone.replaceChildren(lecteur(s, { index }));
    items.forEach((li, i) => li.firstChild.classList.toggle("actif", i === index));
  }
  dessiner();
  const carte = etat.cartes[id];
  const unites = etat.unites.filter((u) => (u.sens || []).includes(id));
  app.replaceChildren(h("div", { class: "ecran" },
    h("header", { class: "entete-simple" }, h("a", { href: "#/dico", class: "btn-icone", "aria-label": "Retour au dictionnaire" }, icone("retour")),
      h("div", {}, h("h1", {}, s.mot), h("p", { class: "sous" }, [s.categorie, s.glose].filter(Boolean).join(" · ") || " "))),
    h("main", { class: "contenu" }, zone,
      h("h2", { class: "titre-section" }, `${s.ressources.length} ressource${s.ressources.length > 1 ? "s" : ""} libre${s.ressources.length > 1 ? "s" : ""}`),
      h("ul", { class: "liste-ressources" }, items),
      lienExterne(s.elix, h("span", { class: "carte lien-carte" }, h("div", {}, h("h2", {}, "Voir « ", s.mot, " » sur le Dico Elix"),
        h("p", {}, "Autres signes et définition en LSF, dans le navigateur")), icone("externe", 22))),
      unites.length ? h("p", { class: "info" }, "Dans le parcours : ", unites.map((u) => `unité ${u.num} (${u.titre})`).join(", ")) : null,
      carte?.revisions ? h("p", { class: "info" }, `Prochaine révision : ${new Date(carte.echeance).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}`) : null),
    barreOnglets("dico")));
}

// ---------------------------------------------------------------- Profil
function ecranProfil() {
  const appris = sensAppris().length;
  const lecons = Object.keys(etat.faites).length;
  const fichier = h("input", { type: "file", accept: "application/json", class: "cache", id: "import",
    onchange: async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        await db.importer(JSON.parse(await f.text()));
        toast("Progression restaurée");
        setTimeout(() => location.reload(), 600);
      } catch (err) { toast(err.message || "Fichier illisible"); }
    } });
  const dac = uniteDactylo();
  app.replaceChildren(h("div", { class: "ecran" },
    h("header", { class: "entete-simple" }, h("h1", {}, "Profil")),
    h("main", { class: "contenu" },
      h("div", { class: "grille-stats" },
        h("div", { class: "carte stat-carte" }, h("strong", {}, String(appris)), h("span", {}, "signes appris")),
        h("div", { class: "carte stat-carte" }, h("strong", {}, String(lecons)), h("span", {}, "leçons terminées")),
        h("div", { class: "carte stat-carte" }, h("strong", {}, String(serie())), h("span", {}, "jours de suite")),
        h("div", { class: "carte stat-carte" }, h("strong", {}, String(reglage("xp", 0))), h("span", {}, "XP au total"))),
      dac ? h("section", { class: "carte" }, h("h2", {}, "Dactylologie"),
        h("p", {}, reglage("dactylo") === "passer" ? "L'unité 1 est passée pour l'instant." : "L'unité 1 fait partie de ton parcours."),
        h("button", { type: "button", class: "btn secondaire", onclick: async () => { await definir("dactylo", reglage("dactylo") === "passer" ? "faire" : "passer"); ecranProfil(); } },
          reglage("dactylo") === "passer" ? "Remettre l'alphabet dans le parcours" : "Passer l'alphabet")) : null,
      h("section", { class: "carte" }, h("h2", {}, "Sauvegarde"),
        h("p", {}, "Ta progression est enregistrée uniquement sur cet appareil. Exporte-la pour la garder ou la transférer."),
        h("div", { class: "boutons" },
          h("button", { type: "button", class: "btn secondaire", onclick: exporterProgression }, icone("telecharger", 20), " Exporter"),
          h("label", { for: "import", class: "btn secondaire" }, "Importer"), fichier)),
      h("section", { class: "carte" }, h("h2", {}, "À propos"),
        h("p", {}, "Application libre et gratuite pour apprendre la LSF, sans compte ni publicité."),
        h("a", { href: "#/credits", class: "lien" }, "Sources, licences et crédits"),
        !estInstallee() ? h("p", {}, h("a", { href: "#/installer", class: "lien" }, "Installer l'app sur l'écran d'accueil")) : null),
      h("button", { type: "button", class: "btn danger", onclick: async () => {
        if (!confirm("Effacer toute ta progression sur cet appareil ?")) return;
        await db.toutEffacer();
        location.hash = "#/";
        location.reload();
      } }, "Effacer ma progression")),
    barreOnglets("profil")));
}

async function exporterProgression() {
  const data = await db.exporter();
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
  const a = h("a", { href: url, download: `lsf-progression-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ecranCredits() {
  const parSource = {};
  for (const s of Object.values(etat.sens)) for (const r of s.ressources) {
    const k = `${r.source}|${r.licence}|${r.licenceUrl}`;
    (parSource[k] ||= { source: r.source, licence: r.licence, url: r.licenceUrl, n: 0 }).n++;
  }
  const nonPubliees = etat.toutesUnites.filter((u) => !u.publiee);
  app.replaceChildren(h("div", { class: "ecran" },
    h("header", { class: "entete-simple" }, h("a", { href: "#/profil", class: "btn-icone", "aria-label": "Retour" }, icone("retour")), h("h1", {}, "Sources et licences")),
    h("main", { class: "contenu" },
      h("section", { class: "carte" }, h("h2", {}, "Vidéos"),
        h("p", {}, "L'app n'utilise que des vidéos sous licence libre existantes. Chaque vidéo affiche son auteur et sa licence."),
        h("ul", {}, Object.values(parSource).map((p) => h("li", {}, `${p.source} : ${p.n} vidéos, `, lienExterne(p.url, p.licence)))),
        h("p", { class: "info" }, "Les vidéos ont été converties en MP4 et allégées pour l'app. Les vidéos CC BY-SA restent sous la même licence.")),
      h("section", { class: "carte" }, h("h2", {}, "Dico Elix"),
        h("p", {}, "Les liens « Voir sur le Dico Elix » ouvrent le site d'Elix (Signes de sens). Ses vidéos ne sont pas reprises dans l'app.")),
      h("section", { class: "carte" }, h("h2", {}, "Grammaire"),
        h("p", {}, "Les fiches de grammaire sont rédigées par le projet. Elles attendent la relecture d'un enseignant de LSF sourd.")),
      h("section", { class: "carte" }, h("h2", {}, `Unités en attente (${nonPubliees.length})`),
        h("p", {}, "Ces unités du programme ne sont pas publiées faute de vidéos libres en nombre suffisant :"),
        h("p", { class: "info" }, nonPubliees.map((u) => `${u.num}. ${u.titre}`).join(" · "))),
      h("section", { class: "carte" }, h("h2", {}, "Polices et code"),
        h("p", {}, "Atkinson Hyperlegible et Bricolage Grotesque, sous licence SIL Open Font License. Code de l'app sous licence MIT."),
        h("p", { class: "info" }, `Contenu généré le ${new Date(etat.contenu.genere).toLocaleDateString("fr-FR")}.`))),
    barreOnglets("profil")));
}

// ---------------------------------------------------------------- Démarrage
async function demarrer() {
  try {
    await charger();
  } catch (e) {
    app.replaceChildren(h("div", { class: "ecran bienvenue" }, h("h1", {}, "Contenu indisponible"),
      h("p", {}, "Le contenu n'a pas pu être chargé. Vérifie ta connexion puis recharge la page.")));
    return;
  }
  window.addEventListener("hashchange", router);
  router();
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

demarrer();
