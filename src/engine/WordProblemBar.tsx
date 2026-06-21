/**
 * WordProblemBar — the shared "type a word problem → model it" row that sits
 * atop every equation-based widget. Pure presentation: the parent owns the text
 * and the parse result, this just lays out the input, the Model-it button, an
 * example shortcut, and a one-line confirmation of what was extracted.
 */
import type { ReactNode } from 'react';

interface WordProblemBarProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onExample: () => void;
  busy: boolean;
  placeholder: string;
  /** The confirmation / "couldn't parse" line, rendered below the bar. */
  result?: ReactNode;
}

export default function WordProblemBar({
  value,
  onChange,
  onSubmit,
  onExample,
  busy,
  placeholder,
  result,
}: WordProblemBarProps) {
  return (
    <div className="pmodel__wp">
      <div className="wp__bar">
        <input
          className="wp__input"
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit();
          }}
        />
        <button type="button" className="wp__go" onClick={onSubmit} disabled={busy || !value.trim()}>
          {busy ? 'Modeling…' : 'Model it →'}
        </button>
        <button type="button" className="wp__ex" onClick={onExample}>
          example
        </button>
      </div>
      {result}
    </div>
  );
}
