import React from "react";

interface DocLinkProps {
  href?: string;
  label: string;
  type?: 'ifc' | 'ids';
  className?: string;
}

/**
 * Component for displaying documentation links with appropriate logos
 * - IFC links: Shows IFC logo for buildingSMART IFC technical documentation
 * - IDS links: Shows IDS logo for buildingSMART IDS documentation on GitHub
 */
export const DocLink: React.FC<DocLinkProps> = ({ href, label, type, className = "" }) => {
  if (!href) return null;
  
  // Determine logo type based on URL if not explicitly provided
  const logoType = type || (href.includes('github.com/buildingSMART/IDS') ? 'ids' : 'ifc');
  const logoSrc = logoType === 'ids' ? '/img/IDS-logo.png' : '/img/IFC-logo.png';
  const tooltipText = logoType === 'ids' 
    ? `Otevřít IDS dokumentaci: ${label}` 
    : `Otevřít IFC dokumentaci pro ${label}`;
  
  return (
    <a 
      href={href} 
      target="_blank" 
      rel="noreferrer" 
      className={`flex items-center opacity-60 hover:opacity-100 transition-opacity ${className}`}
      title={tooltipText}
    >
      <img src={logoSrc} alt={`${logoType.toUpperCase()} logo`} className="h-5 w-auto" />
    </a>
  );
};
