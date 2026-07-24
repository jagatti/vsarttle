export type BasicRank = "S" | "A" | "B";
export type ScoreRank = "SS" | "S" | "A" | "B" | "C";

export interface FloorRecord {
  continued: boolean;
  charactersUsed: number;
  clearTurn: number;
}

export interface FloorScoreDetail {
  floor: number;
  continueRank: BasicRank;
  characterRank: BasicRank;
  turnRank: BasicRank;
  score: ScoreRank;
  basePointTotal: number;
}

function basicRankToPoint(rank: BasicRank): number {
  if (rank === "S") return 2;
  if (rank === "A") return 0;
  return -1;
}

export function getContinueRank(continued: boolean): BasicRank {
  return continued ? "B" : "S";
}

export function getCharacterRank(floor: number, charactersUsed: number): BasicRank {
  if (floor === 5) {
    return charactersUsed <= 2 ? "S" : "A";
  }
  if (charactersUsed <= 1) return "S";
  if (charactersUsed === 2) return "A";
  return "B";
}

export function getTurnRank(floor: number, clearTurn: number): BasicRank {
  if (floor <= 3) {
    if (clearTurn <= 10) return "S";
    if (clearTurn <= 16) return "A";
    return "B";
  }
  if (floor === 4) {
    if (clearTurn <= 16) return "S";
    if (clearTurn <= 21) return "A";
    return "B";
  }
  if (clearTurn <= 24) return "S";
  if (clearTurn <= 26) return "A";
  return "B";
}

export function floorPointToScoreRank(point: number): ScoreRank {
  if (point >= 6) return "SS";
  if (point >= 4) return "S";
  if (point >= 2) return "A";
  if (point >= -1) return "B";
  return "C";
}

export function scoreRankToPoint(rank: ScoreRank): number {
  if (rank === "SS") return 2;
  if (rank === "S") return 1;
  if (rank === "A") return 0;
  if (rank === "B") return -1;
  return -2;
}

export function totalPointToScoreRank(point: number): ScoreRank {
  if (point >= 8) return "SS";
  if (point >= 5) return "S";
  if (point >= 0) return "A";
  if (point === -1) return "B";
  return "C";
}

export function getFloorScoreDetail(floor: number, record: FloorRecord): FloorScoreDetail {
  const continueRank = getContinueRank(record.continued);
  const characterRank = getCharacterRank(floor, record.charactersUsed);
  const turnRank = getTurnRank(floor, record.clearTurn);
  const basePointTotal =
    basicRankToPoint(continueRank) +
    basicRankToPoint(characterRank) +
    basicRankToPoint(turnRank);

  return {
    floor,
    continueRank,
    characterRank,
    turnRank,
    score: floorPointToScoreRank(basePointTotal),
    basePointTotal,
  };
}

export function getTotalScoreRank(ranks: ScoreRank[]): { rank: ScoreRank; point: number } {
  const point = ranks.reduce((sum, rank) => sum + scoreRankToPoint(rank), 0);
  return {
    rank: totalPointToScoreRank(point),
    point,
  };
}
