// Link repair plugin.
//
// If the LLM sometimes truncates or alters a long URL, we re-anchor on the
// URL's distinctive prefix and swap it back to the exact canonical form.
// Add the URLs that matter to your deployment to CANON below, or leave it
// empty to make repairLinks a no-op.

const CANON = []
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function prefixOf(u) { return u.replace(/([?&].*)$/, '').slice(0, 60) }

function repairLinks(text) {
  if (!text) return text
  let out = text
  for (const url of CANON) {
    const pre = prefixOf(url)
    if (pre.length < 25) continue
    out = out.replace(new RegExp(esc(pre) + '[^\\s)]*', 'g'), url)
  }
  return out
}

module.exports = { repairLinks, CANON }
