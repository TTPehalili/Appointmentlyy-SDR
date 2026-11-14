/**
 * Team chat emoji set: the picker's categories, search names and the allow-list the server checks
 * reactions against. Shared by the browser and the server (no 'use client', no server imports).
 *
 * Kept to Emoji 12 or older with no ZWJ sequences, so every one renders as a single glyph on
 * Windows 10, macOS, Android and iOS. Each entry: [emoji, short name, extra search words].
 */

export type EmojiCategoryId = 'smileys' | 'people' | 'celebration' | 'work' | 'symbols' | 'nature';

export interface EmojiEntry {
  emoji: string;
  /** Short English name, also the :shortcode: with spaces as underscores. */
  name: string;
  /** Lowercase words to search on (name words plus synonyms). */
  words: string[];
  category: EmojiCategoryId;
}

export interface EmojiCategory {
  id: EmojiCategoryId;
  label: string;
  /** Shown on the category tab. */
  icon: string;
  emojis: EmojiEntry[];
}

type Raw = [string, string, string?];

const RAW: { id: EmojiCategoryId; label: string; icon: string; list: Raw[] }[] = [
  {
    id: 'smileys',
    label: 'Smileys',
    icon: '😀',
    list: [
      ['😀', 'grinning', 'happy smile'],
      ['😃', 'smiley', 'happy'],
      ['😄', 'smile', 'happy'],
      ['😁', 'grin', 'happy teeth'],
      ['😆', 'laughing', 'lol haha'],
      ['😅', 'sweat smile', 'phew nervous'],
      ['🤣', 'rofl', 'rolling laughing lol'],
      ['😂', 'joy', 'tears laugh lol haha'],
      ['🙂', 'slightly smiling', 'smile'],
      ['🙃', 'upside down', 'silly sarcasm'],
      ['😉', 'wink', ''],
      ['😊', 'blush', 'happy smile'],
      ['😇', 'innocent', 'halo angel'],
      ['🥰', 'smiling with hearts', 'love adore'],
      ['😍', 'heart eyes', 'love'],
      ['🤩', 'star struck', 'wow amazing'],
      ['😘', 'kiss', 'love'],
      ['😋', 'yum', 'tasty delicious'],
      ['😛', 'tongue out', 'playful'],
      ['😜', 'winking tongue', 'crazy playful'],
      ['🤪', 'zany', 'crazy goofy'],
      ['🤗', 'hug', 'hugging'],
      ['🤭', 'hand over mouth', 'oops giggle'],
      ['🤫', 'shush', 'quiet secret'],
      ['🤔', 'thinking', 'hmm wonder'],
      ['🤐', 'zipper mouth', 'secret quiet'],
      ['🤨', 'raised eyebrow', 'skeptical suspicious'],
      ['😐', 'neutral', 'meh'],
      ['😑', 'expressionless', 'blank meh'],
      ['😶', 'no mouth', 'speechless'],
      ['😏', 'smirk', 'smug'],
      ['🙄', 'eye roll', 'whatever'],
      ['😬', 'grimace', 'awkward eek'],
      ['😌', 'relieved', 'calm'],
      ['😔', 'pensive', 'sad'],
      ['😪', 'sleepy', 'tired'],
      ['🥱', 'yawning', 'tired bored'],
      ['😴', 'sleeping', 'tired zzz'],
      ['😷', 'mask', 'sick ill'],
      ['🤒', 'sick', 'thermometer ill'],
      ['🥵', 'hot face', 'heat sweating'],
      ['🥶', 'cold face', 'freezing'],
      ['🤯', 'mind blown', 'exploding head shocked'],
      ['🤠', 'cowboy', 'yeehaw'],
      ['😎', 'sunglasses', 'cool'],
      ['🤓', 'nerd', 'geek smart'],
      ['🧐', 'monocle', 'inspect curious'],
      ['😕', 'confused', 'unsure'],
      ['😟', 'worried', 'concerned'],
      ['😮', 'open mouth', 'surprised wow'],
      ['😲', 'astonished', 'shocked wow'],
      ['🥺', 'pleading', 'puppy eyes please'],
      ['😢', 'cry', 'sad tear'],
      ['😭', 'sob', 'crying sad'],
      ['😱', 'scream', 'shocked fear'],
      ['😤', 'huff', 'triumph determined'],
      ['😡', 'angry', 'mad rage'],
      ['🤬', 'swearing', 'cursing angry'],
      ['😈', 'smiling devil', 'evil mischief'],
      ['💀', 'skull', 'dead lol'],
      ['🤡', 'clown', 'silly'],
      ['🤑', 'money mouth', 'rich cash'],
    ],
  },
  {
    id: 'people',
    label: 'Gestures & people',
    icon: '👍',
    list: [
      ['👍', 'thumbs up', '+1 yes like good approve'],
      ['👎', 'thumbs down', '-1 no dislike bad'],
      ['👌', 'ok hand', 'okay perfect'],
      ['✌️', 'victory', 'peace two'],
      ['🤞', 'crossed fingers', 'luck hope'],
      ['🤟', 'love you gesture', 'ily'],
      ['🤘', 'rock on', 'horns metal'],
      ['🤙', 'call me', 'shaka hang loose phone'],
      ['👈', 'point left', 'backhand'],
      ['👉', 'point right', 'backhand'],
      ['👆', 'point up', 'backhand'],
      ['👇', 'point down', 'backhand'],
      ['☝️', 'index up', 'one point'],
      ['✋', 'raised hand', 'high five stop'],
      ['🖐️', 'hand splayed', 'five fingers'],
      ['👋', 'wave', 'hello hi bye'],
      ['👏', 'clap', 'applause bravo well done'],
      ['🙌', 'raised hands', 'hooray celebrate praise'],
      ['👐', 'open hands', 'jazz hands'],
      ['🤲', 'palms up', 'please offer'],
      ['🤝', 'handshake', 'deal agreement partner'],
      ['🙏', 'pray', 'thanks thank you please'],
      ['✍️', 'writing hand', 'write sign'],
      ['💪', 'muscle', 'strong flex power'],
      ['👀', 'eyes', 'look watching see'],
      ['🧠', 'brain', 'smart think'],
      ['👂', 'ear', 'listen hear'],
      ['🗣️', 'speaking head', 'talk pitch'],
      ['👥', 'people', 'team group'],
      ['🙋', 'raising hand', 'me question volunteer'],
      ['🙆', 'ok person', 'yes fine'],
      ['🙅', 'no person', 'stop nope'],
      ['🤷', 'shrug', 'dunno whatever'],
      ['🤦', 'facepalm', 'doh ugh'],
      ['🙇', 'bow', 'sorry respect'],
      ['💁', 'tipping hand', 'info sassy'],
      ['🏃', 'running', 'run hurry fast'],
      ['💃', 'dancing', 'dance party'],
      ['🕺', 'man dancing', 'dance party'],
      ['🧘', 'meditating', 'calm zen'],
    ],
  },
  {
    id: 'celebration',
    label: 'Celebration',
    icon: '🎉',
    list: [
      ['🎉', 'tada', 'party celebrate congrats hooray'],
      ['🎊', 'confetti', 'party celebrate'],
      ['🥳', 'partying face', 'party celebrate birthday'],
      ['🔥', 'fire', 'lit hot flame on fire'],
      ['🏆', 'trophy', 'winner win champion'],
      ['🥇', 'first place', 'gold medal winner'],
      ['🥈', 'second place', 'silver medal'],
      ['🥉', 'third place', 'bronze medal'],
      ['🏅', 'medal', 'sports award'],
      ['💯', 'hundred', '100 perfect score'],
      ['🚀', 'rocket', 'launch ship fast growth'],
      ['⭐', 'star', 'favourite favorite'],
      ['🌟', 'glowing star', 'shine superstar'],
      ['✨', 'sparkles', 'shiny magic new'],
      ['💥', 'boom', 'collision bang'],
      ['🎯', 'bullseye', 'target direct hit goal'],
      ['🎈', 'balloon', 'party birthday'],
      ['🎁', 'gift', 'present surprise'],
      ['🍾', 'champagne', 'bottle celebrate'],
      ['🥂', 'cheers', 'clinking glasses toast'],
      ['🍻', 'beers', 'cheers toast'],
      ['🎂', 'birthday cake', 'cake party'],
      ['🔔', 'bell', 'win ring booked'],
      ['📣', 'megaphone', 'announce shout'],
      ['🏁', 'chequered flag', 'finish race done'],
      ['👑', 'crown', 'king queen royal'],
      ['💎', 'gem', 'diamond precious'],
      ['⚡', 'lightning', 'zap fast power'],
      ['🎶', 'music', 'notes song'],
      ['🍀', 'four leaf clover', 'luck lucky'],
    ],
  },
  {
    id: 'work',
    label: 'Work & sales',
    icon: '📞',
    list: [
      ['📞', 'telephone receiver', 'phone call dial'],
      ['☎️', 'telephone', 'phone call'],
      ['📱', 'mobile phone', 'cell call text'],
      ['🎧', 'headphones', 'headset listen'],
      ['💻', 'laptop', 'computer'],
      ['🖥️', 'desktop computer', 'monitor screen'],
      ['⌨️', 'keyboard', 'typing'],
      ['📧', 'email', 'e-mail mail'],
      ['✉️', 'envelope', 'mail letter'],
      ['📨', 'incoming envelope', 'mail inbox'],
      ['📅', 'calendar', 'date meeting booked appointment'],
      ['📆', 'tear-off calendar', 'date schedule'],
      ['🗓️', 'spiral calendar', 'schedule plan'],
      ['⏰', 'alarm clock', 'time reminder wake'],
      ['⏱️', 'stopwatch', 'timer fast'],
      ['⏳', 'hourglass', 'waiting time pending'],
      ['⌛', 'hourglass done', 'time up'],
      ['💰', 'money bag', 'cash revenue deal'],
      ['💵', 'dollar', 'money cash bills'],
      ['💸', 'money with wings', 'spend cash'],
      ['💳', 'credit card', 'payment'],
      ['🧾', 'receipt', 'invoice bill'],
      ['📈', 'chart up', 'increasing growth trend up'],
      ['📉', 'chart down', 'decreasing trend down'],
      ['📊', 'bar chart', 'stats report numbers'],
      ['📋', 'clipboard', 'list checklist'],
      ['📝', 'memo', 'note write notes'],
      ['📌', 'pushpin', 'pin important'],
      ['📍', 'round pushpin', 'location place'],
      ['📎', 'paperclip', 'attachment'],
      ['🔗', 'link', 'chain url'],
      ['📁', 'folder', 'file'],
      ['🔍', 'magnifying glass', 'search find look'],
      ['💡', 'light bulb', 'idea tip'],
      ['🔑', 'key', 'unlock access'],
      ['🔒', 'lock', 'locked private secure'],
      ['💼', 'briefcase', 'business work'],
      ['🏢', 'office building', 'company office'],
      ['✅', 'check mark', 'done yes complete tick'],
      ['☑️', 'ballot box check', 'done tick'],
      ['✔️', 'heavy check', 'done tick yes'],
      ['❌', 'cross mark', 'no wrong cancel'],
      ['❗', 'exclamation', 'important alert'],
      ['❓', 'question', 'ask help'],
      ['⚠️', 'warning', 'caution alert'],
      ['🚫', 'prohibited', 'no forbidden blocked'],
      ['🛑', 'stop sign', 'stop halt'],
      ['☕', 'coffee', 'break tea hot drink'],
      ['🍕', 'pizza', 'lunch food'],
      ['🍩', 'doughnut', 'donut snack'],
      ['🥤', 'cup with straw', 'drink soda'],
      ['🍔', 'burger', 'lunch food'],
    ],
  },
  {
    id: 'symbols',
    label: 'Hearts & symbols',
    icon: '❤️',
    list: [
      ['❤️', 'red heart', 'love like'],
      ['🧡', 'orange heart', 'love'],
      ['💛', 'yellow heart', 'love'],
      ['💚', 'green heart', 'love'],
      ['💙', 'blue heart', 'love'],
      ['💜', 'purple heart', 'love'],
      ['🖤', 'black heart', 'love'],
      ['🤍', 'white heart', 'love'],
      ['💖', 'sparkling heart', 'love'],
      ['💕', 'two hearts', 'love'],
      ['💔', 'broken heart', 'sad heartbreak'],
      ['❣️', 'heart exclamation', 'love'],
      ['💬', 'speech bubble', 'comment chat talk'],
      ['💭', 'thought bubble', 'thinking idea'],
      ['💤', 'zzz', 'sleep tired'],
      ['🆗', 'ok button', 'okay'],
      ['🆕', 'new button', 'new fresh'],
      ['🆒', 'cool button', 'cool'],
      ['🔝', 'top', 'best up'],
      ['🔴', 'red circle', 'red dot live'],
      ['🟢', 'green circle', 'green dot go available'],
      ['🟡', 'yellow circle', 'yellow dot'],
      ['🔵', 'blue circle', 'blue dot'],
      ['➕', 'plus', 'add more'],
      ['➖', 'minus', 'remove less'],
      ['➡️', 'right arrow', 'next forward'],
      ['⬆️', 'up arrow', 'up increase'],
      ['⬇️', 'down arrow', 'down decrease'],
      ['🔁', 'repeat', 'again loop'],
      ['🔄', 'refresh', 'update reload sync'],
      ['♻️', 'recycle', 'reuse'],
      ['💲', 'dollar sign', 'money price'],
    ],
  },
  {
    id: 'nature',
    label: 'Animals & nature',
    icon: '🐶',
    list: [
      ['🐶', 'dog', 'puppy pet'],
      ['🐱', 'cat', 'kitten pet'],
      ['🦁', 'lion', 'brave king'],
      ['🐯', 'tiger', 'fierce'],
      ['🐻', 'bear', ''],
      ['🐼', 'panda', ''],
      ['🦊', 'fox', 'clever'],
      ['🐵', 'monkey', ''],
      ['🙈', 'see no evil', 'monkey oops embarrassed'],
      ['🙉', 'hear no evil', 'monkey'],
      ['🙊', 'speak no evil', 'monkey oops'],
      ['🦄', 'unicorn', 'magic rare'],
      ['🐝', 'bee', 'busy buzz'],
      ['🦋', 'butterfly', 'pretty'],
      ['🐢', 'turtle', 'slow'],
      ['🦈', 'shark', 'closer'],
      ['🐳', 'whale', 'big deal'],
      ['🦅', 'eagle', 'freedom'],
      ['🐐', 'goat', 'greatest of all time g.o.a.t'],
      ['🌱', 'seedling', 'grow growth plant new'],
      ['🌳', 'tree', 'nature'],
      ['🌵', 'cactus', 'desert'],
      ['🌸', 'cherry blossom', 'flower spring'],
      ['🌻', 'sunflower', 'flower'],
      ['🌈', 'rainbow', 'pride colorful'],
      ['☀️', 'sun', 'sunny weather'],
      ['🌙', 'moon', 'night'],
      ['⛅', 'sun behind cloud', 'weather cloudy'],
      ['🌧️', 'rain', 'weather rainy'],
      ['❄️', 'snowflake', 'cold winter'],
      ['🌊', 'water wave', 'ocean sea surf'],
      ['🌍', 'globe', 'earth world international'],
    ],
  },
];

const wordsOf = (name: string, extra = '') =>
  [...new Set(`${name} ${extra}`.toLowerCase().split(/\s+/).filter(Boolean))];

export const EMOJI_CATEGORIES: EmojiCategory[] = RAW.map((c) => ({
  id: c.id,
  label: c.label,
  icon: c.icon,
  emojis: c.list.map(([emoji, name, extra]) => ({ emoji, name, words: wordsOf(name, extra), category: c.id })),
}));

/** Every emoji in picker order (first category first). */
export const EMOJI_LIST: EmojiEntry[] = EMOJI_CATEGORIES.flatMap((c) => c.emojis);

/** The one-click reactions on a message's action bar. */
export const QUICK_REACTIONS = ['👍', '🔥', '🎉', '😂', '❤️', '💯'] as const;

/** Variation selector 16 (emoji presentation) is optional when matching: ❤ and ❤️ are the same reaction. */
const bare = (s: string) => s.replace(/️/g, '');
const BY_BARE = new Map(EMOJI_LIST.map((e) => [bare(e.emoji), e]));
const ORDER = new Map(EMOJI_LIST.map((e, i) => [e.emoji, i]));

/** The allow-listed spelling of an emoji, or null when it is not in the set (or not a string). */
export function normalizeEmoji(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 16) return null;
  return BY_BARE.get(bare(raw.trim()))?.emoji ?? null;
}

export function emojiEntry(emoji: string): EmojiEntry | undefined {
  return BY_BARE.get(bare(emoji));
}

/** Picker order, for showing reaction chips in a stable order. Unknown emojis go last. */
export const emojiOrder = (emoji: string) => ORDER.get(emoji) ?? ORDER.get(normalizeEmoji(emoji) ?? '') ?? Number.MAX_SAFE_INTEGER;

/** `:thumbs_up:` style shortcode for an entry. */
export const shortcodeOf = (e: EmojiEntry) => e.name.replace(/\s+/g, '_');

/**
 * Search by name and keywords: exact name first, then names starting with the query, then any
 * word starting with it, then anything containing it. Underscores count as spaces, so
 * shortcodes ("thumbs_up") match too.
 */
export function searchEmoji(query: string, limit = 64): EmojiEntry[] {
  const q = query.trim().toLowerCase().replace(/_/g, ' ').replace(/^:|:$/g, '').trim();
  if (!q) return [];
  const scored: { e: EmojiEntry; score: number; i: number }[] = [];
  EMOJI_LIST.forEach((e, i) => {
    const name = e.name.toLowerCase();
    let score = -1;
    if (name === q) score = 0;
    else if (name.startsWith(q)) score = 1;
    else if (e.words.some((w) => w.startsWith(q))) score = 2;
    else if (name.includes(q) || e.words.some((w) => w.includes(q))) score = 3;
    if (score >= 0) scored.push({ e, score, i });
  });
  return scored
    .sort((a, b) => a.score - b.score || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.e);
}
