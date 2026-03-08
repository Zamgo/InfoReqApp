import React from "react";

interface DocLinkProps {
  href?: string;
  label: string;
  type?: 'ifc' | 'ids';
  className?: string;
}

/**
 * Component for displaying documentation links with text badges IDS / IFC
 * - IFC links: buildingSMART IFC technical documentation
 * - IDS links: buildingSMART IDS documentation on GitHub
 */
export const DocLink: React.FC<DocLinkProps> = ({ href, label, type, className = "" }) => {
  if (!href) return null;

  const docType = type || (href.includes('github.com/buildingSMART/IDS') ? 'ids' : 'ifc');
  const badge = docType.toUpperCase();
  const tooltipText = docType === 'ids'
    ? `Otevřít IDS dokumentaci: ${label}`
    : `Otevřít IFC dokumentaci pro ${label}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center shrink-0 rounded px-2 py-1 text-xs font-semibold uppercase tracking-wide bg-slate-200 text-slate-600 hover:bg-red-700 hover:text-white transition-colors ${className}`}
      title={tooltipText}
    >
      {badge}
    </a>
  );
};
