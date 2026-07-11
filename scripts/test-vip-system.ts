import assert from "node:assert/strict";
import { evaluateVipMetrics, VIP_RULES, vipSalaryForRank } from "../lib/domain/vip-rank-service";
import { businessDate } from "../lib/domain/vip-salary-service";
import { vipAchievementRewardForRank } from "../lib/domain/vip-achievement-reward-service";

const evaluate = (qualifiedDirects: number, qualifiedTeamSize: number, directRankLevels: number[] = [], teamRankLevels = directRankLevels, previousRank = "VIP 0") =>
  evaluateVipMetrics({ previousRank, qualifiedDirects, qualifiedTeamSize, directRankLevels, teamRankLevels });

assert.equal(evaluate(0, 0).level, 0, "registration only is VIP 0");
assert.equal(evaluate(4, 4).level, 0, "four qualified directs is VIP 0");
assert.equal(evaluate(5, 5).level, 1, "five qualified directs is VIP 1");

for (const rule of VIP_RULES) {
  const directLevels = rule.achieverScope === "DIRECT" && rule.achieverCount
    ? Array.from({ length: rule.achieverCount }, () => rule.achieverLevel)
    : [];
  const teamLevels = rule.achieverScope === "TEAM" && rule.achieverCount
    ? Array.from({ length: rule.achieverCount }, () => rule.achieverLevel)
    : directLevels;
  const result = evaluate(rule.qualifiedDirects, rule.qualifiedTeamSize, directLevels, teamLevels);
  assert.equal(result.calculatedLevel, rule.level, `VIP ${rule.level} exact boundary`);
}

assert.equal(evaluate(5, 30, [2, 2], [2, 2]).calculatedLevel, 2, "highest eligible rank is selected");
assert.equal(evaluate(5, 30, [2, 2], [2, 2], "VIP 0").level, 2, "stale VIP 0 upgrades to VIP 2");
assert.equal(evaluate(5, 30, [2, 2], [2, 2], "VIP 5").level, 5, "achieved ranks do not downgrade");
assert.equal(evaluate(5, 100, [1, 1, 1], [2, 2, 2]).calculatedLevel, 2, "VIP 3 requires direct VIP 2 achievers");
assert.equal(evaluate(5, 2000, [0, 0, 0], [5, 5, 5]).calculatedLevel, 6, "VIP 6 accepts achievers anywhere in team");
assert.equal(evaluate(5, 100, [3, 3, 3], [3, 3, 3]).calculatedLevel, 3, "higher VIP satisfies lower achiever slot");

for (const rule of VIP_RULES) assert.equal(vipSalaryForRank(`VIP ${rule.level}`), rule.salary, `VIP ${rule.level} salary`);
assert.equal(vipSalaryForRank("VIP 0"), 0, "VIP 0 salary");
assert.equal(businessDate(new Date("2026-07-15T18:30:00.000Z")), "2026-07-16", "salary date uses Asia/Kolkata");
assert.deepEqual(Array.from({length: 10}, (_, index) => vipAchievementRewardForRank(index + 1).toFixed(0)), ["50","100","200","500","1000","3000","5000","10000","25000","50000"], "achievement reward configuration");

console.log(`VIP tests passed: VIP 0 and exact VIP 1-VIP 10 boundaries, scope, permanence, higher-rank matching, salaries, and timezone.`);
