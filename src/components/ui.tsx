import type { ReactNode } from 'react';

export function ScreenHeading({ title, intro, aside }: { title: string; intro?: ReactNode; aside?: ReactNode }) {
  return (
    <header className="mb-8">
      <h1 id="screen-heading" tabIndex={-1} className="text-[1.75rem] sm:text-[2rem] tracking-tight">
        {title}
      </h1>
      {intro && <p className="mt-2 text-muted">{intro}</p>}
      {aside}
    </header>
  );
}

export function Section({
  id,
  title,
  label,
  children,
  className = '',
}: {
  id?: string;
  title: string;
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section aria-labelledby={headingId} className={`mt-10 ${className}`}>
      {label && <p className="label">{label}</p>}
      <h2 id={headingId} className="text-xl mt-1 mb-3">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="panel bg-mist text-ink-soft">{children}</p>;
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="error">
      {message}
    </p>
  );
}

export function describedBy(...ids: (string | false | undefined)[]) {
  const value = ids.filter(Boolean).join(' ');
  return value || undefined;
}

export function DefinitionList({ items }: { items: { term: string; value: ReactNode }[] }) {
  return (
    <dl className="dl-grid">
      {items.map((item) => (
        <div key={item.term}>
          <dt>{item.term}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function LiveMessage({ message }: { message: string | null }) {
  return (
    <p role="status" aria-live="polite" className="min-h-[1.5rem] text-[0.9375rem] font-semibold text-teal">
      {message}
    </p>
  );
}
