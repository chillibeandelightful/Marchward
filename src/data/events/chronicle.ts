import type { StoryEvent } from '../../sim/story';

/**
 * Events for both modes (and Chronicle's own). Chains are linked by `follow` (which event comes,
 * and how many months later) and by flags. Follow-ups have weight 0: they only come when set in motion.
 * All names and text are original.
 */
export const CHRONICLE_EVENTS: readonly StoryEvent[] = [
  // ── The Outlaw ───────────────────────────────────────────────────────────────
  {
    id: 'outlaw_caught',
    title: 'The flour thief',
    from: 'Your camp reeve',
    figure: 'reeve',
    text: "The carters caught a man with a sack of the camp's flour, and two more sacks hidden in the ditch. He gives his name as Jory Tallow, says the forest feeds nobody in spring, and doesn't look sorry. The camp wants to see what the warden will do.",
    when: { fromMonth: 1 },
    weight: 4,
    once: true,
    ignore: 1,
    choices: [
      {
        label: 'Hang him at the crossroads',
        effects: { food: 40, standing: { commons: 2, borderfolk: -8 }, set: ['outlaw_hanged'], follow: { event: 'outlaw_kin', months: 3 }, text: 'Jory Tallow was hanged at the crossroads. The camp is quieter. The hills are not.' },
      },
      {
        label: 'Flog him and let him go',
        effects: { food: 40, standing: { borderfolk: 3 }, set: ['outlaw_spared'], follow: { event: 'outlaw_returns', months: 5 }, text: 'Jory Tallow took his lashes without a sound and walked back into the forest.' },
      },
      {
        label: 'Give him a spear and a place in the garrison',
        effects: { food: 40, troops: { swordsman: 1 }, standing: { commons: -4 }, set: ['outlaw_recruited'], follow: { event: 'outlaw_turncoat', months: 4 }, text: 'Jory Tallow swore his oath on the only book in the camp. The carters who caught him are not pleased.' },
      },
    ],
  },
  {
    id: 'outlaw_kin',
    title: 'A blood price',
    from: "Jory Tallow's sister",
    text: "She has come to the gate with her brother's blood price written out by a priest who can barely spell: three hundred crowns, or his kin in the hills \"will see to it themselves\".",
    when: { flags: ['outlaw_hanged'] },
    weight: 0,
    ignore: 1,
    choices: [
      { label: 'Pay the blood price', effects: { crowns: -300, standing: { borderfolk: 10 }, clear: ['outlaw_hanged'], text: 'She took the purse without thanks. The feud is closed, as far as such things ever close.' } },
      { label: 'Refuse her', effects: { standing: { borderfolk: -8 }, raidDays: -20, text: 'She spat on the gate post and went. The scouts say the hill farms are sharpening things.' } },
      {
        label: 'Offer her work in the camp instead',
        effects: { workers: { labourer: 2 }, standing: { borderfolk: 4 }, clear: ['outlaw_hanged'], text: 'She came to work with a cousin, and works harder than either of the carters who caught her brother.' },
        risk: { chance: 0.3, effects: { timber: -60, standing: { borderfolk: -5 }, text: 'She took the work, and in the first week the timber store burned. Nobody saw who lit it.' } },
      },
    ],
  },
  {
    id: 'outlaw_returns',
    title: 'The thief comes back',
    from: 'A ragged man at the gate',
    text: "Jory Tallow is back, thinner, and with news. The raiders in the hills are gathering again, and he knows the path they'll take. He wants twenty crowns and a hot meal.",
    when: { flags: ['outlaw_spared'] },
    weight: 0,
    choices: [
      {
        label: 'Pay him and listen',
        effects: { crowns: -20, raidDays: 25, clear: ['outlaw_spared'], text: 'He drew the path in the dirt. Your scouts laid a false trail across it, and the raiders are wandering about in the wrong valley.' },
        risk: { chance: 0.25, effects: { crowns: -20, raidDays: -15, clear: ['outlaw_spared'], text: 'His path led your scouts straight into the raiders. He has gone, and so have your twenty crowns.' } },
      },
      { label: 'Feed him, but no coin', effects: { food: -10, raidDays: 10, text: 'He ate, shrugged, and told you about half of it.' } },
      { label: 'Send him away', effects: { text: 'He went back to the trees, and his news went with him.' } },
    ],
  },
  {
    id: 'outlaw_turncoat',
    title: 'Old friends from the forest',
    from: 'Your sergeant',
    text: 'Jory Tallow has turned out a better soldier than anyone expected. Now he says three of his old companions would come in from the forest too, if the warden pardoned them.',
    when: { flags: ['outlaw_recruited'] },
    weight: 0,
    choices: [
      {
        label: 'Pardon all three and take them on',
        effects: { troops: { swordsman: 3 }, standing: { commons: -3, borderfolk: 4 }, text: 'Three hard-looking men walked in from the forest and took the oath. They know the hills better than your scouts do.' },
        risk: { chance: 0.3, effects: { troops: { swordsman: -1 }, food: -150, crowns: -100, standing: { commons: -6 }, text: 'They stayed a fortnight, then left one night with the strongbox, a cart of food, and Jory with them.' } },
      },
      { label: 'Take one, on Jory\'s word', effects: { troops: { swordsman: 1 }, text: 'One came in. The other two are still out there, Jory says, thinking about it.' } },
      { label: 'Refuse', effects: { standing: { borderfolk: -2 }, text: 'Jory said nothing, and stood his watch as usual.' } },
    ],
  },

  // ── The Abbot's Request ─────────────────────────────────────────────────────
  {
    id: 'abbot_request',
    title: "The abbot's chapel",
    from: 'Brother Wystan, from the abbey at Wenlow',
    text: "The abbot asks that a chapel be raised inside the walls, for the souls of the workers, and that the warden pay for it. He mentions, gently, that the bishop dines with the king.",
    when: { fromMonth: 2 },
    weight: 4,
    once: true,
    choices: [
      { label: 'Pay for the chapel now', effects: { crowns: -600, standing: { church: 15, commons: 3 }, set: ['chapel_built'], follow: { event: 'abbot_masons', months: 4 }, text: 'The chapel has a roof before the barracks do. The workers seem to like it.' } },
      { label: 'Promise to pay next year', effects: { standing: { church: 3 }, set: ['chapel_promised'], follow: { event: 'abbot_reminder', months: 6 }, text: 'Brother Wystan wrote the promise down very carefully.' } },
      { label: 'Refuse: the walls come first', effects: { standing: { church: -15 }, follow: { event: 'abbot_sermon', months: 2 }, text: 'Brother Wystan said he would pray for you, in a tone that suggested it would take a while.' } },
    ],
  },
  {
    id: 'abbot_masons',
    title: 'Brothers in stone',
    from: 'The abbot of Wenlow',
    text: 'The abbot has not forgotten the chapel. He sends two lay brothers, masons before they took their vows, who would gladly work on the castle.',
    when: { flags: ['chapel_built'] },
    weight: 0,
    choices: [
      { label: 'Take them on', effects: { workers: { mason: 2 }, standing: { church: 3 }, text: 'They pray at dawn and lay stone until dusk, and they never complain about the food.' } },
      { label: "Ask for a cartload of the abbey's stone instead", effects: { stone: 100, text: 'A cart of good dressed stone came up the road, with the abbot\'s blessing chalked on each block.' } },
      { label: 'Thank him, but decline', effects: { standing: { church: -2 }, text: 'The abbot was puzzled, but sent his thanks.' } },
    ],
  },
  {
    id: 'abbot_reminder',
    title: 'A promise falls due',
    from: 'Brother Wystan',
    text: 'The year has turned, and so has the abbot\'s patience. Brother Wystan has brought the promise you made, in your own hand, and the chapel will cost more now that stone has gone up.',
    when: { flags: ['chapel_promised'] },
    weight: 0,
    choices: [
      { label: 'Pay in full', effects: { crowns: -800, standing: { church: 12 }, clear: ['chapel_promised'], set: ['chapel_built'], follow: { event: 'abbot_masons', months: 3 }, text: 'The chapel is built at last. The abbot calls you a man of your word, which is generous.' } },
      { label: 'Pay half, and promise the rest', effects: { crowns: -400, standing: { church: 2 }, follow: { event: 'abbot_reminder', months: 6 }, text: 'The walls of the chapel went up. The roof waits on the rest of the money.' } },
      { label: 'Break the promise', effects: { standing: { church: -20, commons: -3 }, clear: ['chapel_promised'], follow: { event: 'abbot_sermon', months: 1 }, text: 'Brother Wystan folded the promise away and left without a word.' } },
    ],
  },
  {
    id: 'abbot_sermon',
    title: 'A sermon at the camp',
    from: 'Your camp reeve',
    text: 'The priest who comes up from the village on feast days preached this week on wardens who build walls for themselves and none for God. The workers listened very closely.',
    weight: 0,
    choices: [
      { label: 'Make a gift to the abbey after all', effects: { crowns: -300, standing: { church: 10 }, text: 'The next sermon was about generous wardens.' } },
      {
        label: 'Answer him yourself at the camp fire',
        effects: { standing: { church: -5, commons: 3 }, text: "You spoke well. The workers laughed in the right places, and the priest went home early." },
        risk: { chance: 0.4, effects: { standing: { church: -5, commons: -6 }, text: 'You spoke badly. The workers laughed in the wrong places.' } },
      },
      { label: 'Bar him from the camp', effects: { standing: { church: -10, commons: -4 }, text: 'He preaches outside the camp gate now, to a bigger crowd.' } },
    ],
  },

  // ── The Baron's Wedding ─────────────────────────────────────────────────────
  {
    id: 'baron_wedding',
    title: 'An offer of marriage',
    from: "A herald in Baron Maule's colours",
    text: 'Baron Edric Maule of Coldharbour, whose lands lie across your southern road, offers his daughter Isolde in marriage to your nephew. The dowry is modest. The baron\'s expectations are not: he would like your help in a boundary quarrel, and a share of the tolls on your road.',
    when: { fromMonth: 4 },
    weight: 3,
    once: true,
    ignore: 1,
    choices: [
      { label: 'Accept the match', effects: { crowns: -400, standing: { barons: 15, crown: -3 }, set: ['wedding_allied'], follow: { event: 'wedding_gift', months: 3 }, text: 'The match is made. You are paying for the feast, which the baron seems to have assumed from the start.' } },
      { label: 'Decline politely', effects: { standing: { barons: -5 }, text: 'The herald bowed exactly as low as courtesy required, and no lower.' } },
      { label: 'Decline, and tell the crown about the tolls', effects: { standing: { barons: -15, crown: 8 }, set: ['baron_snubbed'], follow: { event: 'baron_grudge', months: 4 }, text: "The crown thanks you for your vigilance. Baron Maule will hear who told them, and soon." } },
    ],
  },
  {
    id: 'wedding_gift',
    title: 'A wedding gift',
    from: "Baron Maule's steward",
    text: 'The wedding was loud, the bride was gracious, and the baron keeps his side of the bargain. He offers his new kin a gift, and would like it known that it is generous.',
    when: { flags: ['wedding_allied'] },
    weight: 0,
    choices: [
      { label: 'Soldiers for the garrison', effects: { troops: { swordsman: 4, archer: 2 }, standing: { barons: 3 }, set: ['baron_soldiers'], follow: { event: 'baron_calls', months: 6 }, text: "Six of the baron's men moved into the barracks. They wear his colours, not yours." } },
      { label: 'Oak from his forests', effects: { timber: 150, text: "Cart after cart of the baron's oak came up the road." } },
      { label: 'His riders on the southern road', effects: { raidDays: 20, standing: { barons: 2 }, text: "The baron's riders watch the road south. The raiders will have to go the long way round." } },
    ],
  },
  {
    id: 'baron_calls',
    title: 'The baron calls in a favour',
    from: 'Baron Maule',
    text: 'Baron Maule is fighting his neighbour over a mill, and he wants his soldiers back. He would also like some of yours, as family.',
    when: { flags: ['baron_soldiers'] },
    weight: 0,
    choices: [
      { label: 'Send his men back', effects: { troops: { swordsman: -4, archer: -2 }, standing: { barons: 3 }, clear: ['baron_soldiers'], text: 'His men marched off. The barracks are roomier.' } },
      { label: 'Send his men, and three of yours', effects: { troops: { swordsman: -7, archer: -2 }, standing: { barons: 15 }, clear: ['baron_soldiers'], text: 'The baron won his mill. He says he will not forget it, and for once you believe him.' } },
      { label: 'Keep them: you need them more', effects: { standing: { barons: -20 }, clear: ['baron_soldiers', 'wedding_allied'], set: ['baron_snubbed'], follow: { event: 'baron_grudge', months: 3 }, text: "The baron's men stayed, and grumble. The baron's letters have stopped." } },
    ],
  },
  {
    id: 'baron_grudge',
    title: 'Trouble on the road',
    from: 'Your master carter',
    text: "Your carts were stopped on Baron Maule's stretch of the southern road. His men inspected the stone very thoroughly, and some of it fell in the river.",
    when: { flags: ['baron_snubbed'] },
    weight: 0,
    choices: [
      { label: 'Pay his toll from now on', effects: { crowns: -250, standing: { barons: 8 }, clear: ['baron_snubbed'], text: 'The toll is paid, and the stone now arrives dry.' } },
      {
        label: 'Complain to the crown',
        effects: { stone: -60, standing: { crown: -3, barons: -5 }, text: 'The crown wrote back that it is tired of wardens and barons squabbling over roads.' },
        risk: { chance: 0.5, effects: { stone: -60, crowns: 200, standing: { crown: 3, barons: -8 }, text: 'The crown fined the baron, and sent part of it to you. He will not take that well.' } },
      },
      { label: 'Take the long road round', effects: { stone: -60, timber: -30, text: 'The long road adds two days to every load. What fell in the river stays there.' } },
    ],
  },

  // ── The Hungry Winter ──────────────────────────────────────────────────────
  {
    id: 'hungry_winter',
    title: 'A bad harvest',
    from: 'The reeve of the village',
    text: 'Rain at harvest, then blight. The village granaries are half empty and winter is coming. The villagers are looking hard at your stores.',
    when: { seasons: ['autumn'], fromMonth: 5 },
    weight: 4,
    cooldown: 12,
    choices: [
      { label: 'Open the castle stores', effects: { food: -400, standing: { commons: 10, borderfolk: 4 }, text: 'The castle fed the village through the winter. Nobody there will forget it.' } },
      { label: 'Sell them grain, at the market price', effects: { food: -300, crowns: 600, standing: { commons: -10 }, follow: { event: 'hunger_riot', months: 2 }, text: 'The grain was sold, at a price the villagers call robbery and your steward calls fair.' } },
      { label: 'Let it be', effects: { standing: { commons: -6, borderfolk: -6 }, raidDays: -25, follow: { event: 'hunger_spring', months: 5 }, text: 'The village tightened its belt. The hill farms, hungrier still, have started looking at your camp.' } },
    ],
  },
  {
    id: 'hunger_riot',
    title: 'A crowd at the gate',
    from: 'Your sergeant',
    text: 'A crowd from the village came to the camp gate shouting about the price of your grain. Someone threw a stone. Someone else threw a torch.',
    weight: 0,
    choices: [
      { label: 'Hand out bread', effects: { food: -200, standing: { commons: 6 }, text: 'The crowd went home with bread, and some of them came back the next day to ask for work.' } },
      {
        label: 'Call out the garrison',
        effects: { standing: { commons: -8 }, text: 'The soldiers cleared the gate. Nobody was badly hurt, this time.' },
        risk: { chance: 0.3, effects: { troops: { swordsman: -1 }, standing: { commons: -12 }, text: 'It turned ugly. A soldier was killed, and two villagers, and the camp is sullen.' } },
      },
      { label: 'Pay for the damage', effects: { crowns: -300, standing: { commons: 4 }, text: 'You paid for the burned stalls. It cost less than the grain earned.' } },
    ],
  },
  {
    id: 'hunger_spring',
    title: 'After the hungry winter',
    from: 'The reeve of the village',
    text: 'The winter was hard in the village. There are new graves, and fewer hands for hire. The ones who are left remember who helped them, and who did not.',
    weight: 0,
    choices: [
      { label: 'Pay for seed corn', effects: { crowns: -300, standing: { commons: 8, borderfolk: 5 }, text: 'The fields were sown. It will be a better year.' } },
      { label: 'Offer work at the castle', effects: { workers: { labourer: 4 }, standing: { commons: 3 }, text: 'Four of the hungriest came up the hill to carry stone for bread and a wage.' } },
      { label: 'Do nothing', effects: { standing: { commons: -4 }, text: 'Nothing was done, and the village noticed.' } },
    ],
  },

  // ── The old stones (Chronicle's telling) ────────────────────────────────────
  {
    id: 'old_stones',
    title: 'Old stones in the ground',
    from: 'Your master digger',
    text: "The diggers have turned up a ring of standing stones under the turf. The labourers say their grandfathers would never plough here. The borderfolk say it is where their old kings are buried.",
    when: { mode: 'chronicle', fromMonth: 2 },
    weight: 3,
    once: true,
    choices: [
      { label: 'Break them up for building stone', effects: { stone: 120, standing: { borderfolk: -10 }, text: 'Good stone, and plenty of it. The borderfolk who came to watch went away without a word.' } },
      { label: 'Leave them, and move the footings', effects: { crowns: -100, standing: { borderfolk: 5 }, text: 'The stones stand. The masons grumbled about redoing a week of setting out.' } },
      { label: 'Let the borderfolk take them away', effects: { standing: { borderfolk: 12, commons: -2 }, text: 'They came with oxen and rollers and sang the whole way back to the hills.' } },
    ],
  },

  // ── One-off messages ───────────────────────────────────────────────────────
  {
    id: 'crown_surveyor',
    title: "The king's surveyor",
    from: 'A royal surveyor',
    text: "A royal surveyor with a measuring rod and a sour face has come to see what the crown's money has bought.",
    when: { fromMonth: 3 },
    weight: 2,
    cooldown: 10,
    choices: [
      { label: 'Show him round, honestly', effects: { standing: { crown: 3 }, text: 'He measured everything twice and wrote a great deal down. It seemed to go well.' } },
      { label: 'Feast him well', effects: { crowns: -150, food: -50, standing: { crown: 7 }, text: 'He left in good spirits, and wrote a short and cheerful report.' } },
      {
        label: 'Slip him a purse',
        effects: { crowns: -300, standing: { crown: 12 }, text: 'His report praised your thrift, which was funny.' },
        risk: { chance: 0.25, effects: { crowns: -300, standing: { crown: -15 }, text: 'He took the purse, and put it in his report.' } },
      },
    ],
  },
  {
    id: 'crown_war_levy',
    title: 'A token of loyalty',
    from: 'A royal herald',
    text: 'The king is at war across the sea and needs money. Every warden on the frontier is asked for "a token of loyalty". The herald has a list of who gave what.',
    when: { fromMonth: 6 },
    weight: 2,
    cooldown: 12,
    choices: [
      { label: 'Send 800 crowns', effects: { crowns: -800, standing: { crown: 12 }, text: 'Your name is near the top of the list.' } },
      { label: 'Send four soldiers instead', effects: { troops: { swordsman: -4 }, standing: { crown: 7 }, text: 'Four of your soldiers marched off to a war across the sea.' } },
      { label: 'Plead poverty', effects: { standing: { crown: -10 }, text: 'Your name is near the bottom of the list.' } },
    ],
  },
  {
    id: 'wandering_masons',
    title: 'Masons on the road',
    from: 'A master mason',
    text: 'A band of masons, finished with a cathedral in the south, are passing on the road and looking for work. Their master wants a signing fee, as is the custom.',
    weight: 3,
    cooldown: 6,
    choices: [
      { label: 'Take on all five', effects: { crowns: -100, workers: { mason: 5 }, text: 'Five masons and their tools came up the hill. The walls should rise faster now.' } },
      { label: 'Take on two', effects: { crowns: -40, workers: { mason: 2 }, text: 'Two of them stayed. The others went on north.' } },
      { label: 'Send them on', effects: { text: 'They went on up the road to try their luck elsewhere.' } },
    ],
  },
  {
    id: 'timber_raft',
    title: 'A raft of oak',
    from: 'A lowland timber merchant',
    text: 'A timber merchant has a raft of seasoned oak tied up on the river. He will sell the lot cheap, for coin today, and asks no questions about why he is in a hurry.',
    weight: 2,
    cooldown: 6,
    choices: [
      { label: 'Buy the lot', effects: { crowns: -250, timber: 250, text: 'Good oak, cheap. Two days later the baron\'s foresters came by asking about a missing raft.' } },
      {
        label: 'Haggle',
        effects: { crowns: -150, timber: 200, text: 'You beat him down, and he still looked relieved.' },
        risk: { chance: 0.5, effects: { text: 'He took offence and poled away down the river.' } },
      },
      { label: 'Turn him away', effects: { text: 'He poled off downriver, faster than he came.' } },
    ],
  },
  {
    id: 'border_market',
    title: 'A market at the camp',
    from: 'An elder of the hill farms',
    text: 'The hill farmers want to hold a market at your camp: wool, cheese and hides, for your coin. They say it would be good for both sides to know each other better.',
    when: { fromMonth: 2 },
    weight: 2,
    cooldown: 10,
    choices: [
      {
        label: 'Welcome them',
        effects: { crowns: -100, food: 150, standing: { borderfolk: 8 }, text: 'The market was a success. A few of the hill farmers have started speaking to your carters.' },
        risk: { chance: 0.2, effects: { crowns: -100, food: 150, standing: { borderfolk: 4 }, raidDays: -15, text: 'The market was a success. Some of the traders spent rather a long time looking at your walls.' } },
      },
      { label: 'Allow it, for a toll', effects: { crowns: 100, standing: { borderfolk: 2 }, text: 'The toll was paid with bad grace.' } },
      { label: 'Refuse', effects: { standing: { borderfolk: -6 }, text: 'The elder said that was what he had expected.' } },
    ],
  },
  {
    id: 'deserters',
    title: 'Soldiers without a lord',
    from: 'Your sergeant',
    text: "Four soldiers in a baron's livery have come in off the road. Their lord hasn't paid them since spring, they say, and they would rather serve you.",
    when: { fromMonth: 4 },
    weight: 2,
    cooldown: 10,
    choices: [
      { label: 'Take them in', effects: { troops: { swordsman: 4 }, standing: { barons: -10 }, text: 'Four new soldiers, and one angry baron.' } },
      { label: 'Send them back to their lord', effects: { standing: { barons: 6, commons: -1 }, text: 'They were sent back in irons. The baron sends his thanks.' } },
      { label: 'Feed them and send them on', effects: { food: -40, standing: { commons: 1 }, text: 'They ate well and went on north. Nobody asked which way.' } },
    ],
  },
  {
    id: 'camp_fever',
    title: 'Fever in the camp',
    from: 'Your camp reeve',
    text: 'A fever is going round the camp. Three are dead and a dozen are too sick to work. The reeve blames the well, the cook blames the reeve.',
    when: { seasons: ['summer', 'autumn'], fromMonth: 3 },
    weight: 2,
    cooldown: 12,
    choices: [
      {
        label: 'Send for a physician',
        effects: { crowns: -250, standing: { commons: 3 }, text: 'The physician bled everyone, closed the well, and the fever passed.' },
        risk: { chance: 0.3, effects: { crowns: -250, workers: { labourer: -2 }, text: 'The physician bled everyone. Two more died, and the fever passed anyway.' } },
      },
      { label: 'Burn the bedding and dig a new well', effects: { timber: -40, workers: { labourer: -1 }, text: 'The bedding burned, the new well is sweet, and the fever went with the smoke.' } },
      { label: 'Pray it passes', effects: { workers: { labourer: -3, digger: -1 }, standing: { church: 3, commons: -3 }, text: 'It passed, eventually. Four graves on the hillside.' } },
    ],
  },
  {
    id: 'tithe',
    title: "The church's tenth",
    from: "The bishop's tithe-man",
    text: "The bishop's tithe-man has come for the church's tenth. He has a ledger, and a very good idea of what is in your stores.",
    when: { fromMonth: 5 },
    weight: 2,
    cooldown: 12,
    choices: [
      { label: 'Pay in coin', effects: { crowns: -500, standing: { church: 8 }, text: 'The tithe-man counted it twice and blessed you once.' } },
      { label: 'Pay in kind', effects: { food: -250, standing: { church: 4 }, text: 'He took the grain with a sniff.' } },
      {
        label: 'Dispute the sum',
        effects: { standing: { church: -10 }, text: 'You argued him down to nothing. The bishop will hear of it.' },
        risk: { chance: 0.3, effects: { standing: { church: -10, crown: -5 }, text: 'You argued him down to nothing, and the bishop complained to the king.' } },
      },
    ],
  },
  {
    id: 'grazing',
    title: 'Sheep on the hill',
    from: 'The reeve of the village',
    text: 'The villagers ask to graze their sheep on the castle hill. The grass is good, they say, and the sheep would keep it short for your archers.',
    weight: 2,
    cooldown: 10,
    choices: [
      { label: 'Let them', effects: { food: 50, standing: { commons: 5 }, text: 'The sheep keep the grass short. The masons complain about where they step.' } },
      { label: 'Charge for it', effects: { crowns: 100, standing: { commons: -2 }, text: 'They paid, and the sheep came.' } },
      { label: 'Refuse', effects: { standing: { commons: -4 }, text: 'The villagers went home muttering about wardens and their grass.' } },
    ],
  },
];
