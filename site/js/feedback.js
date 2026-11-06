let contexteAudio = null;

function jouerSonSucces() {
  const AudioContextDisponible = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextDisponible) return;

  try {
    contexteAudio ||= new AudioContextDisponible();
    const contexte = contexteAudio;
    const jouer = () => {
      const maintenant = contexte.currentTime;
      const oscillateur = contexte.createOscillator();
      const volume = contexte.createGain();
      oscillateur.type = "sine";
      oscillateur.frequency.setValueAtTime(660, maintenant);
      oscillateur.frequency.setValueAtTime(880, maintenant + 0.1);
      volume.gain.setValueAtTime(0.0001, maintenant);
      volume.gain.exponentialRampToValueAtTime(0.12, maintenant + 0.015);
      volume.gain.exponentialRampToValueAtTime(0.0001, maintenant + 0.24);
      oscillateur.connect(volume);
      volume.connect(contexte.destination);
      oscillateur.start(maintenant);
      oscillateur.stop(maintenant + 0.25);
    };

    if (contexte.state === "suspended") contexte.resume().then(jouer).catch(() => {});
    else jouer();
  } catch {
    // L'indisponibilité audio ne doit pas bloquer la session.
  }
}

export function retourPositif({ son = true, vibration = true } = {}) {
  if (vibration && typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try { navigator.vibrate(35); } catch { /* API de vibration non disponible sur cet appareil */ }
  }
  if (son) jouerSonSucces();
}
