import type { ReactNode } from 'react';

export type StatusVariant = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

interface StatusPillProps {
  children: ReactNode;
  variant?: StatusVariant;
  className?: string;
}

const variants: Record<StatusVariant, string> = {
  neutral: 'bg-[var(--tf-bg-raised)] text-[var(--tf-text-secondary)] border-[var(--tf-border-subtle)]',
  primary: 'bg-[var(--tf-accent-primary-soft)] text-[var(--tf-accent-primary)] border-transparent',
  success: 'bg-[var(--tf-success-soft)] text-[var(--tf-success)] border-transparent',
  warning: 'bg-[var(--tf-warning-soft)] text-[var(--tf-warning)] border-transparent',
  danger: 'bg-[var(--tf-danger-soft)] text-[var(--tf-danger)] border-transparent',
  info: 'bg-[var(--tf-info-soft)] text-[var(--tf-info)] border-transparent',
};

export default function StatusPill({ children, variant = 'neutral', className = '' }: StatusPillProps) {
  return (
    <span
      className={`inline-flex h-6 max-w-full items-center rounded-full border px-2.5 text-xs font-medium leading-none ${variants[variant]} ${className}`}
    >
      <span className="inline-flex min-w-0 items-center truncate">{children}</span>
    </span>
  );
}
