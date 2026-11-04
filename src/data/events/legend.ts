import type { StoryEvent } from '../../sim/story';

/** Legend mode only: the same frontier, but the folklore is true. All names and text are original. */
export const LEGEND_EVENTS: readonly StoryEvent[] = [
  // ── The Strange Stones ────────────────────────────────────────────────────────
  {
    id: 'strange_stones',
    title: 'The humming stones',
    from: 'Your master digger',
    text: "The diggers have struck a ring of standing stones under the turf, taller than a man and cut with spirals. The ground round them is warm to the touch. The labourers won't go near them after dark, and one swears they hum.",
    when: { mode: 'legend', fromMonth: 2 },
    weight: 4,
    once: true,
    choices: [
      { label: 'Break them up for building stone', effects: { stone: 120, standing: { commons: -3, borderfolk: -6 }, set: ['stones_broken'], follow: { event: 'stones_wrath', months: 2 }, text: 'The stones split easily, too easily. The masons say they were warm right through.' } },
      { label: 'Leave them, and move the footings', effects: { crowns: -100, standing: { borderfolk: 4 }, set: ['stones_kept'], follow: { event: 'stones_gift', months: 4 }, text: 'The stones stand. On still nights the whole camp can hear them.' } },
      { label: "Send for the hill people's wise woman", effects: { crowns: -50, standing: { borderfolk: 10 }, set: ['stones_kept'], follow: { event: 'stones_gift', months: 3 }, text: 'She walked round the ring three times, laughed, and said they liked you.' } },
    ],
  },
  {
    id: 'stones_wrath',
    title: 'Bad luck in the camp',
    from: 'Your camp reeve',
    text: 'Since the stones were broken, the camp\'s luck has turned. Milk sours, carts break their axles, and last night something walked three times round the camp without leaving a footprint.',
    when: { mode: 'legend', flags: ['stones_broken'] },
    weight: 0,
    ignore: 2,
    choices: [
      {
        label: 'Ask the abbot to bless the site',
        effects: { crowns: -200, standing: { church: 5 }, clear: ['stones_broken'], text: 'The abbot blessed the site, very loudly. The footsteps stopped.' },
        risk: { chance: 0.3, effects: { crowns: -200, workers: { labourer: -3 }, standing: { church: 5 }, text: "The abbot blessed the site. That night three labourers packed up and left, and wouldn't say what they'd seen." } },
      },
      { label: 'Set the stones back up, as best you can', effects: { stone: -120, standing: { borderfolk: 6 }, clear: ['stones_broken'], text: 'The masons pieced the stones together with mortar. They hum again, and the milk keeps.' } },
      { label: 'Ignore it', effects: { workers: { labourer: -3, carter: -1 }, standing: { commons: -5 }, text: 'Four of the workers walked off in the night. The footsteps go on.' } },
    ],
  },
  {
    id: 'stones_gift',
    title: 'The longest night',
    from: 'Your master digger',
    text: 'On the longest night the stones rang like a bell. In the morning there was a spring of clear water in the middle of the ring, and the sick in the camp were well.',
    when: { mode: 'legend', flags: ['stones_kept'] },
    weight: 0,
    choices: [
      { label: 'Let the borderfolk come to the spring', effects: { standing: { borderfolk: 10 }, raidDays: 30, text: 'They come in ones and twos to fill their flasks. Fewer of them seem to want to raid you.' } },
      { label: 'Charge pilgrims a toll', effects: { crowns: 300, standing: { borderfolk: -5, church: -5 }, text: 'The toll brings in good money. The abbot calls it a pagan fairground.' } },
      { label: 'Keep the spring for the castle', effects: { standing: { commons: 5 }, food: 100, text: 'The water is sweet, and the camp has never been healthier.' } },
    ],
  },

  // ── One-off Legend messages ──────────────────────────────────────────────────
  {
    id: 'marsh_lights',
    title: 'Lights on the low ground',
    from: 'Your sergeant',
    text: 'Lights have been dancing over the low ground at night. A labourer followed them yesterday and has not come back. The others want to go and look for him.',
    when: { mode: 'legend', fromMonth: 3 },
    weight: 2,
    once: true,
    choices: [
      {
        label: 'Search with torches',
        effects: { standing: { commons: 4 }, text: 'They found him at dawn, up to his waist in the bog and singing. He is quite well, apart from the singing.' },
        risk: { chance: 0.3, effects: { workers: { labourer: -2 }, standing: { commons: -3 }, text: 'Two more went into the marsh after the lights, and did not come back either.' } },
      },
      { label: 'Forbid anyone to follow the lights', effects: { workers: { labourer: -1 }, text: 'Nobody followed the lights. Nobody found him, either.' } },
      { label: 'Leave bread on the marsh edge, the old way', effects: { food: -30, standing: { borderfolk: 5 }, text: 'The bread was gone in the morning. So were the lights, and the labourer was asleep in his own bed.' } },
    ],
  },
  {
    id: 'hermit_dream',
    title: "The hermit's dream",
    from: 'A hermit from the high wood',
    text: "A hermit in a coat of moss has come down from the high wood. He says he has dreamed of the next raid, and that the dream wants feeding.",
    when: { mode: 'legend', fromMonth: 2 },
    weight: 2,
    cooldown: 12,
    choices: [
      { label: 'Feed him, and do as he says', effects: { food: -50, raidDays: 20, text: 'He told the scouts to light fires on the three hills. A fog came down on the raiders, and they lost their way.' } },
      {
        label: 'Laugh him out of the camp',
        effects: { text: 'He went, still talking.' },
        risk: { chance: 0.5, effects: { raidDays: -20, text: 'He went, still talking. A week later the scouts saw the raiders on the march, early, just as he had said.' } },
      },
      { label: 'Give him a meal, but no more', effects: { food: -5, standing: { commons: 1 }, text: 'He ate, thanked you, and said the dream would keep.' } },
    ],
  },
];
