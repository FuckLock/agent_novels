interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  placeholder?: string;
}

export default function Select({ value, onChange, options, placeholder }: SelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-[var(--tf-radius-sm)] border border-[var(--tf-border-subtle)] bg-[var(--tf-bg-panel)] px-3 py-2 text-sm text-[var(--tf-text-primary)] focus:border-[var(--tf-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--tf-accent-primary-soft)]"
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
