# 🌳 UnMe: family stories and memories

**UnMe** ("U n Me", you and me) is a family memory app that looks and feels like TikTok. Each time someone opens it, they answer one or two questions their family has always wanted to know. They can also record short videos and voice memories, write stories and sealed letters, build a family tree, chat, and play family games. Everything they share goes into a **memory book** that the family can come back to at any time, including after that person has passed.

- **Sales page:** `unme/index.html` → `https://poddnahh.github.io/Landing001/unme/`
- **The app:** `unme/app/` → `https://poddnahh.github.io/Landing001/unme/app/`

The app is a Progressive Web App (PWA). People open the link on any phone and tap **Add to Home Screen**. It then runs like a normal app, including offline. Nobody needs an app store account, and there is no 30% store cut.

---

## Using it with your dad today

1. On your phone, open the app link and create your profile.
2. Go to the **Family** tab → **＋ Add**, add "Dad", and tick **"They'll use this device too"**.
3. Tap Dad to open his profile and tap **🕯️ Legacy**. There are 12 gentle questions. Tap **🎙️ Voice** or **🎥 Video** and let him talk. Speaking is much easier than typing when someone is tired.
4. Use **❓ Ask a question** on Dad's profile to send him anything you have always wanted to know. It shows up first on his home screen.
5. Tap **🎬 Story time** on Dad's profile and let him tell his favourite stories on video, like a FaceTime call. You'll get a recap with the highlights, the moral and his best lines.
6. On **Profile → ☰ menu → Backup & share family file**, save a family file regularly. Also tap **⬇️ Save** in Dad's memory book. That gives you a single file with every answer, video and voice note, and it opens in any browser forever.

Memories are stored **on the device**. Back up often, and send the family file to siblings so they have a copy too.

---

## Features

| Area | What it does |
|---|---|
| Daily questions | 1–2 per visit from 80+ questions in 11 categories. Questions sent by family always come first. You can answer by typing, voice or video. |
| Legacy Interview | 12 guided life-story questions that you can record for yourself or for someone else |
| All about me | Bio, things I love, things I can't stand |
| Feelings | Daily mood check-in, "what's troubling you", an **"I need help"** alert shown to family, and crisis/support lines (988, the American Cancer Society helpline, Crisis Text Line) |
| **Story Time** | Tell a story on a FaceTime-style selfie video or by voice (up to 10 min). Live captions are written as they talk. Afterwards a **recap** shows the summary, highlights (tap to jump to that moment), the moral of the story and the punchlines, and everything can be edited. Family can watch or listen with captions. The recap is drafted on the phone, or by Claude if the [AI helper](server/README.md) is deployed. Voice and video answers to questions are transcribed too. |
| Layout (Facebook + TikTok) | Floating bottom bar: **Home · Watch · Family · ＋ · Shop · Alerts · Me**, with a Messenger-style **Chats** button at the top of each page. |
| Home | Facebook-style feed: "Tell your family something…", tall story cards (with **Birthday** badges), today's questions, how you're feeling, shortcuts, and family posts as cards with **Like · Comment · Share**. A question pops up once a day until it's answered. |
| Watch | TikTok-style full-screen video feed you swipe up through, with ❤️ like, 💬 comment, 🔖 save and ↗ share down the right side. Tap to pause. |
| Camera (＋) | Full-screen camera with **10m / 60s / 15s / PHOTO / TEXT**, flip, a 3-second timer, live captions and "Add a question" (shown on screen while you talk). CAMERA · VOICE · CREATE modes. Recordings longer than a minute become a Story Time recap automatically. |
| Me (profile) | Facebook-style: **cover photo**, big round **profile picture** (tap 📷 to change either), name, family / memories / likes counts, work and where they live, family faces, **Memory book** and **＋ Create** buttons, filter pills (All · Videos · Answers · Photos · Letters · Saved · Liked), **Personal details** (lives in, from, birthday, work), About, then a TikTok-style grid with play counts and 📌 pinned posts. Anyone's profile opens the same way. |
| Family | Like Facebook Friends: pills for **Your family · Birthdays · Family tree · Memory books**, story cards, a list with Message / Ask buttons, and upcoming birthdays with a one-tap **🎥 Birthday video**. |
| Alerts | Like Facebook Notifications, split into **New** and **Earlier**: new stories and memories, likes, comments, answers to your questions, questions waiting for you, help requests, birthdays and letters. |
| Chats | Story circles, one-on-one and group chats, and 🎥 video messages |
| Search | Find memories, family members and shop items |
| Memory books | Everyone's memories grouped by theme. Can be exported as one standalone HTML file. |
| Letters for later | Sealed until a date or occasion (graduation, wedding, "when you miss me") |
| Games | How Well Do You Know…? (built from real answers) and Would You Rather. **Paid pack:** Family Trivia (built from the tree), Two Truths & a Lie, Story Chain. |
| **Shop** (paid, one-time) | **Digital Parent Help** $4.99 · **Children Help** $4.99 · **Family Help** $4.99 (reconnecting, illness and grief) · **Family Game Night** $2.99 · **Family Budget Kit** $4.99 (budget planner with a spending chart, plus kids' Save/Spend/Give jars) · **Little Learners** $3.99 (math flashcards, reading and homework help) · **Raising Teens** $4.99 (phone agreement builder, driving, warning signs) · **Faith & Family** $2.99 (gratitude and prayer journal, devotion guides for any tradition) · **Family Organizer** $3.99 (chore board To do / Doing / Done, meal planner and grocery list) · **Stronger Together** $3.99 (listening, apologies, date nights, reconnecting). **Everything Bundle** $19.99. Prices and content are in `app/js/catalog.js`. |
| Text & display (Aa button) | Four text sizes, easy-read letters (Atkinson Hyperlegible, designed for low vision), bold text, extra contrast, less motion, and 🔊 read-aloud buttons for questions. One-tap presets: "Easy on the eyes" for older eyes and "Kid friendly". Settings are saved per person, so Grandpa can have huge text while the kids keep normal. All colors meet the WCAG AA contrast standard (at least 4.5:1). |
| Profiles | Several family members can share one phone or tablet |
| Backup and sync | Export and import a family file. Imports merge without creating duplicates. |

**Pricing built in:** a 7-day free trial, then **$10 one time** for the base app, plus one-time Shop items ($2.99–$4.99, or $19.99 for everything). Viewing and exporting saved memories is never locked. That matters for a grief product, and it builds trust.

---

## Going live and getting paid

### 1. Publish (free)
The repo already uses GitHub Pages, so pushing this folder to the branch Pages serves from (usually `main`) makes it live.

### 2. Accept payments with Stripe Payment Links (no code)
1. Create a Stripe account → **Payment Links** → create one per product: UnMe $10, each Shop item, and the Everything Bundle.
2. For each link, open **After payment → Don't show confirmation page → Redirect** and set the URL to:
   `https://poddnahh.github.io/Landing001/unme/app/?paid=base`
   For Shop items use the product id: `paid=parent`, `kids`, `family`, `games`, `budget`, `learn`, `teens`, `faith`, `organizer`, `together`, or `paid=bundle` for everything.
3. Paste the links into `unme/app/js/config.js` under `checkoutLinks`. The Buy buttons appear automatically.

> ⚠️ **Be honest with yourself about this:** there is no server yet, so a tech-savvy person could unlock the app by typing `?paid=base` into the address bar themselves. That is acceptable while you launch to friends-of-friends. Before large-scale marketing, move to server-verified purchases (see the roadmap below) or ship through the app stores, where Apple/Google handle this.

### 3. Share free with family and friends
- The default gift code is **`UNME-FAMILY`**. It unlocks everything.
- In the app, **📤 → Send free family link** creates a link with the code built in. The person who opens it gets full access and sees "Your family gave you UnMe for free!"
- **Recommend to a friend** sends people to the sales page to buy. It adds `?ref=YourName` so you can see who referred whom.
- **Change the code before sharing widely.** Pick a new one, then generate its hash:
  ```
  node -e "console.log(require('crypto').createHash('sha256').update('YOURNEWCODE').digest('hex'))"
  ```
  Put the hash in `unlockCodes` and the plain code in `familyGiftCode`. You can add as many codes as you like, for example one per influencer, or a code that only unlocks the games.

---

## Roadmap: becoming a real social network

Right now, everything is stored privately on each device, and families sync by sharing the family file. To get live chat and feeds across different phones (the TikTok/Facebook experience), you need a backend. Here is the recommended path:

1. **Accounts and cloud sync with Supabase (free tier to start).** Supabase provides authentication (email or phone login), a Postgres database, and file storage for videos. Every read and write in the app already goes through `app/js/db.js`, so a Supabase version of that file is the main change. Tables map one-to-one onto the current stores: `people`, `posts`, `moods`, `chats`, `messages`, `letters`, `media`. Add a `families` table and row-level security so each family only sees its own data.
2. **Realtime chat and push notifications**, for example "Dad answered a question" or "Dad asked for help". Use Supabase Realtime and Web Push.
3. **Server-verified payments:** a Stripe webhook marks the purchase on the user's account.
4. **App Store and Google Play:** wrap the app with **Capacitor** (`npx cap add ios android`). Apple requires its own In-App Purchase for digital unlocks (RevenueCat makes this easy).
5. **Moderation and safety:** for a public network you need report/block tools, age gating for under-13s (COPPA), plus a privacy policy and terms. Keeping it family-only, which is the current design, keeps this much simpler.

---

## Files

```
unme/
  index.html              Sales page
  app/
    index.html            App shell
    styles.css            Design (light and dark mode)
    manifest.webmanifest  Makes it installable
    sw.js                 Offline support
    icon.svg, icon-*.png  App icons
    js/config.js          ← YOUR settings: price, payment links, gift codes
    js/content.js         All questions, packs and games (edit freely)
    js/db.js              On-device storage, backup and import
    js/app.js             The app
  server/                 Optional AI story-recap helper (Cloudflare Worker + Claude)
```

To add questions, add lines to `DAILY_QUESTIONS` in `content.js`. Always add them **at the end of the list**: the IDs are based on position, so inserting in the middle would mix up which question an existing answer belongs to.

To test locally, run `python3 -m http.server` in the repo folder and open `http://localhost:8000/unme/app/`.
