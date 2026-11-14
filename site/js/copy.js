// Every visible string, from floorpad-copy-deck.md. Values in {braces} come from config or data.
// Strings marked ADDED are not in the deck yet; they are listed in the README and the deck.

export const fill = (s, v = {}) => s.replace(/\{(\w+)\}/g, (_, k) => (k in v ? String(v[k]) : `{${k}}`));

export default {
  meta: {
    title: 'Floorpad · Be the floor. Get paid.',
    description: 'Place a limit buy under ${ticker} on Jupiter. Every round the creator fees are split in SOL across the open bids, weighted by size, distance and age.',
    ogAlt: 'A price line bouncing off a floor made of stacked bids.',
  },
  loader: 'Counting bids…',
  nav: { brand: 'FLOORPAD', yourBids: 'Your bids', how: 'How to bid', wall: 'Live bids', floors: 'Other coins', bidders: 'Bidders', rules: 'Rules', launchpad: 'Launchpad' }, // wall/floors labels ADDED
  hero: {
    eyebrow: '${ticker} · {status}',
    live: 'live',
    soon: 'soon',
    headline: 'Drag to bid',
    sub: 'Pull the line under the price. Closer pays more. Closer also fills first.',
    taglineA: 'Be the floor.',
    taglineB: 'Get paid.',
    lead: 'Leave a limit buy under ${ticker} on Jupiter. Every {roundMinutes} minutes, the coin\u2019s creator fees are split in SOL across those bids.', // ADDED (from the meta description)
    beats: ['Place a bid under the price', 'It rests on Jupiter', 'Get SOL every {roundMinutes} min'], // ADDED
    under: '{x}% under price',
    mult: 'Multiplier {n}x',
    fill: {
      near: 'Likely to fill on the next dip.',
      mid: 'Fills on a real dip.',
      far: 'Fills on a bad day.',
      out: 'Too far down. This bid counts zero.',
    },
    primary: 'Place this bid on Jupiter',
    copyCa: 'Copy CA',
    buy: 'Buy',
    small: 'The line is a preview. Your real order is placed on Jupiter, from your wallet.',
    sliderLabel: 'Bid line, percent under price', // ADDED (accessible name only)
    priceNow: 'Price now',
    priceNowValue: 'Price now · {x} SOL', // ADDED
    floorEdge: 'Floor edge ({range}% under)',
    preview: 'Showing {symbol} until ${ticker} launches', // ADDED
    legend: 'Bars on the right are open bids, sized by SOL.', // ADDED
  },
  header: { ca: 'CA', copy: 'Copy', buy: 'Buy', x: 'TWITTER' }, // ADDED (header chip; Copy CA / Buy reuse the hero strings)
  ago: { now: 'just now', s: '{n}s ago', m: '{n}m ago', h: '{n}h ago', d: '{n}d ago' }, // ADDED
  stats: {
    pot: ['Fee pot', '{x} SOL', 'waiting for the next round'],
    floor: ['SOL in the floor', '{x} SOL', 'open bids within {range}% of price'],
    paid: ['Paid to bidders', '{x} SOL', 'since the first round'],
    counted: ['Bids counted', '{n}', 'last round'],
    prelaunchSub: 'starts with the first bid',
    timer: 'Next payout in {mmss}',
    stale: 'No new round for {minutes} minutes. The numbers below are from {time}.', // ADDED
    dryRun: 'Dry run. Nothing was sent this round.', // ADDED
    modeLive: 'live', // ADDED
    modeDry: 'dry run', // ADDED
    payoutWallet: 'Payout wallet', // ADDED
    payoutBalance: '{x} SOL', // ADDED
    explorer: 'Solscan', // ADDED
    updated: 'Updated {ago}', // ADDED
  },
  dash: { // ADDED
    across: 'Across Solana right now',
    resting: ['SOL in floors', '{x} SOL', 'within {range}% under {n} coins'],
    orders: ['Open limit buys', '{n}', 'paid in SOL, all coins'],
    biggest: ['Deepest floor', '{symbol}', '{x} SOL within {range}%'],
    newest: ['Newest bid', '{ago}', '{x} SOL under {symbol}'],
  },
  preview: { // ADDED
    wall: '{symbol}',
    bidders: '{symbol}',
    payouts: 'Example · {symbol}',
    cols: ['#', 'Wallet', 'Points', 'Share', 'Would get'],
  },
  soon: { // ADDED
    title: '${ticker} opens soon.',
    body: 'Rounds start with the first bid. Until then, this is what floors look like across Solana.',
  },
  readout: { // ADDED
    earns: 'Share points per round, for 1 SOL here',
    hint: 'Your cut of a round = your points \u00f7 everyone\u2019s points.',
    after: 'after {span}',
    pts: '{p}',
    perRound: 'per round',
    nearest: 'Nearest open bids',
    bid: '{x} SOL at {p}%',
    none: 'No open bids near this line.',
  },
  bignum: { // ADDED
    value: '{x} SOL',
    sub: 'rests in open limit buys within {range}% under the price of {n} Solana coins, right now.',
  },
  depth: { // ADDED
    tip: '{x} SOL bid {p}% under price · resting {d}',
    band: '{m}x · {a}–{b}%',
    bandSol: '{x} SOL · {n} {bids}',
    hint: 'Each bar is one open bid. Wider means more SOL.',
  },
  hints: ['jup.ag · Limit · buy with SOL', '{bands}', 'every {roundMinutes} min · paid in SOL'], // ADDED
  latest: { // ADDED
    heading: 'Latest payout',
    example: 'Example payout',
    sent: '{x} SOL to {n} {bids}',
    round: 'Round {r} · {ago}',
    exampleSub: '1 SOL pot split across {symbol}\u2019s real bids',
    top: 'Top share',
    bid1: 'bid', bidN: 'bids', wallet1: 'wallet', walletN: 'wallets',
  },
  tape: { // ADDED
    heading: 'Latest bids on Solana',
    lede: 'New open limit buys paid in SOL, read from the chain.',
    row: '{x} SOL under {symbol}',
    under: '{p}% under price',
    above: 'above price',
    empty: 'No new bids found in the last scan.',
  },
  floors: { // ADDED
    heading: 'Floors on Solana',
    lede: 'Open limit buys under other coins, read from the chain. None of these coins pay their bidders.',
    totals: '{x} SOL rests within {range}% under {floors} coins. {orders} open limit buys in all.',
    within: '{x} SOL within {range}%',
    bids: '{n} {bids} · {w} {wallets}',
    bid1: 'bid', bidN: 'bids', wallet1: 'wallet', walletN: 'wallets',
    nearest: 'Closest {p}% under',
    price: '{x} SOL',
    preview: 'Show in the chart',
    previewing: 'In the chart',
    more: 'Show all {n} floors',
    empty: 'No floors found in the last scan.',
    updated: 'Read from chain {ago}',
  },
  checker: {
    heading: 'Your bids',
    lede: 'Paste a wallet. No connection needed to look.',
    placeholder: 'Solana wallet address',
    button: 'Check',
    rows: { open: 'Open bids', resting: 'SOL resting', points: 'Your points', share: 'Your share', paid: 'Paid so far' },
    rowValues: { open: '{n}', resting: '{x}', points: '{p}', share: '{s}%', paid: '{x} SOL' },
    empty: 'No open bids from this wallet. Place one under the price and check again after the next round.',
    tooNew: 'Bid found. It starts counting after one full round.',
    outOfRange: 'This bid is more than {range}% under the price. It counts zero until the price comes to it or you move it up.',
    invalid: 'That is not a Solana address.',
    loading: 'Reading the wall…',
    dataError: 'Could not read the latest round. Showing the last saved one from {time}.',
  },
  how: {
    heading: 'Three steps. One of them is waiting.',
    steps: [
      ['Open the order.', 'Go to Jupiter, pick Limit, and choose to buy ${ticker} with SOL.'],
      ['Pick the price.', 'Set it under the current price. Closer earns a bigger multiplier and is more likely to fill. Leave it open.'],
      ['Get paid.', 'Every {roundMinutes} minutes the creator fees are split across the open bids and sent in SOL to the wallet that owns the bid.'],
    ],
    note: 'If your bid fills, you bought the coin at your price. That is the deal. A filled bid stops earning, so place a new one.',
  },
  wall: {
    heading: 'The wall',
    lede: 'Every open bid under the price, stacked by distance. This is the floor, and you can count it.',
    priceNow: 'Price now',
    floorEdge: 'Floor edge ({range}% under)',
    band: '{n}x',
    hover: '{x} SOL resting between {a}% and {b}% under price · {n} bids',
    empty: 'No wall yet. The first bid is the whole floor.',
  },
  formula: {
    heading: 'How a round is split',
    line: ['points', '=', 'SOL in the bid', '×', 'distance', '×', 'age'],
    distanceLabel: 'Distance',
    ageLabel: 'Age',
    example: 'Round pot 1 SOL. You have {aSol} SOL bid {aPct}% under price for two days: {aSol} × {aDm} × {aAm} = {aPts} points. Someone else has {bSol} SOL bid {bPct}% under for an hour: {bSol} × {bDm} × {bAm} = {bPts} points. You get {aPts}/{total} of the pot, they get {bPts}/{total}.',
    footnote: 'The pot is whatever the coin’s trading produced that round. It can be zero.',
  },
  launchpad: {
    liveTitle: 'FLOORPAD LAUNCH is live.',
    liveBody: 'Every coin launched here pays its own bidders. {burnPct}% of each coin’s fees buys and burns ${ticker}.',
    liveButton: 'Open the launchpad',
    soonTitle: 'Launchpad: soon.',
    soonBody: 'Coins launched here will pay their own bidders.',
  },
  bidders: {
    heading: 'Bidders',
    cols: ['#', 'Wallet', 'Bid', 'Under price', 'Resting', 'Multiplier', 'Share', 'Paid'],
    empty: 'No bids yet. Bid first, earn first.',
    footer: 'Updated {time} · round {n}',
    find: 'Find a wallet', // ADDED
    noMatch: 'No bid from that wallet.', // ADDED
  },
  payouts: {
    heading: 'Payouts',
    lede: 'Every round is one Solana transaction. Open any of them.',
    cols: ['Round', 'Time', 'Pot', 'Bids paid', 'Transaction'],
    link: 'Solscan',
    empty: 'Nothing paid yet. The first payout lands in the first round with a counted bid.',
  },
  rules: {
    headingA: 'One rule:',
    headingB: 'bid it.',
    items: [
      'Creator fees are claimed to the payout wallet each round and split across open bids, in SOL. Solana network fees for the payout come out of the pot.',
      'Only open limit buys for ${ticker}, paid in SOL, within {range}% under the current price, count.',
      'A bid counts after it has rested one full round. Cancel and re-place, and the clock starts over.',
      'A filled or cancelled bid stops earning. Partly filled bids count for what is still open.',
      'A share too small to send carries over to your next payout.',
      'Payouts go to the wallet that owns the bid. Your SOL stays in your Jupiter order, not with Floorpad.',
    ],
  },
  toasts: {
    copied: 'CA copied',
    checked: 'Wallet checked',
    newRound: 'New round: {x} SOL to {n} bids',
    unreachable: 'Could not reach the data. Trying again.',
  },
  footer: {
    line: 'FLOORPAD · be the floor, get paid.',
    risk: 'Not financial advice. Meme coins can lose all their value. A bid is a real buy order and can fill. Verify the contract on the official X.',
    links: { x: 'X', jupiter: 'Jupiter', payout: 'Payout wallet' },
  },
};
