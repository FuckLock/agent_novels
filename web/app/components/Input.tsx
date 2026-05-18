interface InputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}

export default function Input({ value, onChange, placeholder, type = 'text', disabled = false }: InputProps) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={`w-full rounded-[var(--tf-radius-sm)] border border-[var(--tf-border-subtle)] bg-[var(--tf-bg-panel)] px-3 py-2 text-sm text-[var(--tf-text-primary)] transition-shadow duration-150 placeholder:text-[var(--tf-text-muted)] focus:border-[var(--tf-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--tf-accent-primary-soft)] ${
        disabled ? 'cursor-not-allowed bg-gray-100 text-gray-500' : ''
      }`}
    />
  );
}
