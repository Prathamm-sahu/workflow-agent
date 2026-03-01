import { Alert } from '../types/models';
import { FilterRule, RuleCondition, RuleOperator } from '../types/rules';
import { db } from '../db/in-memory';

/**
 * Evaluates alerts against configurable filter rules.
 * Returns the first matching rule (sorted by order) or null.
 */
export class RuleEngine {
  /**
   * Evaluate an alert against all enabled rules.
   * Returns the first matching rule, or null if none match.
   */
  evaluate(alert: Alert): FilterRule | null {
    const rules = db.getEnabledRulesSorted();

    for (const rule of rules) {
      if (this.matchesRule(alert, rule)) {
        db.addAuditLog('rule_matched', 'alert', alert.id, {
          ruleId: rule.id,
          ruleName: rule.name,
        });
        return rule;
      }
    }

    db.addAuditLog('alert_ignored', 'alert', alert.id, {
      reason: 'No matching rule found',
    });
    return null;
  }

  /**
   * Check if an alert matches a single rule.
   */
  private matchesRule(alert: Alert, rule: FilterRule): boolean {
    if (rule.conditions.length === 0) return true;

    const results = rule.conditions.map((cond) =>
      this.evaluateCondition(alert, cond)
    );

    return rule.matchMode === 'all'
      ? results.every(Boolean)
      : results.some(Boolean);
  }

  /**
   * Evaluate a single condition against an alert.
   */
  private evaluateCondition(alert: Alert, condition: RuleCondition): boolean {
    const fieldValue = this.getFieldValue(alert, condition.field);
    const conditionValue = condition.value;

    return this.applyOperator(fieldValue, condition.operator, conditionValue);
  }

  /**
   * Get a field value from the alert using a simple field name.
   */
  private getFieldValue(alert: Alert, field: string): string {
    const fieldMap: Record<string, string> = {
      severity: alert.severity,
      eventType: alert.eventType,
      deviceCategory: alert.deviceCategory,
      deviceType: alert.deviceType,
      deviceVendor: alert.deviceVendor,
      deviceName: alert.deviceName,
      deviceIp: alert.deviceIp,
      site: alert.site,
      building: alert.building,
      interfaceName: alert.interfaceName,
      monitorName: alert.monitorName,
      message: alert.message,
      entity: alert.entity,
    };

    return fieldMap[field] || '';
  }

  /**
   * Apply comparison operator.
   */
  private applyOperator(
    fieldValue: string,
    operator: RuleOperator,
    conditionValue: string | string[]
  ): boolean {
    const normalizedField = fieldValue.toLowerCase().trim();

    switch (operator) {
      case 'equals':
        return normalizedField === String(conditionValue).toLowerCase().trim();

      case 'notEquals':
        return normalizedField !== String(conditionValue).toLowerCase().trim();

      case 'contains':
        return normalizedField.includes(String(conditionValue).toLowerCase().trim());

      case 'in':
        if (Array.isArray(conditionValue)) {
          return conditionValue.some(
            (v) => v.toLowerCase().trim() === normalizedField
          );
        }
        return false;

      case 'notIn':
        if (Array.isArray(conditionValue)) {
          return !conditionValue.some(
            (v) => v.toLowerCase().trim() === normalizedField
          );
        }
        return true;

      default:
        return false;
    }
  }
}
