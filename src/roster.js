// Role resolver: admin vs member.
// In public live rooms, WhatsApp hides phone numbers (@lid) so we lean on the
// display name (pushName). An entry can also be marked admin if it came from
// an announcement channel.
//
// Admin names and numbers are intentionally empty in the public repo. Fill the
// arrays below (or override roleOf) for your own deployment.

const ADMIN_NAMES = []
const ADMIN_NUMBERS = []

function roleOf(entry) {
  if (entry && entry.isAnnouncement) return 'admin'
  const name = ((entry && entry.senderName) || '').toLowerCase().trim()
  if (name && ADMIN_NAMES.some((a) => name === a || name.includes(a))) return 'admin'
  const num = ((entry && entry.senderNumber) || '').replace(/[^0-9]/g, '')
  if (num && ADMIN_NUMBERS.includes(num)) return 'admin'
  return 'member'
}

module.exports = { roleOf, ADMIN_NAMES, ADMIN_NUMBERS }
