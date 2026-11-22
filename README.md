# Project 9: L'Oréal Routine Builder
L’Oréal is expanding what’s possible with AI, and now your chatbot is getting smarter. This week, you’ll upgrade it into a product-aware routine builder. 

Users will be able to browse real L’Oréal brand products, select the ones they want, and generate a personalized routine using AI. They can also ask follow-up questions about their routine—just like chatting with a real advisor.

## GitHub Pages Deployment Setup
GitHub Pages serves static files only and cannot run `server.js` (`POST /api/chat` returns HTTP `405` on static hosts).

To enable the AI chatbot on GitHub Pages without exposing an OpenAI API key in client-side code:
1. Deploy or use your class-hosted **Cloudflare Worker** that holds `OPENAI_API_KEY` as a Worker secret.
2. Paste your Worker URL into `CLOUDFLARE_WORKER_URL` at the top of `script.js` (or into `<meta name="openai-worker-url" content="https://..." />` in `index.html`).