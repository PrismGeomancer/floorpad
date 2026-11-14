// "Your bids": look up a wallet in the latest round. No wallet connection, no signatures.
import copy, { fill } from './copy.js';
import { el, $, isAddress, sol, pct, mult, timeShort, toast } from './util.js';

export function initChecker(cfg, getData, refresh, onHighlight) {
  const form = $('#check-form');
  const input = $('#wallet-in');
  const out = $('#check-out');
  const C = copy.checker;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const w = input.value.trim();
    if (!isAddress(w)) {
      out.replaceChildren(el('p', { class: 'wmsg err', text: C.invalid }));
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    input.removeAttribute('aria-invalid');
    out.replaceChildren(el('p', { class: 'wmsg', text: C.loading }));
    await refresh();
    const { round, payouts, error, fromCache } = getData();
    const nodes = [];
    if (error && fromCache && round) nodes.push(el('p', { class: 'wmsg err', text: fill(C.dataError, { time: timeShort(round.time) }) }));

    const bids = (round?.bids ?? []).filter((b) => b.wallet === w);
    const paid = payouts?.byWallet?.[w] ? Number(BigInt(payouts.byWallet[w])) / 1e9 : 0;

    if (!bids.length && !paid) {
      nodes.push(el('p', { class: 'wmsg', text: C.empty }));
    } else {
      const rest = bids.reduce((a, b) => a + b.sol, 0);
      const pts = bids.reduce((a, b) => a + b.points, 0);
      const share = bids.reduce((a, b) => a + b.sharePct, 0);
      const V = C.rowValues;
      const row = (k, v) => [el('dt', { text: C.rows[k] }), el('dd', { text: v })];
      let msg = null;
      if (!bids.length) msg = C.empty;
      else if (bids.every((b) => b.status === 'out-of-range')) msg = fill(C.outOfRange, { range: cfg.rangePct });
      else if (bids.every((b) => b.status !== 'counted') && bids.some((b) => b.status === 'too-new')) msg = C.tooNew;
      nodes.push(el('dl', { class: 'wcard' }, [
        el('div', {}, row('open', fill(V.open, { n: bids.length }))),
        el('div', {}, row('resting', fill(V.resting, { x: sol(rest) }))),
        el('div', {}, row('points', fill(V.points, { p: mult(pts) }))),
        el('div', {}, row('share', fill(V.share, { s: pct(share, 2) }))),
        el('div', {}, row('paid', fill(V.paid, { x: sol(paid) }))),
        msg ? el('p', { class: 'msg', text: msg }) : null,
      ]));
    }
    out.replaceChildren(...nodes);
    onHighlight(w);
    toast(copy.toasts.checked);
  });
}
