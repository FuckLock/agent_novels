interface TextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}

export default function Textarea({ value, onChange, placeholder, rows = 4 }: TextareaProps) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full rounded-[var(--tf-radius-sm)] border border-[var(--tf-border-subtle)] bg-[var(--tf-bg-panel)] px-3 py-2 font-mono text-sm text-[var(--tf-text-primary)] placeholder:text-[var(--tf-text-muted)] focus:border-[var(--tf-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--tf-accent-primary-soft)]"
    />
  );
}
