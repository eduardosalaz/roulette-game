// ═══════════════════════════════════════
//  BETTING TABLE
// ═══════════════════════════════════════
import { numColor } from './shared.js';

function gridToNum(r, c) { return c * 3 + (3 - r) }

// onBetClick(betKey, element) - callback when a bet cell is clicked
let betClickHandler = null;

export function initTable(container, onBetClick) {
  betClickHandler = onBetClick;
  buildTable(container);
}

// Global handler for table cell clicks
window._tableBetClick = function(betKey, el) {
  if (betClickHandler) betClickHandler(betKey, el);
};

function cellClick(betKey) {
  return `onclick="window._tableBetClick('${betKey}',this)"`;
}

function buildTable(sec) {
  let html = '<div class="num-grid">';
  html += `<div class="num-cell cgreen" style="grid-column:1;grid-row:1/span 5;font-size:1.5rem;border-radius:6px 0 0 6px" data-bet="n0" ${cellClick('n0')}>0</div>`;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 12; c++) {
    const n = gridToNum(r, c), gc = 3 + c * 2, gr = 1 + r * 2;
    const cls = numColor(n) === 'red' ? 'cred' : 'cblack';
    html += `<div class="num-cell ${cls}" style="grid-column:${gc};grid-row:${gr}" data-bet="n${n}" ${cellClick('n' + n)}>${n}</div>`;
  }
  for (let r = 0; r < 3; r++) for (let c = 0; c < 11; c++) {
    const n1 = gridToNum(r, c), n2 = gridToNum(r, c + 1), a = Math.min(n1, n2), b = Math.max(n1, n2);
    const k = `sp_${a}_${b}`, gc = 4 + c * 2, gr = 1 + r * 2;
    html += `<div class="gap-cell" style="grid-column:${gc};grid-row:${gr}" data-bet="${k}" ${cellClick(k)} title="Split ${a}-${b}"><div class="gap-dot"></div></div>`;
  }
  for (let r = 0; r < 2; r++) for (let c = 0; c < 12; c++) {
    const n1 = gridToNum(r, c), n2 = gridToNum(r + 1, c), a = Math.min(n1, n2), b = Math.max(n1, n2);
    const k = `sp_${a}_${b}`, gc = 3 + c * 2, gr = 2 + r * 2;
    html += `<div class="gap-cell" style="grid-column:${gc};grid-row:${gr}" data-bet="${k}" ${cellClick(k)} title="Split ${a}-${b}"><div class="gap-dot"></div></div>`;
  }
  for (let r = 0; r < 2; r++) for (let c = 0; c < 11; c++) {
    const nums = [gridToNum(r, c), gridToNum(r, c + 1), gridToNum(r + 1, c), gridToNum(r + 1, c + 1)].sort((a, b) => a - b);
    const k = `cr_${nums.join('_')}`, gc = 4 + c * 2, gr = 2 + r * 2;
    html += `<div class="gap-cell" style="grid-column:${gc};grid-row:${gr}" data-bet="${k}" ${cellClick(k)} title="Corner ${nums.join('-')}"><div class="gap-dot" style="width:12px;height:12px"></div></div>`;
  }
  for (let r = 0; r < 3; r++) {
    const n = gridToNum(r, 0), k = `sp_0_${n}`, gr = 1 + r * 2;
    html += `<div class="gap-cell" style="grid-column:2;grid-row:${gr}" data-bet="${k}" ${cellClick(k)} title="Split 0-${n}"><div class="gap-dot"></div></div>`;
  }
  html += `<div class="gap-cell" style="grid-column:2;grid-row:2" data-bet="cr_0_2_3" ${cellClick('cr_0_2_3')} title="Corner 0-2-3"><div class="gap-dot" style="width:11px;height:11px"></div></div>`;
  html += `<div class="gap-cell" style="grid-column:2;grid-row:4" data-bet="cr_0_1_2" ${cellClick('cr_0_1_2')} title="Corner 0-1-2"><div class="gap-dot" style="width:11px;height:11px"></div></div>`;
  for (let r = 0; r < 3; r++) {
    const cn = 3 - r, gr = 1 + r * 2;
    html += `<div class="col-bet" style="grid-column:27;grid-row:${gr}" data-bet="col${cn}" ${cellClick('col' + cn)}>2:1</div>`;
  }
  for (let c = 0; c < 12; c++) {
    const n1 = c * 3 + 1, n2 = c * 3 + 2, n3 = c * 3 + 3;
    const k = `st_${n1}_${n2}_${n3}`, gc = 3 + c * 2;
    html += `<div class="street-cell" style="grid-column:${gc};grid-row:7;font-size:.6rem" data-bet="${k}" ${cellClick(k)} title="Street ${n1}-${n2}-${n3}">ST</div>`;
  }
  for (let c = 0; c < 11; c++) {
    const n1 = c * 3 + 1, n6 = (c + 1) * 3 + 3;
    const k = `sl_${n1}_${n6}`, gc = 4 + c * 2;
    html += `<div class="gap-cell" style="grid-column:${gc};grid-row:7" data-bet="${k}" ${cellClick(k)} title="Six Line ${n1}-${n6}"><div class="gap-dot" style="width:11px;height:11px;background:rgba(255,255,255,.18)"></div></div>`;
  }
  html += `<div class="street-cell" style="grid-column:1/span 2;grid-row:7;font-size:.55rem" data-bet="basket" ${cellClick('basket')} title="Basket 0-1-2-3 (8:1)">0-1-2-3</div>`;
  html += '</div>';
  const zw = 52 + 6, nw = 54 * 12 + 6 * 11, tw = zw + nw + 54;
  html += `<div class="outside-row" style="width:${tw}px;padding-left:${zw}px">`;
  html += `<div class="obcell" style="flex:1" data-bet="doz1" ${cellClick('doz1')}>1st 12</div>`;
  html += `<div class="obcell" style="flex:1" data-bet="doz2" ${cellClick('doz2')}>2nd 12</div>`;
  html += `<div class="obcell" style="flex:1" data-bet="doz3" ${cellClick('doz3')}>3rd 12</div>`;
  html += '</div>';
  html += `<div class="outside-row" style="width:${tw}px;padding-left:${zw}px">`;
  html += `<div class="obcell" style="flex:1" data-bet="low" ${cellClick('low')}>1-18</div>`;
  html += `<div class="obcell" style="flex:1" data-bet="even" ${cellClick('even')}>EVEN</div>`;
  html += `<div class="obcell" style="flex:1;color:#f55" data-bet="red" ${cellClick('red')}>RED</div>`;
  html += `<div class="obcell" style="flex:1;color:#444" data-bet="black" ${cellClick('black')}>BLACK</div>`;
  html += `<div class="obcell" style="flex:1" data-bet="odd" ${cellClick('odd')}>ODD</div>`;
  html += `<div class="obcell" style="flex:1" data-bet="high" ${cellClick('high')}>19-36</div>`;
  html += '</div>';
  sec.innerHTML = html;
}

export function updateChipStacks(allPlayerBets) {
  // allPlayerBets: [{color, bets: {betKey: amount}}]
  document.querySelectorAll('[data-bet]').forEach(el => {
    const k = el.dataset.bet; if (!k) return;
    const s = el.querySelector('.chip-stack'); if (s) s.remove();
    let chips = [];
    allPlayerBets.forEach(p => {
      const amt = p.bets[k];
      if (amt) chips.push(`<div class="table-chip" style="background:${p.color}">${amt}</div>`);
    });
    if (chips.length) el.insertAdjacentHTML('beforeend', `<div class="chip-stack">${chips.join('')}</div>`);
  });
}

export function highlightWinning(num) {
  document.querySelectorAll('.win-highlight').forEach(el => el.classList.remove('win-highlight'));
  const winCell = document.querySelector(`[data-bet="n${num}"]`);
  if (winCell) winCell.classList.add('win-highlight');
}
