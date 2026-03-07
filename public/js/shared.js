// ═══════════════════════════════════════
//  SHARED CONSTANTS & UTILITIES
// ═══════════════════════════════════════
export const WHEEL_ORDER = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
export const RED_NUMBERS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
export const PLAYER_COLORS = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e91e63','#ff5722','#00bcd4','#cddc39'];

export function numColor(n) { return n === 0 ? 'green' : RED_NUMBERS.has(n) ? 'red' : 'black' }

export function calcPayout(betKey, result) {
  if (betKey.startsWith('n')) return result === parseInt(betKey.slice(1)) ? 35 : 0;
  if (betKey.startsWith('sp_')) { const nums = betKey.slice(3).split('_').map(Number); return nums.includes(result) ? 17 : 0; }
  if (betKey.startsWith('cr_')) { const nums = betKey.slice(3).split('_').map(Number); if (!nums.includes(result)) return 0; return nums.length === 3 ? 11 : 8; }
  if (betKey.startsWith('st_')) { const nums = betKey.slice(3).split('_').map(Number); return nums.includes(result) ? 11 : 0; }
  if (betKey.startsWith('sl_')) { const parts = betKey.slice(3).split('_').map(Number); return result >= parts[0] && result <= parts[1] ? 5 : 0; }
  if (betKey === 'basket') return [0, 1, 2, 3].includes(result) ? 8 : 0;
  if (result === 0) return 0;
  switch (betKey) {
    case 'red': return RED_NUMBERS.has(result) ? 1 : 0;
    case 'black': return !RED_NUMBERS.has(result) ? 1 : 0;
    case 'odd': return result % 2 === 1 ? 1 : 0;
    case 'even': return result % 2 === 0 ? 1 : 0;
    case 'low': return result >= 1 && result <= 18 ? 1 : 0;
    case 'high': return result >= 19 && result <= 36 ? 1 : 0;
    case 'doz1': return result >= 1 && result <= 12 ? 2 : 0;
    case 'doz2': return result >= 13 && result <= 24 ? 2 : 0;
    case 'doz3': return result >= 25 && result <= 36 ? 2 : 0;
    case 'col1': return result % 3 === 1 ? 2 : 0;
    case 'col2': return result % 3 === 2 ? 2 : 0;
    case 'col3': return result % 3 === 0 ? 2 : 0;
    default: return 0;
  }
}

export function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML }

export function betLabel(key) {
  if (key.startsWith('n')) return '#' + key.slice(1);
  if (key.startsWith('sp_')) return 'Split ' + key.slice(3).replace(/_/g, '-');
  if (key.startsWith('cr_')) return 'Corner ' + key.slice(3).replace(/_/g, '-');
  if (key.startsWith('st_')) return 'Street ' + key.slice(3).replace(/_/g, '-');
  if (key.startsWith('sl_')) return 'Line ' + key.slice(3).replace(/_/g, '-');
  if (key === 'basket') return 'Basket 0-1-2-3';
  const labels = { red:'Red', black:'Black', odd:'Odd', even:'Even', low:'1-18', high:'19-36',
    doz1:'1st 12', doz2:'2nd 12', doz3:'3rd 12', col1:'Col 1', col2:'Col 2', col3:'Col 3' };
  return labels[key] || key;
}
