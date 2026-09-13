import { CHARACTER_TYPES, createBaseProfile, simulateBalanceMatrix } from "@/lib/battleBalanceSim";

const result = simulateBalanceMatrix(CHARACTER_TYPES.map((type) => createBaseProfile(type)));

console.log("Pair win rates");
console.table(
  result.pairResults.map((pair) => ({
    matchup: `${pair.left} vs ${pair.right}`,
    left: `${(pair.leftWinRate * 100).toFixed(1)}%`,
    right: `${(pair.rightWinRate * 100).toFixed(1)}%`,
    draw: `${(pair.drawRate * 100).toFixed(1)}%`,
  })),
);

console.log("Overall win rates");
console.table(
  CHARACTER_TYPES.map((type) => {
    const overall = result.overallResults.find((entry) => entry.name === type)!;
    return {
      type,
      wins: overall.wins,
      games: overall.games,
      winRate: `${(overall.winRate * 100).toFixed(1)}%`,
    };
  }),
);
