// Plugin de nettoyage DÉTERMINISTE des réponses sortantes du cerveau.
// Philosophie : le CODE garantit ce que le prompt ne tient pas toujours (surtout avec un modèle
// faible comme gemini-flash-lite). Règle métier dure : le bot ne doit JAMAIS dire qu'il n'a pas
// le transcript / l'enregistrement / l'accès à la vidéo. Si le LLM glisse ce disclaimer malgré le
// prompt, on le retire ici, avant l'envoi — sans dépendre du modèle.

// Nie possession/accès + objet "transcript/recording/video".
const NEG = /(don'?t|do not|can ?not|can'?t|not able to|unable to|wasn'?t|was not|haven'?t|have not|no longer|don'?t really|do not have|ne peux pas|ne pas|n'ai pas|pas acc[eè]s)/i
const OBJ = /\b(transcripts?|transcriptions?|recordings?|the videos?|access to the (?:video|session|meeting|recording))\b/i
// Esquive "je ne peux pas accéder aux conversations/messages privés / to what others said" -> à retirer aussi.
const DEFLECT = /\b(private (?:conversation|chat|message)|conversations? priv[ée]es?|messages? priv[ée]s?|[ée]changes? (?:priv[ée]|entre (?:les )?membres)|acc[eé]der (?:aux?|à|a) (?:conversations?|messages?|[ée]changes?)|access to (?:your|what) (?:conversations?|messages?|others))/i

// Nettoie une phrase/segment : si c'est un disclaimer "pas de transcript" OU une esquive "pas d'accès
// aux conversations privées", on le retire (en gardant la partie utile après "but/however/mais").
function scrubSegment(seg) {
  const isDisclaimer = NEG.test(seg) && (OBJ.test(seg) || DEFLECT.test(seg))
  if (!isDisclaimer) return seg // pas un disclaimer/esquive -> inchangé
  // NB: "transcript" nié = toujours un disclaimer ; "recording/video" seulement s'il est nié (déjà via NEG).
  const m = seg.match(/\b(?:but|however|though|although|mais|toutefois|cependant|par contre)\b[,\s]*(.+)/i)
  if (m && m[1] && m[1].trim().length > 2) {
    const t = m[1].trim()
    return t.charAt(0).toUpperCase() + t.slice(1)
  }
  return '' // pas de partie utile -> on drope la phrase entière
}

// Corrige un mot d'OUVERTURE dans la mauvaise langue (grok ouvre parfois une réponse anglaise par
// "Non,"/"Oui," ou une réponse française par "No,"/"Yes,"). Déterministe, ne touche que le 1er mot.
function fixLeadWord(text, lang) {
  if (!text || !lang) return text
  if (lang === 'English') return text.replace(/^(\s*)Non(?=[,\s])/, '$1No').replace(/^(\s*)Oui(?=[,\s])/, '$1Yes')
  if (lang === 'French') return text.replace(/^(\s*)No(?=[,\s])/, '$1Non').replace(/^(\s*)Yes(?=[,\s])/, '$1Oui')
  return text
}

// Nettoie une réponse complète en préservant les paragraphes. `lang` (optionnel) corrige le mot d'ouverture.
function cleanReply(text, lang) {
  if (!text) return fixLeadWord(text, lang)
  const blocks = text.split(/(\n{2,})/) // garde les séparateurs de paragraphe
  const out = blocks.map((block) => {
    if (/^\n+$/.test(block)) return block
    const parts = block.split(/(?<=[.?!])\s+/) // phrases
    const kept = []
    for (const seg of parts) {
      const s = scrubSegment(seg)
      if (s && s.trim()) kept.push(s.trim())
    }
    return kept.join(' ')
  })
  let s = out.join('').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').replace(/^\s*[,;:.\-—]\s*/, '').trim()
  if (s) s = s.charAt(0).toUpperCase() + s.slice(1)
  // FILET DE SÉCURITÉ, PAS UN HACHOIR : si le nettoyage viderait (ou réduirait à presque rien) la
  // réponse, on renvoie l'original inchangé. On ne laisse JAMAIS le membre sans réponse à cause du filtre.
  if (!s || s.length < 12) return fixLeadWord(text, lang)
  return fixLeadWord(s, lang)
}

// Retire une SALUTATION + RE-PRÉSENTATION en tête de réponse. À n'appeler QUE si la conversation est
// déjà en cours (le code sait via l'historique que ce n'est pas un 1er contact) -> déterministe, pas de
// dépendance au prompt. Ne vide jamais la réponse (filet de sécurité).
function stripLeadingIntro(text) {
  if (!text) return text
  let s = text
  s = s.replace(/^\s*(bonjour|bonsoir|salut|coucou|hello+|hi+|hey|hola)\b\s*[!,.…]*\s*/i, '')
  s = s.replace(/^\s*(je suis (?:votre|ton|l[’'e ]) ?assistant[^.!?\n]*[.!?]|i'?m (?:your |the )?[^.!?\n]*assistant[^.!?\n]*[.!?])\s*/i, '')
  s = s.replace(/^\s*(bonjour|bonsoir|salut|hello+|hi+)\b\s*[!,.…]*\s*/i, '') // 2e salutation éventuelle après l'intro
  s = s.replace(/^[\s—–\-]+/, '').trim()
  if (s) s = s.charAt(0).toUpperCase() + s.slice(1)
  return s.length >= 5 ? s : text
}

module.exports = { cleanReply, stripLeadingIntro }
