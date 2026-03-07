import type * as Party from "partykit/server";

// ═══════════════════════════════════════
//  SHARED CONSTANTS (duplicated from client for server-side use)
// ═══════════════════════════════════════
const WHEEL_ORDER = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const RED_NUMBERS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const PLAYER_COLORS = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e91e63','#ff5722','#00bcd4','#cddc39'];
const N_SEG = WHEEL_ORDER.length;

function calcPayout(betKey: string, result: number): number {
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

// ═══════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════
interface PlayerData {
  id: string;
  name: string;
  balance: number;
  color: string;
  bets: Record<string, number>;
  prevBets: Record<string, number>;
  stats: { totalWagered: number; totalWon: number; biggestWin: number; roundsPlayed: number; roundsWon: number };
  lastResult: { won: number; lost: number } | null;
}

interface GameState {
  phase: "lobby" | "betting" | "spinning" | "results";
  players: Record<string, PlayerData>;
  dealerId: string | null;
  history: number[];
  startBalance: number;
  tableMin: number;
  tableMax: number;
  colorIdx: number;
}

// ═══════════════════════════════════════
//  PARTYKIT SERVER
// ═══════════════════════════════════════
export default class RouletteServer implements Party.Server {
  state: GameState;

  constructor(readonly room: Party.Room) {
    this.state = {
      phase: "lobby",
      players: {},
      dealerId: null,
      history: [],
      startBalance: 1000,
      tableMin: 0,
      tableMax: 0,
      colorIdx: 0,
    };
  }

  onConnect(conn: Party.Connection) {
    // Send current full state to newly connected player
    conn.send(JSON.stringify({ type: "fullState", state: this.getPublicState() }));
  }

  onClose(conn: Party.Connection) {
    const player = this.state.players[conn.id];
    if (player) {
      delete this.state.players[conn.id];
      // If dealer left, reassign
      if (this.state.dealerId === conn.id) {
        const ids = Object.keys(this.state.players);
        this.state.dealerId = ids.length > 0 ? ids[0] : null;
      }
      this.broadcast({ type: "playerLeft", playerId: conn.id, dealerId: this.state.dealerId });
    }
  }

  onMessage(message: string, sender: Party.Connection) {
    let msg: any;
    try { msg = JSON.parse(message); } catch { return; }

    switch (msg.type) {
      case "join": return this.handleJoin(sender, msg);
      case "configure": return this.handleConfigure(sender, msg);
      case "startGame": return this.handleStartGame(sender);
      case "placeBet": return this.handlePlaceBet(sender, msg);
      case "removeBet": return this.handleRemoveBet(sender, msg);
      case "clearBets": return this.handleClearBets(sender);
      case "rebet": return this.handleRebet(sender);
      case "spin": return this.handleSpin(sender);
      case "transferDealer": return this.handleTransferDealer(sender, msg);
    }
  }

  handleJoin(conn: Party.Connection, msg: any) {
    const name = (msg.name || "").trim().slice(0, 20);
    if (!name) return this.sendError(conn, "Name required");
    // Check duplicate names
    for (const p of Object.values(this.state.players)) {
      if (p.name.toLowerCase() === name.toLowerCase()) return this.sendError(conn, "Name already taken");
    }
    if (Object.keys(this.state.players).length >= 10) return this.sendError(conn, "Room full");

    const color = PLAYER_COLORS[this.state.colorIdx++ % PLAYER_COLORS.length];
    this.state.players[conn.id] = {
      id: conn.id,
      name,
      balance: this.state.startBalance,
      color,
      bets: {},
      prevBets: {},
      stats: { totalWagered: 0, totalWon: 0, biggestWin: 0, roundsPlayed: 0, roundsWon: 0 },
      lastResult: null,
    };

    // First player becomes dealer
    if (!this.state.dealerId) this.state.dealerId = conn.id;

    // Send full state to the joining player
    conn.send(JSON.stringify({ type: "joined", playerId: conn.id, state: this.getPublicState() }));
    // Broadcast to others
    this.broadcast({ type: "playerJoined", player: this.getPublicPlayer(conn.id) , dealerId: this.state.dealerId }, conn.id);
  }

  handleConfigure(conn: Party.Connection, msg: any) {
    if (conn.id !== this.state.dealerId) return this.sendError(conn, "Only dealer can configure");
    if (this.state.phase !== "lobby") return this.sendError(conn, "Can only configure in lobby");
    if (msg.startBalance) this.state.startBalance = Math.max(100, Math.min(100000, parseInt(msg.startBalance) || 1000));
    if (msg.tableMin !== undefined) this.state.tableMin = Math.max(0, parseInt(msg.tableMin) || 0);
    if (msg.tableMax !== undefined) this.state.tableMax = Math.max(0, parseInt(msg.tableMax) || 0);
    // Update all player balances to new start balance
    for (const p of Object.values(this.state.players)) {
      p.balance = this.state.startBalance;
    }
    this.broadcast({ type: "configured", startBalance: this.state.startBalance, tableMin: this.state.tableMin, tableMax: this.state.tableMax });
  }

  handleStartGame(conn: Party.Connection) {
    if (conn.id !== this.state.dealerId) return this.sendError(conn, "Only dealer can start");
    if (Object.keys(this.state.players).length < 1) return this.sendError(conn, "Need at least 1 player");
    this.state.phase = "betting";
    this.broadcast({ type: "phaseChange", phase: "betting", state: this.getPublicState() });
  }

  handlePlaceBet(conn: Party.Connection, msg: any) {
    if (this.state.phase !== "betting") return this.sendError(conn, "Not in betting phase");
    const p = this.state.players[conn.id];
    if (!p) return;
    const { betKey, amount } = msg;
    if (!betKey || !amount || amount <= 0) return;
    const totalBets = Object.values(p.bets).reduce((s: number, v: any) => s + v, 0);
    if (totalBets + amount > p.balance) return this.sendError(conn, "Insufficient balance");
    if (this.state.tableMax > 0 && (p.bets[betKey] || 0) + amount > this.state.tableMax) return this.sendError(conn, `Max bet: $${this.state.tableMax}`);
    p.bets[betKey] = (p.bets[betKey] || 0) + amount;
    this.broadcast({ type: "betPlaced", playerId: conn.id, betKey, totalOnKey: p.bets[betKey], allBets: this.getAllBets() });
  }

  handleRemoveBet(conn: Party.Connection, msg: any) {
    if (this.state.phase !== "betting") return;
    const p = this.state.players[conn.id];
    if (!p) return;
    const { betKey, amount } = msg;
    if (p.bets[betKey]) {
      p.bets[betKey] -= amount;
      if (p.bets[betKey] <= 0) delete p.bets[betKey];
    }
    this.broadcast({ type: "betUpdated", playerId: conn.id, allBets: this.getAllBets() });
  }

  handleClearBets(conn: Party.Connection) {
    if (this.state.phase !== "betting") return;
    const p = this.state.players[conn.id];
    if (!p) return;
    p.bets = {};
    this.broadcast({ type: "betUpdated", playerId: conn.id, allBets: this.getAllBets() });
  }

  handleRebet(conn: Party.Connection) {
    if (this.state.phase !== "betting") return;
    const p = this.state.players[conn.id];
    if (!p || !p.prevBets || Object.keys(p.prevBets).length === 0) return this.sendError(conn, "No previous bets");
    const prevTotal = Object.values(p.prevBets).reduce((s: number, v: any) => s + v, 0);
    const curTotal = Object.values(p.bets).reduce((s: number, v: any) => s + v, 0);
    if (curTotal + prevTotal > p.balance) return this.sendError(conn, "Insufficient balance for re-bet");
    for (const [k, v] of Object.entries(p.prevBets)) {
      p.bets[k] = (p.bets[k] || 0) + (v as number);
    }
    this.broadcast({ type: "betUpdated", playerId: conn.id, allBets: this.getAllBets() });
  }

  handleSpin(conn: Party.Connection) {
    if (conn.id !== this.state.dealerId) return this.sendError(conn, "Only dealer can spin");
    if (this.state.phase !== "betting") return this.sendError(conn, "Not in betting phase");

    // Check at least one bet
    const anyBets = Object.values(this.state.players).some(p => Object.keys(p.bets).length > 0);
    if (!anyBets) return this.sendError(conn, "No bets placed");

    // Check table min
    if (this.state.tableMin > 0) {
      for (const p of Object.values(this.state.players)) {
        const tb = Object.values(p.bets).reduce((s: number, v: any) => s + v, 0);
        if (tb > 0 && tb < this.state.tableMin) return this.sendError(conn, `${p.name}: min bet $${this.state.tableMin}`);
      }
    }

    // Pick winning number
    const resultIdx = Math.floor(Math.random() * N_SEG);
    const resultNumber = WHEEL_ORDER[resultIdx];

    // Physics params for clients
    const physicsParams = {
      targetPocketIdx: resultIdx,
      wheelOmega: 1.5 + Math.random() * 1.5,
      ballOmega: -(12 + Math.random() * 8),
      ballTheta: Math.random() * Math.PI * 2,
    };

    this.state.phase = "spinning";

    // Clear last results
    for (const p of Object.values(this.state.players)) {
      p.lastResult = null;
    }

    this.broadcast({ type: "spinStart", physicsParams, phase: "spinning" });

    // Calculate payouts and schedule results after animation (~7s)
    setTimeout(() => {
      this.resolveResults(resultNumber);
    }, 7000);
  }

  resolveResults(resultNumber: number) {
    const payouts: Record<string, { won: number; lost: number; newBalance: number }> = {};

    for (const [id, p] of Object.entries(this.state.players)) {
      const totalBet = Object.values(p.bets).reduce((s: number, v: any) => s + v, 0);
      let totalWin = 0;
      for (const [key, amt] of Object.entries(p.bets)) {
        const payout = calcPayout(key, resultNumber);
        if (payout > 0) totalWin += (amt as number) * payout + (amt as number);
      }
      p.prevBets = { ...p.bets };
      const netWin = totalWin - totalBet;
      p.balance = p.balance - totalBet + totalWin;

      if (totalBet > 0) {
        p.stats.totalWagered += totalBet;
        p.stats.roundsPlayed++;
        if (totalWin > 0) {
          p.stats.totalWon += totalWin;
          p.stats.roundsWon++;
          if (netWin > p.stats.biggestWin) p.stats.biggestWin = netWin;
        }
      }

      p.lastResult = netWin > 0 ? { won: netWin, lost: 0 } : totalBet > 0 ? { won: 0, lost: totalBet } : { won: 0, lost: 0 };
      p.bets = {};

      payouts[id] = { won: totalWin, lost: totalBet, newBalance: p.balance };
    }

    this.state.history.unshift(resultNumber);
    if (this.state.history.length > 30) this.state.history.pop();

    this.state.phase = "results";
    this.broadcast({
      type: "spinComplete",
      resultNumber,
      payouts,
      history: this.state.history,
      players: this.getPublicPlayers(),
    });

    // Transition back to betting after a delay
    setTimeout(() => {
      this.state.phase = "betting";
      this.broadcast({ type: "phaseChange", phase: "betting" });
    }, 4000);
  }

  handleTransferDealer(conn: Party.Connection, msg: any) {
    if (conn.id !== this.state.dealerId) return;
    if (this.state.players[msg.targetId]) {
      this.state.dealerId = msg.targetId;
      this.broadcast({ type: "dealerChanged", dealerId: msg.targetId });
    }
  }

  // ═══════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════
  getPublicPlayer(id: string) {
    const p = this.state.players[id];
    if (!p) return null;
    return { id: p.id, name: p.name, balance: p.balance, color: p.color, bets: p.bets, stats: p.stats, lastResult: p.lastResult };
  }

  getPublicPlayers() {
    const result: Record<string, any> = {};
    for (const [id, p] of Object.entries(this.state.players)) {
      result[id] = this.getPublicPlayer(id);
    }
    return result;
  }

  getPublicState() {
    return {
      phase: this.state.phase,
      players: this.getPublicPlayers(),
      dealerId: this.state.dealerId,
      history: this.state.history,
      startBalance: this.state.startBalance,
      tableMin: this.state.tableMin,
      tableMax: this.state.tableMax,
    };
  }

  getAllBets() {
    const result: Array<{ color: string; bets: Record<string, number> }> = [];
    for (const p of Object.values(this.state.players)) {
      result.push({ color: p.color, bets: p.bets });
    }
    return result;
  }

  broadcast(msg: any, excludeId?: string) {
    const data = JSON.stringify(msg);
    for (const conn of this.room.getConnections()) {
      if (conn.id !== excludeId) conn.send(data);
    }
  }

  sendError(conn: Party.Connection, message: string) {
    conn.send(JSON.stringify({ type: "error", message }));
  }
}
