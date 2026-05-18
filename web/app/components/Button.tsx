interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  type?: 'button' | 'submit';
  disabled?: boolean;
  loading?: boolean;
  size?: 'sm' | 'md';
  'aria-label'?: string;
}

export default function Button({ children, onClick, variant = 'primary', type = 'button', disabled, loading, size = 'md', 'aria-label': ariaLabel }: ButtonProps) {
  const variants = {
    primary: 'bg-[var(--tf-accent-primary)] hover:bg-blue-700 text-white border-transparent',
    secondary: 'bg-[var(--tf-bg-panel)] hover:bg-[var(--tf-bg-raised)] text-[var(--tf-text-primary)] border-[var(--tf-border-subtle)]',
    danger: 'bg-[var(--tf-danger)] hover:bg-red-700 text-white border-transparent',
  };

  const sizes = {
    sm: 'h-8 px-3 text-sm',
    md: 'h-9 px-4 text-sm',
  };

  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      aria-label={ariaLabel}
      className={`inline-flex items-center justify-center gap-2 rounded-[var(--tf-radius-sm)] border font-medium transition ${sizes[size]} ${variants[variant]} ${isDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
