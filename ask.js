// Pose une question à la mémoire depuis la ligne de commande.
// Usage: node ask.js "c'est quand la deadline du hackathon ?"
const { answer } = require('./src/brain')

const question = process.argv.slice(2).join(' ').trim()
if (!question) {
  console.error('Usage: node ask.js "ta question"')
  process.exit(1)
}

answer(question)
  .then(({ reply, sources }) => {
    console.log(`\n🤖 Réponse (basée sur ${sources} extrait(s)) :\n`)
    console.log(reply)
    console.log('')
  })
  .catch((e) => {
    console.error('Erreur:', e.message)
    process.exit(1)
  })
