'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

interface MarkdownPreviewProps {
  content: string;
  className?: string;
}

const components: Components = {
  h1: ({ children }) => (
    <h1 className="text-2xl font-semibold text-gray-900 mt-6 mb-3 first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-xl font-semibold text-gray-900 mt-5 mb-2">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-lg font-semibold text-gray-900 mt-4 mb-2">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-base font-semibold text-gray-800 mt-3 mb-1">{children}</h4>
  ),
  p: ({ children }) => (
    <p className="text-sm text-gray-700 leading-relaxed mb-3">{children}</p>
  ),
  a: ({ href, children }) => (
    <a href={href} className="text-purple-600 underline hover:text-purple-700" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  ul: ({ children }) => (
    <ul className="list-disc list-inside text-sm text-gray-700 mb-3 space-y-1">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-inside text-sm text-gray-700 mb-3 space-y-1">{children}</ol>
  ),
  li: ({ children, ...props }) => {
    // GFM task list: checked attribute is present on task list items
    const checked = (props as Record<string, unknown>).checked;
    if (typeof checked === 'boolean') {
      return (
        <li className="list-none flex items-start gap-2">
          <input
            type="checkbox"
            checked={checked}
            readOnly
            className="mt-0.5 accent-purple-600"
          />
          <span>{children}</span>
        </li>
      );
    }
    return <li>{children}</li>;
  },
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-purple-400 bg-gray-50 pl-4 py-2 my-3 text-sm text-gray-600 italic">
      {children}
    </blockquote>
  ),
  code: ({ children, className }) => {
    const isBlock = className?.startsWith('language-');
    if (isBlock) {
      return (
        <code className={`block bg-gray-100 rounded-lg p-4 text-sm font-mono overflow-x-auto my-3 whitespace-pre ${className}`}>
          {children}
        </code>
      );
    }
    return (
      <code className="bg-gray-100 text-pink-600 rounded px-1.5 py-0.5 text-sm font-mono">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="bg-gray-100 rounded-lg p-4 overflow-x-auto my-3">{children}</pre>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-3">
      <table className="w-full text-sm border-collapse border border-gray-200">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-gray-100">{children}</thead>
  ),
  tbody: ({ children }) => (
    <tbody>{children}</tbody>
  ),
  tr: ({ children, ...props }) => {
    // Check if this is inside tbody for zebra striping
    const isEven = typeof (props as Record<string, unknown>).data === 'undefined';
    return <tr className={`border-b border-gray-200 even:bg-gray-50 ${isEven ? '' : ''}`}>{children}</tr>;
  },
  th: ({ children }) => (
    <th className="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-700">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border border-gray-200 px-3 py-2 text-gray-600">{children}</td>
  ),
  hr: () => <hr className="my-4 border-gray-200" />,
  strong: ({ children }) => (
    <strong className="font-semibold text-gray-900">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic">{children}</em>
  ),
  del: ({ children }) => (
    <del className="line-through text-gray-400">{children}</del>
  ),
  img: ({ src, alt }) => (
    <img src={src} alt={alt || ''} className="max-w-full rounded-lg my-3" />
  ),
};

export default function MarkdownPreview({ content, className }: MarkdownPreviewProps) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
