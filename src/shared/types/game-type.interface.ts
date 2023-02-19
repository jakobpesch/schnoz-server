import { Match, UnitConstellation } from '@prisma/client';
import { EvaluationCondition } from './evaluation-condition.type';
import { Evaluation } from './evaluation.type';
import { PlacementRuleMap } from './placement-rule-map.type';
import { ScoringRule } from './scoring-rule.type';

export interface GameType {
  shouldChangeActivePlayer: (turn: Match['turn']) => boolean;
  shouldChangeCards: (turn: Match['turn']) => boolean;
  changedCards: () => UnitConstellation[];
  shouldEvaluate: EvaluationCondition;
  evaluate: Evaluation;
  scoringRules: ScoringRule[];
  placementRuleMap: PlacementRuleMap;
}
