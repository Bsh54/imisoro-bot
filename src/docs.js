// Document registry (stub).
//
// The public template ships no documents. This module keeps the same shape as
// the full version so brain.js and downstream code can call `all()` without
// branching. To wire real files back in, extend the SEED array and reintroduce
// the matcher / translation flow from your deployment.

const path = require('path')

const DOC_DIR = process.env.DOC_DIR || path.join(__dirname, '..', 'documents')
const SEED = []

function all() { return SEED }
function register() { return null }
function registerFromContent() { return null }
function findByKeyword() { return null }
async function pick() { return { kind: 'none', lang: 'en' } }
async function getFile() { return null }
async function ensureLang() {}
function pathOf(doc) { return path.join(DOC_DIR, (doc && doc.file) || '') }

module.exports = { all, register, registerFromContent, findByKeyword, pick, getFile, ensureLang, pathOf, DOC_DIR }
