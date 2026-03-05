import { Alert } from '../types/models';
import { FilterRule, RuleCondition, RuleOperator } from '../types/rules';
import { db } from '../db/prisma';

export class RuleEngine {
  async evaluate(alert: Alert): Promise<FilterRule | null> {
    const rules = await db.getEnabledRulesSorted();

    for (const rule of rules) {
      if (this.matchesRule(alert, rule)) {
        await db.addAuditLog('rule_matched', 'alert', alert.id, {
          ruleId: rule.id,
          ruleName: rule.name,
        });
        return rule;
      }
    }

    await db.addAuditLog('alert_ignored', 'alert', alert.id, {
      reason: 'No matching rule found',
    });
    return null;
  }

  private matchesRule(alert: Alert, rule: FilterRule): boolean {
    if (rule.conditions.length === 0) return true;

    const results = rule.conditions.map((cond) =>
      this.evaluateCondition(alert, cond)
    );

    return rule.matchMode === 'all'
      ? results.every(Boolean)
      : results.some(Boolean);
  }

  private evaluateCondition(alert: Alert, condition: RuleCondition): boolean {
    const fieldValue = this.getFieldValue(alert, condition.field);
    const conditionValue = condition.value;

    return this.applyOperator(fieldValue, condition.operator, conditionValue);
  }

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
