// ─────────────────────────────────────────────────────────────
//  UnMe — owner settings. Edit this file to go live.
// ─────────────────────────────────────────────────────────────
export const CONFIG = {
  appName: 'UnMe',

  // Price shown for the lifetime unlock.
  basePrice: 10,

  // Days a new user can use everything before being asked to buy.
  // Saved memories are ALWAYS viewable and exportable, even after the trial.
  trialDays: 7,

  // Paste your Stripe Payment Links (or Gumroad / Lemon Squeezy links) here.
  // In Stripe, set each link's "After payment" redirect to:
  //   https://<your-site>/unme/app/?paid=<product id>
  // Leave a link empty to hide its Buy button.
  // Marketplace product ids: parent, kids, family, games, budget, learn, teens, faith, organizer, together.
  checkoutLinks: {
    base: '',
    bundle: '',
    parent: '', kids: '', family: '', games: '',
    budget: '', learn: '', teens: '', faith: '', organizer: '', together: '',
  },

  // Unlock codes are stored as SHA-256 hashes so they are not readable in the source.
  // Generate one with:  node -e "console.log(require('crypto').createHash('sha256').update('MYCODE').digest('hex'))"
  // (Codes are case-insensitive — they are upper-cased before hashing.)
  //
  // Default friends-and-family code: UNME-FAMILY  (unlocks everything, free)
  // Change it before you publish widely!
  unlockCodes: {
    // '*' unlocks everything. You can also list product ids, e.g. ['games', 'budget'].
    // sha256("UNME-FAMILY")
    '7072c2d8a4f77e88d87626a14a5252eb03f9ce06103002e3d7fa1d40e515e9c6': ['*'],
  },

  // The code automatically attached to "Share free with family" links.
  // Set to '' to stop giving free links.
  familyGiftCode: 'UNME-FAMILY',

  // Optional: URL of your AI story helper (see unme/server/README.md).
  // When set, story recaps (summary, highlights, moral, punchlines) are written by Claude.
  // When empty, the app makes a simpler draft on the phone itself.
  aiSummaryUrl: '',

  supportEmail: '',
};
