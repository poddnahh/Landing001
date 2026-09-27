// UnMe content: question banks, guided interviews, help packs and game decks.
// Every question has a stable id so answers can be matched back to it.

export const CATEGORIES = {
  childhood: { label: 'Growing up', emoji: '🧸' },
  family: { label: 'Family roots', emoji: '🌳' },
  love: { label: 'Love & friendship', emoji: '💞' },
  work: { label: 'Work & dreams', emoji: '🛠️' },
  favorites: { label: 'Favorites', emoji: '⭐' },
  dislikes: { label: 'Pet peeves', emoji: '🙅' },
  feelings: { label: 'How I feel', emoji: '🌤️' },
  wisdom: { label: 'Life lessons', emoji: '🦉' },
  secrets: { label: 'Things you never knew', emoji: '🔐' },
  legacy: { label: 'My legacy', emoji: '🕯️' },
  fun: { label: 'Just for fun', emoji: '🎈' },
};

// The daily bank: 1–2 of these are asked every time the app is opened.
export const DAILY_QUESTIONS = [
  // Growing up
  ['childhood', 'What is your very first memory?'],
  ['childhood', 'What did your childhood home look, sound and smell like?'],
  ['childhood', 'Who was your best friend as a kid, and what did you get up to?'],
  ['childhood', 'What was the naughtiest thing you did as a child? Did you get caught?'],
  ['childhood', 'What did you want to be when you grew up?'],
  ['childhood', 'What was a normal Saturday like when you were ten?'],
  ['childhood', 'What was your favorite toy or game growing up?'],
  ['childhood', 'Which teacher do you still remember, and why?'],
  ['childhood', 'What was the first song you remember loving?'],
  ['childhood', 'What chores did you have as a kid?'],
  // Family roots
  ['family', 'What do you know about where our family came from?'],
  ['family', 'Describe your mother in three words, then tell a story that shows it.'],
  ['family', 'Describe your father in three words, then tell a story that shows it.'],
  ['family', 'What family tradition do you hope never dies?'],
  ['family', 'What is a family recipe you love? How is it made?'],
  ['family', 'What did your grandparents do for a living?'],
  ['family', 'What is a family story that always gets retold at gatherings?'],
  ['family', 'What is the funniest thing that ever happened at a family holiday?'],
  ['family', 'Which relative were you closest to growing up?'],
  // Love & friendship
  ['love', 'How did you meet the great loves of your life?'],
  ['love', 'What was your first date like?'],
  ['love', 'Who is a friend that changed your life?'],
  ['love', 'What does love look like to you, day to day?'],
  ['love', 'What is the most romantic thing anyone has done for you?'],
  ['love', 'What makes a friendship last?'],
  // Work & dreams
  ['work', 'What was your very first job and what did it pay?'],
  ['work', 'What work are you most proud of?'],
  ['work', 'If money did not matter, what would you have done with your life?'],
  ['work', 'What is a dream you still have?'],
  ['work', 'What was the hardest decision you ever made about your career?'],
  // Favorites
  ['favorites', 'What is your all-time favorite meal?'],
  ['favorites', 'What is your favorite movie and why?'],
  ['favorites', 'What song would you want played to remember you?'],
  ['favorites', 'What is your favorite place you have ever been?'],
  ['favorites', 'What is your favorite season and what do you love about it?'],
  ['favorites', 'What is your favorite smell, and what does it remind you of?'],
  ['favorites', 'What is your favorite way to spend a lazy afternoon?'],
  ['favorites', 'Which book, show or story has stuck with you the most?'],
  ['favorites', 'What is your favorite holiday and how do you like to celebrate it?'],
  ['favorites', 'What is your go-to snack?'],
  // Pet peeves
  ['dislikes', 'What is your biggest pet peeve?'],
  ['dislikes', 'What food will you never eat?'],
  ['dislikes', 'What is something people always get wrong about you?'],
  ['dislikes', 'What is a chore you absolutely hate?'],
  ['dislikes', 'What trend did you never understand?'],
  // Feelings
  ['feelings', 'What has been on your mind the most this week?'],
  ['feelings', 'What is something that is worrying you right now?'],
  ['feelings', 'What made you smile today?'],
  ['feelings', 'What do you wish your family asked you about more often?'],
  ['feelings', 'When do you feel most at peace?'],
  ['feelings', 'What is something you need more of right now?'],
  ['feelings', 'Is there anything you need help with that you have not asked for?'],
  ['feelings', 'What are you grateful for today?'],
  // Wisdom
  ['wisdom', 'What is the best advice anyone ever gave you?'],
  ['wisdom', 'What do you know now that you wish you knew at 20?'],
  ['wisdom', 'What is a mistake that taught you something important?'],
  ['wisdom', 'How do you get through hard times?'],
  ['wisdom', 'What does a good life mean to you?'],
  ['wisdom', 'What do you believe about faith, spirit or what comes after?'],
  ['wisdom', 'What is something you changed your mind about as you got older?'],
  // Things you never knew
  ['secrets', 'What is something about you that would surprise your family?'],
  ['secrets', 'What is the bravest thing you have ever done?'],
  ['secrets', 'What is a talent you have that nobody knows about?'],
  ['secrets', 'What is a moment you have never told anyone about?'],
  ['secrets', 'What was the scariest moment of your life?'],
  ['secrets', 'Who did you have a crush on that nobody knew about?'],
  ['secrets', 'What is the wildest adventure you ever went on?'],
  // Legacy
  ['legacy', 'What do you want your family to always remember about you?'],
  ['legacy', 'What are you most proud of in your life?'],
  ['legacy', 'What do you hope your children and grandchildren carry forward?'],
  ['legacy', 'Is there anything you want to say sorry for, or thank someone for?'],
  ['legacy', 'What values do you hope run through this family forever?'],
  // Fun
  ['fun', 'If you could have dinner with anyone, living or not, who would it be?'],
  ['fun', 'What is the funniest thing that has ever happened to you?'],
  ['fun', 'What superpower would you pick and why?'],
  ['fun', 'What would your perfect day look like from start to finish?'],
  ['fun', 'What is your signature dance move?'],
  ['fun', 'What is the best joke you know?'],
].map(([category, text], i) => ({ id: `d${i + 1}`, category, text }));

// A guided, gentle interview for someone who wants to leave their story behind.
// Inspired by the question themes used in dignity-centered legacy work.
export const LEGACY_INTERVIEW = [
  'Tell me a little about your life story — especially the parts you remember most or think are the most important.',
  'When did you feel most alive?',
  'Are there specific things you want your family to know about you, or to remember about you?',
  'What are the most important roles you have played in life — as a parent, partner, friend, worker?',
  'What are your most important accomplishments, and what do you feel most proud of?',
  'Are there things you feel still need to be said to your loved ones, or things you would like to say again?',
  'What are your hopes and dreams for your loved ones?',
  'What have you learned about life that you would want to pass along to others?',
  'What advice or words of guidance would you give your children and grandchildren?',
  'Are there words or instructions you would like to offer your family to help prepare them for the future?',
  'How would you like to be remembered?',
  'Is there anything else you would like included in your story?',
].map((text, i) => ({ id: `L${i + 1}`, category: 'legacy', text }));

// Letters that can be sealed until a future occasion.
export const LETTER_OCCASIONS = [
  'Your birthday', 'Your graduation', 'Your wedding day', 'When you become a parent',
  'When you are having a hard day', 'When you miss me', 'Holidays', 'Just because',
];

// Paid add-on packs. Each unlocks question decks and guides.
export const PACKS = {
  parent: {
    name: 'Digital Parent Help',
    emoji: '🧑‍🍼',
    price: 4.99,
    tagline: 'Conversation starters, check-in scripts and screen-time tools for parents.',
    guides: [
      { title: 'The 5-minute bedtime check-in', body: 'Ask three things every night: "What was the best part of today? What was hard? What are you looking forward to?" Listen more than you talk. Do not fix — reflect back what you heard.' },
      { title: 'Talking to teens without the eye-roll', body: 'Side-by-side beats face-to-face. Car rides, cooking and walks lower the pressure. Ask about their friends\' opinions before theirs — it is easier to answer.' },
      { title: 'Setting screen-time together', body: 'Make a family media plan with your kids, not for them. Agree on phone-free zones (meals, bedrooms) and let kids help set consequences. Parents follow the plan too.' },
      { title: 'When your child is struggling', body: 'Name it, normalize it, stay near. "It sounds like you are really overwhelmed. That makes sense. I am here." If you see signs of self-harm or hopelessness, contact your pediatrician or call/text 988 (US).' },
    ],
    questions: [
      'What is something you wish I understood better about you?',
      'Who at school makes you feel good about yourself?',
      'What is one rule you think is unfair, and why?',
      'What is an app or game you love that I should try?',
      'When do you feel closest to me?',
      'What is something you are worried about but have not said out loud?',
    ],
  },
  kids: {
    name: 'Children Help',
    emoji: '🧒',
    price: 4.99,
    tagline: 'Kid-friendly questions, a feelings check-in and "Ask a grown-up" prompts.',
    guides: [
      { title: 'Feelings wheel', body: 'Help kids name feelings: happy, excited, calm, proud, silly — sad, worried, mad, scared, lonely. Tap the matching emoji when you check in. There are no wrong feelings.' },
      { title: 'Ask a grown-up', body: 'Kids interview grandparents: "What games did you play? What was school like? What did you get in trouble for?" Record it as a video so it lives forever.' },
      { title: 'Big feelings plan', body: 'Make a plan together: 1) Breathe like blowing out birthday candles. 2) Squeeze a pillow. 3) Find a safe grown-up. 4) Use words: "I feel ___ because ___."' },
    ],
    questions: [
      'If you could be any animal, what would you be?',
      'What makes you laugh the hardest?',
      'What is the best present you ever got?',
      'If you could invent something, what would it be?',
      'What do you love most about our family?',
      'Grandma or Grandpa, what was your favorite toy?',
    ],
  },
  family: {
    name: 'Family Help',
    emoji: '🏡',
    price: 4.99,
    tagline: 'Repair, reconnect and care for each other — including through illness and loss.',
    guides: [
      { title: 'Reaching out to a distant relative', body: 'Start small and warm: "I was thinking about you and remembered ___. How have you been?" No pressure, no past arguments. Send a photo or a memory — it opens doors.' },
      { title: 'Repairing after a conflict', body: 'Own your part in one sentence without "but". Ask what they needed that they did not get. Agree on one small thing to do differently.' },
      { title: 'When someone you love is seriously ill', body: 'Time together matters more than the right words. Ask them what matters to them now. Record their voice — even ordinary conversations become treasures. Use the Legacy Interview when they have the energy, a few questions at a time. American Cancer Society helpline (US): 1-800-227-2345, 24/7.' },
      { title: 'Grief and remembering', body: 'Grief is love with nowhere to go — give it somewhere. Revisit their Memory Book, answer questions about them, and share stories on anniversaries. It is okay to laugh.' },
    ],
    questions: [
      'What is a family memory you want to relive?',
      'Who in the family do you wish you talked to more?',
      'What does our family do really well together?',
      'Is there something between us that needs to be said?',
      'How can this family support you right now?',
    ],
  },
  games: {
    name: 'Family Game Night',
    emoji: '🎲',
    price: 2.99,
    tagline: 'Unlocks Family Trivia, Two Truths & a Lie and Story Chain.',
    guides: [],
    questions: [],
  },
};

export const WOULD_YOU_RATHER = [
  ['Live without music', 'Live without movies'],
  ['Have a pet dragon', 'Have a pet unicorn'],
  ['Go back in time to meet our ancestors', 'Go forward to meet our great-grandkids'],
  ['Only eat Grandma\'s cooking forever', 'Eat anything at any restaurant'],
  ['Be able to fly', 'Be able to talk to animals'],
  ['Have a family reunion on a beach', 'Have it in a snowy cabin'],
  ['Know every language', 'Play every instrument'],
  ['Never do dishes again', 'Never do laundry again'],
  ['Live in the city', 'Live on a farm'],
  ['Relive your favorite day', 'See one day of your future'],
  ['Be famous', 'Be secretly rich'],
  ['Road trip with the whole family', 'Fancy vacation with just two people'],
];

export const STORY_STARTERS = [
  'Once upon a time, in a very small town, our family found a mysterious box in the attic…',
  'The day Grandpa accidentally became famous started like any other…',
  'Nobody expected the family dog to win the election, but…',
  'On the first night of the camping trip, we heard a strange sound…',
];

// Mood check-in scale.
export const MOODS = [
  { key: 'great', emoji: '😄', label: 'Great', short: 'Great' },
  { key: 'good', emoji: '🙂', label: 'Good', short: 'Good' },
  { key: 'okay', emoji: '😐', label: 'Okay', short: 'Okay' },
  { key: 'low', emoji: '😔', label: 'Low', short: 'Low' },
  { key: 'hard', emoji: '😢', label: 'Having a hard time', short: 'Hard' },
];

export const RELATIONS = [
  'Me', 'Mom', 'Dad', 'Grandma', 'Grandpa', 'Son', 'Daughter', 'Sister', 'Brother',
  'Wife', 'Husband', 'Partner', 'Aunt', 'Uncle', 'Cousin', 'Niece', 'Nephew',
  'Grandson', 'Granddaughter', 'Step-parent', 'Friend', 'Other',
];

export const AVATAR_EMOJI = ['🙂', '👵', '👴', '👩', '👨', '🧒', '👧', '👦', '👶', '🧔', '👩‍🦳', '👨‍🦳', '🧑‍🦱', '🐶', '🌻', '⭐'];

// Story Time: prompts for recorded stories (selfie video or voice).
export const STORY_PROMPTS = [
  'How I met the love of my life',
  'The time I got in the most trouble',
  'The best trip I ever took',
  'How I got my first job',
  'The funniest thing that ever happened in our family',
  'The day you were born',
  'A time I was really scared',
  'The story behind my name',
  'A story my parents used to tell me',
  'The biggest risk I ever took',
  'My proudest moment',
  'A lesson I learned the hard way',
];
