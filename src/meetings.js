// Meetings stub.
//
// Live-meeting tracking (join links, active/ended state) is not wired in this
// template. The module exports the same no-op shape brain.js expects so the
// prompt simply gets an empty "meetings" block. Replace with real logic to
// plug in a meetings source.
module.exports = {
  meetingsBlock: () => '',
  recordState: () => {},
  activeMeetings: () => [],
  endedToday: () => [],
}
