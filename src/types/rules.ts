export type RuleOperator = 'equals' | 'notEquals' | 'contains' | 'in' | 'notIn';
export type MatchMode = 'all' | 'any'; 

export interface RuleCondition {
  field: string;            
  operator: RuleOperator;
  value: string | string[];
}

export interface RuleAction {
  createTicket: boolean;
  acknowledgeAlarm: boolean;
  priority: string;          
  templateName?: string;     
}

export interface FilterRule {
  id: string;
  name: string;
  enabled: boolean;
  conditions: RuleCondition[];
  matchMode: MatchMode;
  actions: RuleAction;
  order: number; 
}
