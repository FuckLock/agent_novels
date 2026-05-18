interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export default function Card({ children, className = '' }: CardProps) {
  return (
    <div className={`rounded-[var(--tf-radius-md)] border border-[var(--tf-border-subtle)] bg-[var(--tf-bg-panel)] p-5 shadow-[var(--tf-shadow-panel)] ${className}`}>
      {children}
    </div>
  );
}
