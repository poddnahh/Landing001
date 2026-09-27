# UnMe AI story helper (optional)

Story Time works without this helper: the app writes a simple recap draft on the phone. With the helper deployed, **Claude** writes the recap instead. It gives a warm summary, the 3–5 best moments (each linked to the exact spot in the video), the moral of the story, and the punchlines. It does a much better job with rambling, real-life storytelling.

The helper is a tiny Cloudflare Worker. It keeps your Anthropic API key on the server, so the key is never inside the app.

## Set up (about 10 minutes)

1. Get an Anthropic API key at https://platform.claude.com.
2. Create a free Cloudflare account, then in this folder run:
   ```bash
   npm install
   npx wrangler login
   npx wrangler secret put ANTHROPIC_API_KEY   # paste your key
   npx wrangler deploy
   ```
3. Wrangler prints a URL like `https://unme-story-helper.<you>.workers.dev`. Paste it into `unme/app/js/config.js` as `aiSummaryUrl`.
4. If your app is not hosted at `https://poddnahh.github.io`, change `ALLOWED_ORIGIN` in `wrangler.toml` and redeploy.

## Cost

Each recap is one Claude request, using the `claude-opus-5` model. A 5-minute story is roughly 1,000–2,000 words of transcript, which comes to a few cents per recap. Keep an eye on usage in the Anthropic console. To spend less per recap, you can switch to a smaller model in `src/index.js` (for example `claude-sonnet-5`).

If Claude's safety system ever declines a story, `fallbacks: "default"` retries it on a backup model automatically. If the helper is unreachable, the app falls back to its on-phone draft.

## Privacy

The helper only receives the words of the transcript, never the video or audio. It stores nothing. Say this clearly in your privacy policy before you sell the app.
