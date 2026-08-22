import type { CSSProperties, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import { InfoTooltip } from './InfoTooltip';
import type { Insight } from '../lib/insights/types';

export type CrmKpiWidgetProps = {
  label: string;
  value: string | number;
  hint?: string;
  badge?: string;
  icon?: LucideIcon;
  accent?: string;
  active?: boolean;
  disabled?: boolean;
  insight?: Insight;
  onClick?: () => void;
  valueClassName?: string;
};

/** Widget KPI CRM — cliquable si `onClick` est fourni. */
export function CrmKpiWidget({
  label,
  value,
  hint,
  badge,
  icon: Icon,
  accent = 'var(--accent)',
  active = false,
  disabled = false,
  insight,
  onClick,
  valueClassName,
}: CrmKpiWidgetProps) {
  const clickable = Boolean(onClick) && !disabled;
  const className = [
    'crm-kpi-widget',
    clickable ? 'is-clickable' : '',
    active ? 'is-active' : '',
    disabled ? 'is-disabled' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const body = (
    <>
      <div className="crm-kpi-widget-head">
        {Icon ? (
          <span
            className="crm-kpi-widget-icon"
            style={{ background: `${accent}18`, color: accent }}
            aria-hidden
          >
            <Icon size={18} strokeWidth={2.25} />
          </span>
        ) : null}
        <div className="crm-kpi-widget-title">
          <span className="crm-kpi-widget-label">
            {label}
            {insight ? <InfoTooltip insight={insight} /> : null}
          </span>
          {badge ? <span className="crm-kpi-widget-badge">{badge}</span> : null}
        </div>
        {clickable ? (
          <ChevronRight size={16} className="crm-kpi-widget-chevron" aria-hidden />
        ) : null}
      </div>
      <div className={['crm-kpi-widget-value', valueClassName].filter(Boolean).join(' ')}>
        {value}
      </div>
      {hint ? <p className="crm-kpi-widget-hint">{hint}</p> : null}
    </>
  );

  if (clickable) {
    return (
      <button
        type="button"
        className={className}
        style={{ '--crm-kpi-accent': accent } as CSSProperties}
        aria-pressed={active}
        onClick={onClick}
      >
        {body}
      </button>
    );
  }

  return (
    <article
      className={className}
      style={{ '--crm-kpi-accent': accent } as CSSProperties}
    >
      {body}
    </article>
  );
}

export function CrmKpiGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={['crm-kpi-grid', className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}
