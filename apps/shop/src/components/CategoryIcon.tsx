import type { ReactNode } from 'react';

function Svg({
  children,
  size = 22,
  className,
}: {
  children: ReactNode;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
    >
      {children}
    </svg>
  );
}

/** Icônes rayons boutique — partageables home / mega-menu. */
export function CategoryIcon({
  slug,
  size = 22,
}: {
  slug: string;
  size?: number;
}) {
  switch (slug) {
    case 'tuning':
      // Jauge / performance
      return (
        <Svg size={size}>
          <path
            d="M4.5 16.5A8.5 8.5 0 0119.5 16.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M12 16.5V9.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <circle cx="12" cy="16.5" r="1.6" fill="currentColor" />
          <path
            d="M7 13.2l1.4-1.4M17 13.2l-1.4-1.4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </Svg>
      );
    case 'jantes':
      // Roue / jante
      return (
        <Svg size={size}>
          <circle cx="12" cy="12" r="8.2" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M12 3.8v2.6M12 17.6v2.6M3.8 12h2.6M17.6 12h2.6M6.2 6.2l1.8 1.8M16 16l1.8 1.8M17.8 6.2L16 8M8 16l-1.8 1.8"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </Svg>
      );
    case 'phares':
      // Phare avant
      return (
        <Svg size={size}>
          <path
            d="M4 8.5h7.2c2.9 0 5.3 2.1 5.3 4.7S14.1 18 11.2 18H4V8.5z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="M17.5 9.2l3-1.2M17.5 12.8h3.4M17.5 16.4l3 1.2"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </Svg>
      );
    case 'eclairage':
      // Ampoule LED
      return (
        <Svg size={size}>
          <path
            d="M9 18h6M10 20.5h4"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <path
            d="M12 3.5a5.8 5.8 0 014.2 9.7c-.7.8-1.2 1.7-1.4 2.8H9.2c-.2-1.1-.7-2-1.4-2.8A5.8 5.8 0 0112 3.5z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </Svg>
      );
    case 'housses':
      // Siège / housse
      return (
        <Svg size={size}>
          <path
            d="M7.5 19.5V11c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5v8.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M6 19.5h12"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M9 11.5h6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </Svg>
      );
    case 'electronique':
      // Écran / multimédia
      return (
        <Svg size={size}>
          <rect
            x="3.5"
            y="5.5"
            width="17"
            height="11.5"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="M9 19.5h6M12 17v2.5"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <path
            d="M7 9.5h6M7 12.5h4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </Svg>
      );
    case 'mecanique':
      // Engrenage
      return (
        <Svg size={size}>
          <circle cx="12" cy="12" r="3.1" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M12 3.2v2.4M12 18.4v2.4M3.2 12h2.4M18.4 12h2.4M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </Svg>
      );
    case 'accessoires':
      // Étoile premium
      return (
        <Svg size={size}>
          <path
            d="M12 3.2l2.3 4.7 5.2.8-3.8 3.7.9 5.2L12 15.2l-4.6 2.4.9-5.2-3.8-3.7 5.2-.8L12 3.2z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
        </Svg>
      );
    case 'all':
      // Grille catalogue
      return (
        <Svg size={size}>
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.4" stroke="currentColor" strokeWidth="1.8" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="1.4" stroke="currentColor" strokeWidth="1.8" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1.4" stroke="currentColor" strokeWidth="1.8" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="1.4" stroke="currentColor" strokeWidth="1.8" />
        </Svg>
      );
    default:
      return (
        <Svg size={size}>
          <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="1.8" />
        </Svg>
      );
  }
}
