// ─────────────────────────────────────────────────────────────
//  Heartroots — owner settings. Edit this file to go live.
// ─────────────────────────────────────────────────────────────
export const CONFIG = {
  appName: 'Heartroots',

  // Price shown for the lifetime unlock.
  basePrice: 10,

  // Days a new user can use everything before being asked to buy.
  // Saved memories are ALWAYS viewable and exportable, even after the trial.
  trialDays: 7,

  // Paste your Stripe Payment Links (or Gumroad / Lemon Squeezy links) here.
  // In Stripe, set each link's "After payment" redirect to:
  //   https://<your-site>/heartroots/app/?paid=<SKU>
  // Leave a link empty to hide its Buy button.
  checkoutLinks: {
    base: '',
    parent: '',
    kids: '',
    family: '',
    games: '',
    bundle: '',
  },

  // Unlock codes are stored as SHA-256 hashes so they are not readable in the source.
  // Generate one with:  node -e "console.log(require('crypto').createHash('sha256').update('MYCODE').digest('hex'))"
  // (Codes are case-insensitive — they are upper-cased before hashing.)
  //
  // Default friends-and-family code: HEARTROOTS-FAMILY  (unlocks everything, free)
  // Change it before you publish widely!
  unlockCodes: {
    // sha256("HEARTROOTS-FAMILY")
    '1f6ab209bfe0f5c2e429d69d6411b24b88cfdc54b0a081eb195636baf35b629f': ['base', 'parent', 'kids', 'family', 'games'],
  },

  // The code automatically attached to "Share free with family" links.
  // Set to '' to stop giving free links.
  familyGiftCode: 'HEARTROOTS-FAMILY',

  // Optional: URL of your AI story helper (see heartroots/server/README.md).
  // When set, story recaps (summary, highlights, moral, punchlines) are written by Claude.
  // When empty, the app makes a simpler draft on the phone itself.
  aiSummaryUrl: '',

  supportEmail: '',
};
