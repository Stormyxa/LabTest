import React from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

const MathRenderer = React.memo(({ text, noSelect }) => {
  if (!text) return null;
  const parts = text.split(/(\$\$[\s\S]+?\$\$|\$[\s\S]+?\$)/g);
  return (
    <span style={noSelect ? { userSelect: 'none', WebkitUserSelect: 'none', cursor: 'default' } : {}}>
      {parts.map((part, i) => {
        if (part.startsWith('$$') && part.endsWith('$$')) {
          const formula = part.slice(2, -2);
          try {
            return <div key={i} style={{ margin: '10px 0' }} dangerouslySetInnerHTML={{ __html: katex.renderToString(formula, { displayMode: true, throwOnError: false }) }} />;
          } catch (e) { return <span key={i}>{part}</span>; }
        } else if (part.startsWith('$') && part.endsWith('$')) {
          const formula = part.slice(1, -1);
          try {
            return <span key={i} dangerouslySetInnerHTML={{ __html: katex.renderToString(formula, { displayMode: false, throwOnError: false }) }} />;
          } catch (e) { return <span key={i}>{part}</span>; }
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
});

export default MathRenderer;
