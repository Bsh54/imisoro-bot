# Imisoro Guide

**A WhatsApp AI assistant that helps Rwandan businesses and accountants prepare for VAT filing on the official RRA eTax portal.**

Imisoro Guide is the conversational companion of [Imisoro AI](https://imisoroai.nutekh.com/). It answers questions about the Imisoro app, walks users through the monthly VAT close, explains the capture / review / prepare-for-eTax workflow, and points people to the right reference without ever filing on their behalf.

It is a review workspace, not a black box. The AI extracts and flags, the human approves, and the final return is always submitted by the user or their accountant in the official RRA eTax portal.

## What it does

- Answers questions in **English**, **Kinyarwanda** and **Français** (language mirror).
- Reads the message, searches a grounded knowledge base built from the product's own content, and replies strictly from that evidence. If the fact is not in the knowledge base, it says so and points to the official channel instead of inventing.
- Runs on WhatsApp through [Baileys](https://github.com/WhiskeySockets/Baileys) once paired with a phone number.
- Ships with a small HTTP server (`connect-server.js`) that serves a branded pairing page with a QR code.

## Architecture

```
          WhatsApp (Baileys, QR pairing)
                     |
              connect-server.js   <--  public/connect.html  (QR page, SSE live status)
                     |
               src/brain.js       <--  Imisoro-specific system prompt (DM mode)
               /       \
       src/memory.js   src/llm.js
         |     |             \
      SQLite  FTS5 + vectors   Fikra API (OpenAI-compatible)
                                 deepseek-v4.1-flash  (primary)
                                 + Gemini / Qwen / GLM fallbacks

                            data/knowledge-imisoro.jsonl
                            (seed facts from the product deck + site)
```

Key design notes:

- **Grounded RAG**. Every answer is built from the knowledge base, not from model memory. The brain injects the entire KB into the prompt as long as it fits (currently under 6 KB) and falls back to hybrid search (BM25 + vector embeddings fused by Reciprocal Rank Fusion, then LLM reranking) once the base grows past 60 KB.
- **Language mirror**. The brain detects the user's language from the message and answers only in that language, never mixes.
- **No filing**. The system prompt forbids claiming that the bot submits returns to the RRA. The final submission stays with the user in the official portal.
- **WhatsApp formatting**. Uses WhatsApp-native formatting (`*bold*`, `_italic_`, bullet lines) and avoids Markdown headings that would render as raw characters.

## Repository layout

```
imisoro-bot/
|- connect-server.js      Node HTTP server + Baileys socket + QR endpoints
|- public/connect.html    Branded pairing page (loads QR via SSE)
|- src/
|  |- brain.js            RAG pipeline, system prompt, answer* functions
|  |- memory.js           SQLite + FTS5 + vector table
|  |- embed.js            Multilingual embedding client
|  |- llm.js              Multi-endpoint OpenAI-compatible client with fallbacks
|  |- sanitize.js         Reply hygiene
|  |- serialize.js        Per-key queues + atomic JSON writes
|  |- usermem.js          Per-user DM memory
|  |- (and the full set of reusable modules)
|- curator.js             Auto-curator that distills raw logs into clean facts
|- ask.js                 CLI probe for end-to-end testing without WhatsApp
|- seed-kb.js             Idempotent loader for data/knowledge-imisoro.jsonl
|- embed-service.py       Flask microservice for multilingual embeddings
|- data/
|  |- knowledge-imisoro.jsonl   The seed knowledge base (committed)
|  |- memory.db                 Auto-created, not committed
|  |- auth-imisoro/             WhatsApp session, not committed
|- ecosystem.config.js    PM2 config
|- .env.example           Environment template
```

## Requirements

- Node.js 20 or newer (uses `--env-file` built-in flag).
- Python 3.10 or newer, only if you want to run the embeddings microservice locally.
- A Fikra API key (`fk_live_...`) or any other OpenAI-compatible provider.

## Install and run

```sh
# 1. Install dependencies.
npm install

# 2. Copy the env template and fill in your keys.
cp .env.example .env
# Edit .env and set at least LLM_API_KEY.

# 3. Seed the knowledge base.
node seed-kb.js

# 4. Test the brain from the CLI, no WhatsApp needed.
node --env-file=.env ask.js "Does Imisoro file my VAT return for me?"

# 5. Run the connect server.
node --env-file=.env connect-server.js
# Open http://localhost:3010/ in a browser.
# Scan the QR with the WhatsApp account that will act as the assistant line.
# Once the page turns green, the bot answers DMs on that number.
```

The WhatsApp session is persisted in `data/auth-imisoro/`. Next starts do not require a re-scan. To unlink, click **Unlink this device** on the pairing page or `POST /logout`.

## Knowledge base

`data/knowledge-imisoro.jsonl` is the single source of product facts. Each line is a small JSON record:

```json
{"id":"seed:imisoro:011","text":"Imisoro does NOT file returns for the user...","source":"site+deck"}
```

To add a fact, append a new line with a fresh `id` and re-run `node seed-kb.js`. The loader is idempotent: existing rows are skipped. Facts marked with the `fix:` id prefix (if you add any) are treated as hand-written authoritative facts, which take precedence in the retrieval ranking.

## Environment variables

Minimum set:

| Variable | Purpose |
|---|---|
| `LLM_BASE_URL` | OpenAI-compatible endpoint. Default points at Fikra API. |
| `LLM_API_KEY` | Your provider key. |
| `CHAT_MODEL` | Primary model. Default `deepseek-v4.1-flash`. |
| `LLM_FALLBACK_MODELS` | Comma-separated models on the same provider. |
| `EMBED_URL` | Embeddings microservice, optional. Defaults to `http://127.0.0.1:7867/embed`. |
| `CONNECT_PORT` | Port for the pairing server. Defaults to 3010. |

Full template in `.env.example`.

## Scope

In scope:

- Imisoro app features and usage.
- Monthly VAT close workflow (capture, review, prepare for eTax).
- High-level RRA / EBM / eTax context as it relates to using Imisoro.
- Language mirror across English, Kinyarwanda and Français.

Out of scope, by design:

- Submitting returns on the user's behalf.
- Specific tax advice on complex personal situations. These get redirected to a professional or to the RRA directly.
- Legal, audit, payroll, customs and anything beyond Rwandan VAT / EBM / RRA eTax.

## Credits

- Product: **[Imisoro AI](https://imisoroai.nutekh.com/)** by Emily Kirabo, Kigali, Rwanda.
- WhatsApp integration: [Baileys](https://github.com/WhiskeySockets/Baileys).
- LLM gateway: [Fikra API](https://fikraapi.co.ke/).

## License

MIT.
