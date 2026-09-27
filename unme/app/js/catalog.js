// UnMe Shop catalog.
// Each product is a one-time purchase. `sections` are the guides shown on the product page:
// a title, a couple of short lines and a "best for" note.
// Callouts describe the product (time, ages, how many) — never made-up statistics.
import { PACKS } from './content.js';

export const SHOP_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'parenting', label: 'Parenting', emoji: '🧑‍🍼' },
  { id: 'kids', label: 'Kids & Learning', emoji: '🧒' },
  { id: 'teens', label: 'Teens', emoji: '🎧' },
  { id: 'relationships', label: 'Relationships', emoji: '💞' },
  { id: 'money', label: 'Money & Budget', emoji: '💵' },
  { id: 'faith', label: 'Faith', emoji: '🙏' },
  { id: 'daily', label: 'Daily Life', emoji: '🗓️' },
  { id: 'games', label: 'Games', emoji: '🎲' },
];

const fromPack = (k, extra) => ({
  id: k, name: PACKS[k].name, emoji: PACKS[k].emoji, price: PACKS[k].price, tagline: PACKS[k].tagline,
  sections: PACKS[k].guides.map((g) => ({ title: g.title, lines: [g.body] })),
  questions: PACKS[k].questions, ...extra,
});

export const PRODUCTS = [
  fromPack('parent', {
    cat: 'parenting', color: '#2f6fb3',
    subtitle: 'Everyday scripts for connected, calmer parenting',
    callouts: [{ big: '5 min', label: 'a day' }, { big: '4', label: 'guides' }],
  }),
  fromPack('kids', {
    cat: 'kids', color: '#3b8a4f',
    subtitle: 'Feelings, fun questions and "ask a grown-up" interviews',
    callouts: [{ big: '3–10', label: 'ages' }, { big: '6', label: 'kid questions' }],
  }),
  fromPack('family', {
    cat: 'relationships', color: '#b3472f',
    subtitle: 'Reconnect, repair, and care for each other through hard seasons',
    callouts: [{ big: '4', label: 'guides' }, { big: '24/7', label: 'support lines' }],
  }),
  fromPack('games', {
    cat: 'games', color: '#7a4bb3',
    subtitle: 'Three more games for the table or a video call',
    callouts: [{ big: '3', label: 'new games' }, { big: '2–12', label: 'players' }],
    tool: 'games',
  }),
  {
    id: 'budget', cat: 'money', color: '#1f7a6d', emoji: '💵', price: 4.99,
    name: 'Family Budget Kit',
    tagline: 'A simple monthly budget, plus Save / Spend / Give jars for the kids.',
    subtitle: 'Know where the money goes — and teach kids how money works',
    callouts: [{ big: '10 min', label: 'a week' }, { big: '3', label: 'kid jars' }],
    tool: 'budget',
    sections: [
      { title: 'The 50 / 30 / 20 starting point', lines: ['Needs ≈ 50% · Wants ≈ 30% · Saving ≈ 20% of take-home pay.', 'A rule of thumb, not a rule — adjust it to your real life.'], note: 'Best for: families starting their first budget', callouts: [{ big: '50%', label: 'needs' }, { big: '20%', label: 'saving' }] },
      { title: 'The weekly money check-in', lines: ['Same day each week, 10 minutes: what came in, what went out, what\'s coming up.', 'No blame — just numbers and one small decision.'], note: 'Best for: couples and older teens' },
      { title: 'Save · Spend · Give jars', lines: ['Split allowance into three jars so kids see money grow and choose on purpose.', 'Let them make small mistakes with small money.'], note: 'Best for: ages 4–12', callouts: [{ big: '3', label: 'jars' }, { big: '4+', label: 'ages' }] },
      { title: 'Talking money with teens', lines: ['Show them a real bill. Let them plan one grocery trip on a budget.', 'Explain interest with a real example before they get a card.'], note: 'Best for: ages 13+' },
    ],
    questions: ['What did money feel like in the home you grew up in?', 'What is the best money advice you ever got?', 'What is something you saved up for and were proud to buy?'],
  },
  {
    id: 'learn', cat: 'kids', color: '#c98a12', emoji: '🧮', price: 3.99,
    name: 'Little Learners',
    tagline: 'Math flashcard games and simple ways to help with reading and homework.',
    subtitle: 'Short, fun practice that builds confidence',
    callouts: [{ big: '5–10', label: 'ages' }, { big: '10 min', label: 'sessions' }],
    tool: 'flashcards',
    sections: [
      { title: 'Read together, 20 minutes', lines: ['Take turns reading pages. Stop and ask "what do you think happens next?"', 'Re-reading favorites is good for kids — let them.'], note: 'Best for: ages 3–9', callouts: [{ big: '20', label: 'minutes' }] },
      { title: 'Homework without tears', lines: ['Same time, same place, snack first. Help them start, then step back.', 'Praise effort ("you kept trying") more than being "smart".'], note: 'Best for: ages 6–12' },
      { title: 'Grandparent tutors', lines: ['A 10-minute video call to practice times tables or spelling with Grandma.', 'Kids learn, grandparents feel needed — everybody wins.'], note: 'Best for: long-distance families' },
    ],
    questions: ['What was your favorite subject in school?', 'Who taught you to read?'],
  },
  {
    id: 'teens', cat: 'teens', color: '#3d4db3', emoji: '🎧', price: 4.99,
    name: 'Raising Teens',
    tagline: 'Phone and driving agreements, hard-conversation guides and warning signs to know.',
    subtitle: 'Stay close while they grow up',
    callouts: [{ big: '13–19', label: 'ages' }, { big: '1', label: 'phone agreement' }],
    tool: 'agreement',
    sections: [
      { title: 'A phone agreement you build together', lines: ['Agree on phone-free times, where phones sleep, and what happens if rules break.', 'Parents sign it too — and follow it.'], note: 'Best for: a teen\'s first phone', callouts: [{ big: '1', label: 'agreement' }, { big: '2', label: 'signatures' }] },
      { title: 'Conversations in the car', lines: ['Side-by-side talks feel safer than face-to-face. Ask, then wait.', 'Ask about their friends\' opinions first — it\'s easier to answer.'], note: 'Best for: quiet or private teens' },
      { title: 'Warning signs worth a closer look', lines: ['Big changes in sleep, eating, grades, friends, or talking about being a burden.', 'Ask directly and kindly. In the US, call or text 988 any time.'], note: 'Always free: 988 Suicide & Crisis Lifeline' },
      { title: 'Learning to drive', lines: ['Start in empty parking lots. Narrate your own driving for them months before.', 'Agree on rules: passengers, night driving, phones out of reach.'], note: 'Best for: permit year' },
    ],
    questions: ['What is something adults get wrong about your generation?', 'What is stressing you out right now?', 'What do you want to be known for?', 'When do you feel most like yourself?'],
  },
  {
    id: 'faith', cat: 'faith', color: '#8a5a1f', emoji: '🙏', price: 2.99,
    name: 'Faith & Family',
    tagline: 'Gratitude and prayer journal, reflection prompts and ways to pass faith down.',
    subtitle: 'For families of any tradition who want to grow in faith together',
    callouts: [{ big: '5 min', label: 'a day' }, { big: '1', label: 'family journal' }],
    tool: 'journal',
    sections: [
      { title: 'Five minutes of family devotion', lines: ['Read one short passage from your tradition, share one thought, pray or sit quietly.', 'Short and steady beats long and rare.'], note: 'Best for: bedtime or breakfast', callouts: [{ big: '5', label: 'minutes' }] },
      { title: 'Gratitude every day', lines: ['Everyone names one thing they are thankful for. Write them in the family journal.', 'Read old entries on hard days.'], note: 'Best for: all ages' },
      { title: 'Big questions from kids', lines: ['"Where do people go when they die?" — answer honestly, simply, in your beliefs.', '"I don\'t know, but here\'s what I believe" is a good answer.'], note: 'Best for: after a loss' },
      { title: 'Faith across generations', lines: ['Ask grandparents how faith carried them through hard times — record it.', 'Share the prayers, songs and traditions you grew up with.'], note: 'Best for: legacy recording' },
    ],
    questions: ['What does your faith mean to you?', 'When did you feel closest to God, or to something bigger than yourself?', 'What prayer, verse or saying has carried you through hard times?'],
  },
  {
    id: 'organizer', cat: 'daily', color: '#2f7a8a', emoji: '🗓️', price: 3.99,
    name: 'Family Organizer',
    tagline: 'A family chore & project board, weekly meal planner and grocery list.',
    subtitle: 'Less nagging, more teamwork',
    callouts: [{ big: '3', label: 'columns' }, { big: '7', label: 'day meal plan' }],
    tool: 'organizer',
    sections: [
      { title: 'The family board (To do · Doing · Done)', lines: ['Everyone can see what needs doing and who has it. Move cards as you go.', 'Great for chores, school projects and planning trips.'], note: 'Best for: families with kids 5+', callouts: [{ big: '3', label: 'columns' }, { big: 'All', label: 'ages' }] },
      { title: 'The 15-minute family meeting', lines: ['Once a week: wins, problems, plans for the week, one fun thing.', 'Kids take turns running it.'], note: 'Best for: Sunday evenings', callouts: [{ big: '15', label: 'minutes' }] },
      { title: 'Chores by age', lines: ['3–5: toys, feeding pets · 6–9: set table, fold laundry · 10–13: dishes, vacuum · 14+: cook a meal, mow.', 'Kids rise to what we expect of them.'], note: 'Best for: building responsibility' },
    ],
  },
  {
    id: 'together', cat: 'relationships', color: '#b3336b', emoji: '💞', price: 3.99,
    name: 'Stronger Together',
    tagline: 'Communication skills, apologies that work, date nights and reconnecting with family.',
    subtitle: 'Small habits that build close relationships',
    callouts: [{ big: '5', label: 'guides' }, { big: '12', label: 'closeness questions' }],
    sections: [
      { title: 'Listen to understand', lines: ['Repeat back what you heard before you answer: "So you felt…"', 'Put the phone face down. Eye contact says "you matter."'], note: 'Best for: every conversation' },
      { title: 'An apology that works', lines: ['1) Name what you did. 2) Say how it affected them. 3) Say what you will do differently.', 'No "but". No "if you were hurt".'], note: 'Best for: after an argument', callouts: [{ big: '3', label: 'steps' }] },
      { title: 'Date night on any budget', lines: ['Walk and talk, cook together, stargaze, replay your first date.', 'Put it on the calendar — protect it.'], note: 'Best for: couples' },
      { title: 'Reconnecting with distant family', lines: ['Send a photo and a memory, not a guilt trip. Keep the first message short and warm.', 'Invite them into UnMe with the free family link.'], note: 'Best for: estranged or far-away relatives' },
      { title: 'Long-distance grandparents', lines: ['A standing weekly video call, reading bedtime stories over video, mailing drawings.', 'Use Story Time to swap stories both ways.'], note: 'Best for: grandkids far away' },
    ],
    questions: ['What is a small thing I do that makes you feel loved?', 'What is one thing you wish we did together more?', 'When did you feel proudest of our family?', 'What is something you have never told me?', 'What would your perfect day with me look like?', 'What do you need more of from me?', 'What is your favorite memory of us?', 'How do you like to be comforted when you are sad?', 'What is a dream you have not told many people?', 'What are you grateful for about our relationship?', 'What is a tradition you want us to start?', 'What song reminds you of us?'],
  },
];

export const BUNDLE = { id: 'bundle', name: 'Everything Bundle', price: 19.99, emoji: '🎁', tagline: 'Every pack in the shop, now and future updates.' };

export const product = (id) => PRODUCTS.find((p) => p.id === id);
