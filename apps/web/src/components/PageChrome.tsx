import type { ReactNode } from 'react';

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p className="lead">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-header-actions">{actions}</div> : null}
    </header>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state panel">
      <h2>{title}</h2>
      {description ? <p className="lead">{description}</p> : null}
      {action}
    </div>
  );
}

export function ListPanel({
  title,
  children,
  toolbar,
  id,
}: {
  title?: string;
  toolbar?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section className="panel list-panel" id={id}>
      {(title || toolbar) && (
        <div className="list-panel-head">
          {title ? <h2>{title}</h2> : <span />}
          {toolbar}
        </div>
      )}
      {children}
    </section>
  );
}
