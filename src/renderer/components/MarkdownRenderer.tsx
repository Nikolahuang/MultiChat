import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export default function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={`markdown-body ${className || ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // Code blocks
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !match;
            if (isInline) {
              return (
                <code className="bg-white/10 px-1.5 py-0.5 rounded text-[12px] font-mono text-[#c9d1d9]" {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          // Pre (code block wrapper)
          pre({ children }) {
            return (
              <pre className="bg-[#0d1117] rounded-lg p-3 my-2 overflow-x-auto text-[12px] leading-relaxed border border-white/[0.06]">
                {children}
              </pre>
            );
          },
          // Paragraphs
          p({ children }) {
            return <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>;
          },
          // Links
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#6366F1] hover:text-[#818CF8] underline decoration-[#6366F1]/30 hover:decoration-[#818CF8] transition-colors"
              >
                {children}
              </a>
            );
          },
          // Lists
          ul({ children }) {
            return <ul className="list-disc list-outside ml-4 mb-2 space-y-1">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="list-decimal list-outside ml-4 mb-2 space-y-1">{children}</ol>;
          },
          li({ children }) {
            return <li className="leading-relaxed">{children}</li>;
          },
          // Blockquote
          blockquote({ children }) {
            return (
              <blockquote className="border-l-2 border-[#6366F1]/40 pl-3 my-2 text-white/60 italic">
                {children}
              </blockquote>
            );
          },
          // Headings
          h1({ children }) {
            return <h1 className="text-lg font-bold mt-3 mb-2 text-white/95">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="text-base font-bold mt-2.5 mb-1.5 text-white/90">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="text-sm font-bold mt-2 mb-1 text-white/85">{children}</h3>;
          },
          // Tables
          table({ children }) {
            return (
              <div className="overflow-x-auto my-2">
                <table className="min-w-full border border-white/10 rounded-lg text-[12px]">
                  {children}
                </table>
              </div>
            );
          },
          thead({ children }) {
            return <thead className="bg-white/[0.05]">{children}</thead>;
          },
          th({ children }) {
            return (
              <th className="px-3 py-1.5 text-left font-medium text-white/70 border-b border-white/10">
                {children}
              </th>
            );
          },
          td({ children }) {
            return <td className="px-3 py-1.5 border-b border-white/[0.05]">{children}</td>;
          },
          // Horizontal rule
          hr() {
            return <hr className="border-white/10 my-3" />;
          },
          // Strong / emphasis
          strong({ children }) {
            return <strong className="font-semibold text-white/95">{children}</strong>;
          },
          em({ children }) {
            return <em className="italic text-white/80">{children}</em>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
