/**
 * Filter rule types for the rule engine.
 */

export type RuleOperator = 'equals' | 'notEquals' | 'contains' | 'in' | 'notIn';
export type MatchMode = 'all' | 'any'; // AND vs OR

export interface RuleCondition {
  field: string;            // dot-notation path e.g. "severity", "deviceCategory", "eventType"
  operator: RuleOperator;
  value: string | string[];
}

export interface RuleAction {
  createTicket: boolean;
  acknowledgeAlarm: boolean;
  priority: string;          // ServiceDesk ticket priority: "High", "Medium", "Low"
  templateName?: string;     // optional ticket description template name
}

export interface FilterRule {
  id: string;
  name: string;
  enabled: boolean;
  conditions: RuleCondition[];
  matchMode: MatchMode;
  actions: RuleAction;
  order: number;            // evaluation order (lower = higher priority)
}
