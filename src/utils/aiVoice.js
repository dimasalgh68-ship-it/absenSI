// Utilitas Suara AI (Text-to-Speech Bahasa Indonesia) menggunakan Web Speech API

export function getAvailableVoices() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  const voices = window.speechSynthesis.getVoices() || [];
  // Urutkan suara Bahasa Indonesia (id-ID / id) di paling atas
  return [...voices].sort((a, b) => {
    const aId = a.lang.toLowerCase().startsWith('id') ? 0 : 1;
    const bId = b.lang.toLowerCase().startsWith('id') ? 0 : 1;
    if (aId !== bId) return aId - bId;
    return a.name.localeCompare(b.name);
  });
}

export function speakAI(text, options = true) {
  const opts = typeof options === 'boolean'
    ? { enabled: options }
    : (options || {});

  if (opts.enabled === false || !text) return;

  try {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const synth = window.speechSynthesis;
    synth.cancel();

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'id-ID';
    utter.rate = Number(opts.rate) || 1.0;
    utter.pitch = Number(opts.pitch) || 1.0;
    utter.volume = 1.0;

    const voices = synth.getVoices() || [];
    let selectedVoice = null;

    if (opts.voiceName) {
      selectedVoice = voices.find(v => v.name === opts.voiceName) || null;
    }
    if (!selectedVoice) {
      selectedVoice =
        voices.find(v => v.lang.toLowerCase().includes('id-id')) ||
        voices.find(v => v.lang.toLowerCase().startsWith('id')) ||
        null;
    }

    if (selectedVoice) {
      utter.voice = selectedVoice;
      utter.lang = selectedVoice.lang || 'id-ID';
    }

    synth.speak(utter);
  } catch (e) {
    console.warn('Suara AI tidak didukung browser:', e);
  }
}
