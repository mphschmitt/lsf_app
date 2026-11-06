// Rendu de chaque type d'étape d'une session.
import { h, icone, lienExterne } from "./ui.js";
import { lecteur, miniVideo } from "./player.js";
import { estBonneSaisie, melanger } from "./exercises.js";
import { etat } from "./etat.js";

const S = (id) => etat.sens[id];

function choixMots(etape, api, consigne, haut) {
  let choisi = null;
  const boutons = etape.options.map((id) => {
    const b = h("button", { type: "button", class: "choix", "aria-pressed": "false",
      onclick: () => {
        if (api.verrouille()) return;
        choisi = id;
        for (const x of boutons) { x.setAttribute("aria-pressed", "false"); x.classList.remove("selectionne"); }
        b.setAttribute("aria-pressed", "true");
        b.classList.add("selectionne");
        api.pret(true);
      } }, S(id).mot);
    b.dataset.id = id;
    return b;
  });
  return {
    el: h("div", { class: "etape" }, h("h1", { class: "consigne" }, consigne), haut, h("div", { class: "grille-choix" }, boutons)),
    verifier() {
      const ok = choisi === etape.sens;
      for (const b of boutons) {
        if (b.dataset.id === etape.sens) b.classList.add("bon");
        else if (b.dataset.id === choisi) b.classList.add("faux");
      }
      return { ok, sens: { [etape.sens]: ok ? "ok" : "rate" }, correction: S(etape.sens).mot };
    },
  };
}

const rendus = {
  decouverte(etape, api) {
    const s = S(etape.sens);
    api.pret(true, "Continuer");
    return {
      el: h("div", { class: "etape" },
        h("p", { class: "surtitre" }, "Nouveau signe"),
        h("h1", { class: "mot-titre" }, s.mot),
        s.glose ? h("p", { class: "glose" }, s.glose) : null,
        lecteur(s),
        h("p", { class: "lien-elix" }, lienExterne(s.elix, icone("externe", 16), " Voir « ", s.mot, " » sur le Dico Elix"))),
      verifier: () => ({ ok: null, sens: {} }),
    };
  },

  videoMot(etape, api) {
    return choixMots(etape, api, "Quel mot est signé ?", lecteur(S(etape.sens)));
  },

  motVideo(etape, api) {
    let choisi = null;
    const cartes = etape.options.map((id) => {
      const b = h("button", { type: "button", class: "choix-video", "aria-pressed": "false", "aria-label": "Choisir cette vidéo",
        onclick: () => {
          if (api.verrouille()) return;
          choisi = id;
          for (const x of cartes) { x.classList.remove("selectionne"); x.setAttribute("aria-pressed", "false"); }
          b.classList.add("selectionne");
          b.setAttribute("aria-pressed", "true");
          api.pret(true);
        } }, miniVideo(S(id)));
      b.dataset.id = id;
      return b;
    });
    return {
      el: h("div", { class: "etape" }, h("h1", { class: "consigne" }, "Quelle vidéo signe « ", S(etape.sens).mot, " » ?"),
        h("div", { class: "grille-videos" }, cartes)),
      verifier() {
        const ok = choisi === etape.sens;
        for (const b of cartes) {
          if (b.dataset.id === etape.sens) b.classList.add("bon");
          else if (b.dataset.id === choisi) b.classList.add("faux");
        }
        return { ok, sens: { [etape.sens]: ok ? "ok" : "rate" }, correction: S(etape.sens).mot };
      },
    };
  },

  vraiFaux(etape, api) {
    let choix = null;
    const b = (val, txt) => {
      const x = h("button", { type: "button", class: "choix", "aria-pressed": "false",
        onclick: () => {
          if (api.verrouille()) return;
          choix = val;
          for (const y of [bv, bf]) { y.classList.remove("selectionne"); y.setAttribute("aria-pressed", "false"); }
          x.classList.add("selectionne");
          x.setAttribute("aria-pressed", "true");
          api.pret(true);
        } }, txt);
      return x;
    };
    const bv = b(true, "Oui"), bf = b(false, "Non");
    return {
      el: h("div", { class: "etape" }, h("h1", { class: "consigne" }, "Ce signe veut-il dire « ", S(etape.montre).mot, " » ?"),
        lecteur(S(etape.sens)), h("div", { class: "grille-choix" }, bv, bf)),
      verifier() {
        const ok = choix === etape.correct;
        (etape.correct ? bv : bf).classList.add("bon");
        if (!ok) (choix ? bv : bf).classList.add("faux");
        return { ok, sens: { [etape.sens]: ok ? "ok" : "rate" }, correction: S(etape.sens).mot };
      },
    };
  },

  saisie(etape, api) {
    const champ = h("input", { id: "saisie", type: "text", class: "champ", autocomplete: "off", autocapitalize: "none", spellcheck: false,
      oninput: () => api.pret(champ.value.trim().length > 0),
      onkeydown: (e) => { if (e.key === "Enter" && champ.value.trim()) api.valider(); } });
    setTimeout(() => champ.focus({ preventScroll: true }), 50);
    return {
      el: h("div", { class: "etape" }, h("h1", { class: "consigne" }, "Écris le mot signé"), lecteur(S(etape.sens)),
        h("label", { for: "saisie", class: "etiquette" }, "Ta réponse"), champ),
      verifier() {
        const ok = estBonneSaisie(S(etape.sens), champ.value);
        champ.disabled = true;
        champ.classList.add(ok ? "bon" : "faux");
        return { ok, sens: { [etape.sens]: ok ? "ok" : "rate" }, correction: S(etape.sens).mot };
      },
    };
  },

  paires(etape, api) {
    const ids = etape.sens;
    const resultats = Object.fromEntries(ids.map((id) => [id, "ok"]));
    let selVideo = null, selMot = null, trouvees = 0;
    const essayer = () => {
      if (!selVideo || !selMot) return;
      const v = selVideo, m = selMot;
      selVideo = selMot = null;
      if (v.dataset.id === m.dataset.id) {
        for (const x of [v, m]) { x.classList.remove("selectionne"); x.classList.add("bon"); x.disabled = true; }
        trouvees++;
        if (trouvees === ids.length) {
          api.terminer({ ok: Object.values(resultats).every((r) => r === "ok"), sens: resultats });
        }
      } else {
        resultats[v.dataset.id] = "rate";
        resultats[m.dataset.id] = "rate";
        for (const x of [v, m]) { x.classList.add("faux"); setTimeout(() => x.classList.remove("faux", "selectionne"), 600); }
      }
    };
    const videos = melanger(ids).map((id) => {
      const b = h("button", { type: "button", class: "choix-video petit", "aria-label": "Vidéo",
        onclick: () => { for (const x of videos) x.classList.remove("selectionne"); selVideo = b; b.classList.add("selectionne"); essayer(); } },
        miniVideo(S(id)));
      b.dataset.id = id;
      return b;
    });
    const mots = melanger(ids).map((id) => {
      const b = h("button", { type: "button", class: "choix",
        onclick: () => { for (const x of mots) x.classList.remove("selectionne"); selMot = b; b.classList.add("selectionne"); essayer(); } },
        S(id).mot);
      b.dataset.id = id;
      return b;
    });
    api.masquerVerifier();
    return {
      el: h("div", { class: "etape" }, h("h1", { class: "consigne" }, "Associe chaque vidéo à son mot"),
        h("div", { class: "paires" }, h("div", { class: "col" }, videos), h("div", { class: "col" }, mots))),
    };
  },

  signer(etape, api) {
    const s = S(etape.sens);
    let flux = null;
    const miroir = h("video", { class: "miroir", autoplay: true, muted: true, playsInline: true, "aria-label": "Ta caméra, en miroir" });
    miroir.setAttribute("playsinline", "");
    const zone = h("div", { class: "zone-camera" });
    const lancer = h("button", { type: "button", class: "btn secondaire", onclick: async () => {
      try {
        flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        miroir.srcObject = flux;
        zone.replaceChildren(miroir);
      } catch {
        zone.replaceChildren(h("p", { class: "info" }, "Caméra indisponible. Signe devant un miroir, puis compare."));
      }
    } }, icone("camera", 20), " Activer la caméra miroir");
    zone.append(lancer, h("p", { class: "info" }, "Rien n'est enregistré : l'image reste sur ton appareil."));
    const reponse = h("div", { class: "reponse-signer" });
    const eval3 = (val, txt) => h("button", { type: "button", class: "choix", onclick: () => {
      if (flux) flux.getTracks().forEach((t) => t.stop());
      api.terminer({ ok: val !== "rate", sens: { [s.id]: val } });
    } }, txt);
    const voir = h("button", { type: "button", class: "btn", onclick: () => {
      voir.remove();
      reponse.replaceChildren(lecteur(s), h("p", { class: "consigne-petite" }, "Ton signe correspondait-il ?"),
        h("div", { class: "grille-choix trois" }, eval3("ok", "Oui"), eval3("hesite", "À peu près"), eval3("rate", "Non")));
    } }, "Voir la réponse");
    api.masquerVerifier();
    api.surQuitter(() => { if (flux) flux.getTracks().forEach((t) => t.stop()); });
    return { el: h("div", { class: "etape" }, h("h1", { class: "consigne" }, "Signe « ", s.mot, " »"), zone, voir, reponse) };
  },

  fiche(etape, api, ctx) {
    const f = ctx.fiche;
    api.pret(true, "Continuer");
    return {
      el: h("div", { class: "etape fiche" },
        h("p", { class: "surtitre" }, "Grammaire"),
        h("h1", { class: "mot-titre" }, f.titre),
        f.points.map((p) => h("p", {}, p)),
        h("h2", {}, "Exemples"),
        f.exemples.map((e) => h("div", { class: "exemple" }, h("p", { class: "glose-lsf" }, e.glose), h("p", {}, e.fr), e.note ? h("p", { class: "info" }, e.note) : null)),
        h("p", { class: "info" }, "Les exemples sont écrits en glose : chaque mot en majuscules représente un signe, dans l'ordre de la LSF."),
        ctx.statut === "a_relire" ? h("p", { class: "avertissement" }, "Fiche en attente de relecture par un enseignant de LSF sourd.") : null),
      verifier: () => ({ ok: null, sens: {} }),
    };
  },

  qcmGrammaire(etape, api) {
    let choisi = null;
    const boutons = etape.options.map((o, i) => {
      const b = h("button", { type: "button", class: "choix large", onclick: () => {
        if (api.verrouille()) return;
        choisi = i;
        for (const x of boutons) x.classList.remove("selectionne");
        b.classList.add("selectionne");
        api.pret(true);
      } }, o);
      return b;
    });
    const ordre = melanger(boutons.map((b, i) => i));
    return {
      el: h("div", { class: "etape" }, h("h1", { class: "consigne" }, etape.question), h("div", { class: "liste-choix" }, ordre.map((i) => boutons[i]))),
      verifier() {
        const ok = choisi === etape.reponse;
        boutons[etape.reponse].classList.add("bon");
        if (!ok && choisi !== null) boutons[choisi].classList.add("faux");
        return { ok, sens: {}, correction: etape.options[etape.reponse], explication: etape.explication };
      },
    };
  },

  ordre(etape, api) {
    const choisis = [];
    const ligne = h("div", { class: "ligne-glose", "aria-live": "polite" });
    const reserve = h("div", { class: "reserve" });
    const maj = () => {
      ligne.replaceChildren(...choisis.map((b) => b));
      api.pret(choisis.length === etape.tokens.length);
    };
    const jetons = melanger(etape.tokens.map((t, i) => ({ t, i }))).map(({ t }) => {
      const b = h("button", { type: "button", class: "jeton", onclick: () => {
        if (api.verrouille()) return;
        if (choisis.includes(b)) { choisis.splice(choisis.indexOf(b), 1); reserve.append(b); }
        else choisis.push(b);
        maj();
      } }, t);
      return b;
    });
    reserve.append(...jetons);
    return {
      el: h("div", { class: "etape" }, h("h1", { class: "consigne" }, "Remets les signes dans l'ordre de la LSF"),
        h("p", { class: "phrase-fr" }, "« ", etape.fr, " »"), ligne, reserve),
      verifier() {
        const ok = choisis.map((b) => b.textContent).join(" ") === etape.tokens.join(" ");
        ligne.classList.add(ok ? "bon" : "faux");
        return { ok, sens: {}, correction: etape.tokens.join(" ") };
      },
    };
  },
};

// Dactylologie : les vidéos des lettres s'enchaînent, l'apprenant tape le mot.
rendus.lireMot = function (etape, api, ctx) {
  const lettres = [...normaliserMot(etape.mot)];
  const video = h("video", { class: "video", muted: true, playsInline: true, preload: "auto", "aria-label": "Mot épelé" });
  video.setAttribute("muted", "");
  video.setAttribute("playsinline", "");
  let vitesse = ctx.vitesse || 1, i = 0;
  const points = h("div", { class: "points-lettres", "aria-hidden": "true" }, lettres.map(() => h("span")));
  const jouer = (k) => {
    i = k;
    [...points.children].forEach((p, j) => p.classList.toggle("actif", j === i));
    if (i >= lettres.length) { video.pause(); return; }
    const s = etat.sens[ctx.lettres[lettres[i]]];
    video.src = s.ressources[0].video;
    video.playbackRate = vitesse;
    video.play().catch(() => {});
  };
  video.addEventListener("ended", () => jouer(i + 1));
  video.addEventListener("loadedmetadata", () => { video.playbackRate = vitesse; });
  const vit = [[0.6, "Lente"], [1, "Normale"], [1.5, "Rapide"]].map(([v, t]) => {
    const b = h("button", { type: "button", class: "btn-mini" + (v === vitesse ? " actif" : ""), "aria-pressed": String(v === vitesse),
      onclick: () => {
        vitesse = v;
        ctx.vitesse = v;
        video.playbackRate = v;
        vit.forEach((x) => { x.classList.toggle("actif", x === b); x.setAttribute("aria-pressed", String(x === b)); });
      } }, t);
    return b;
  });
  const champ = h("input", { id: "saisie", type: "text", class: "champ majuscules", autocomplete: "off", autocapitalize: "characters", spellcheck: false,
    oninput: () => api.pret(champ.value.trim().length > 0),
    onkeydown: (e) => { if (e.key === "Enter" && champ.value.trim()) api.valider(); } });
  setTimeout(() => jouer(0), 50);
  return {
    el: h("div", { class: "etape" }, h("h1", { class: "consigne" }, "Quel mot est épelé ?"),
      h("div", { class: "lecteur" }, h("div", { class: "cadre-video" }, video), points,
        h("div", { class: "controles" }, h("button", { type: "button", class: "btn-mini", onclick: () => jouer(0) }, icone("revoir", 18), "Revoir"), vit)),
      h("label", { for: "saisie", class: "etiquette" }, "Tape le mot lu"), champ),
    verifier() {
      const ok = normaliserMot(champ.value) === normaliserMot(etape.mot);
      champ.disabled = true;
      champ.classList.add(ok ? "bon" : "faux");
      return { ok, sens: {}, correction: etape.mot };
    },
  };
};

function normaliserMot(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[^a-z]/g, "");
}

export function rendreEtape(etape, api, ctx) {
  return rendus[etape.type](etape, api, ctx);
}
