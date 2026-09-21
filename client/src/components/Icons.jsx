import React from 'react';

const I = ({ children, size = 18, viewBox = '0 0 24 24', className = '', filled = false, ...rest }) => (
  <svg
    width={size}
    height={size}
    viewBox={viewBox}
    fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...rest}
  >
    {children}
  </svg>
);

export const D20Icon = (p) => (
  <I {...p}>
    <polygon points="12 2 21 7 21 17 12 22 3 17 3 7" />
    <polygon points="12 6.5 17.5 15.5 6.5 15.5" />
    <line x1="12" y1="2" x2="12" y2="6.5" />
    <line x1="21" y1="7" x2="17.5" y2="15.5" />
    <line x1="3" y1="7" x2="6.5" y2="15.5" />
    <line x1="12" y1="22" x2="17.5" y2="15.5" />
    <line x1="12" y1="22" x2="6.5" y2="15.5" />
  </I>
);

export const SwordIcon = (p) => (
  <I {...p}>
    <path d="M14.5 3.5 20.5 9.5 9 21l-4.5 1.5L3 18l11.5-14.5z" />
    <line x1="13" y1="7" x2="17" y2="11" />
    <line x1="5" y1="16" x2="8" y2="19" />
  </I>
);

export const ShieldIcon = (p) => (
  <I {...p}>
    <path d="M12 2 20 5.5V11c0 5.5-3.4 9.3-8 11-4.6-1.7-8-5.5-8-11V5.5L12 2z" />
  </I>
);

export const HeartIcon = (p) => (
  <I {...p}>
    <path d="M12 20.5C6 16 3 12.7 3 9a4.6 4.6 0 0 1 9-1.5A4.6 4.6 0 0 1 21 9c0 3.7-3 7-9 11.5z" />
  </I>
);

export const BookIcon = (p) => (
  <I {...p}>
    <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5v-17z" />
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
  </I>
);

export const MapIcon = (p) => (
  <I {...p}>
    <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
    <line x1="9" y1="4" x2="9" y2="18" />
    <line x1="15" y1="6" x2="15" y2="20" />
  </I>
);

export const ScrollIcon = (p) => (
  <I {...p}>
    <path d="M6 3h12a2 2 0 0 1 2 2v13a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2z" />
    <line x1="8" y1="8" x2="16" y2="8" />
    <line x1="8" y1="12" x2="16" y2="12" />
    <line x1="8" y1="16" x2="13" y2="16" />
  </I>
);

export const UsersIcon = (p) => (
  <I {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
    <circle cx="17" cy="9" r="2.4" />
    <path d="M16.5 14.6c2.6.3 4.5 2.2 4.5 4.9" />
  </I>
);

export const GearIcon = (p) => (
  <I {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5 13.5 5h-3L12 2.5zM12 21.5 10.5 19h3L12 21.5zM2.5 12 5 10.5v3L2.5 12zM21.5 12 19 13.5v-3l2.5 1.5zM5.3 5.3 8 6.2 6.2 8 5.3 5.3zM18.7 18.7 16 17.8 17.8 16l.9 2.7zM18.7 5.3 17.8 8 16 6.2l2.7-.9zM5.3 18.7 6.2 16 8 17.8l-2.7.9z" />
  </I>
);

export const SkullIcon = (p) => (
  <I {...p}>
    <path d="M12 2a8 8 0 0 0-8 8c0 2.9 1.6 5.4 4 6.8V20a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-3.2c2.4-1.4 4-3.9 4-6.8a8 8 0 0 0-8-8z" />
    <circle cx="9" cy="10.5" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="15" cy="10.5" r="1.4" fill="currentColor" stroke="none" />
    <line x1="10.5" y1="17" x2="10.5" y2="19" />
    <line x1="13.5" y1="17" x2="13.5" y2="19" />
  </I>
);

export const ChatIcon = (p) => (
  <I {...p}>
    <path d="M21 12a8 8 0 0 1-8 8H4l2.2-2.9A8 8 0 1 1 21 12z" />
  </I>
);

export const EyeIcon = (p) => (
  <I {...p}>
    <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" />
    <circle cx="12" cy="12" r="2.8" />
  </I>
);

export const EyeOffIcon = (p) => (
  <I {...p}>
    <path d="M4 5.5C2.8 6.9 2 8.5 2 12c0 0 3.5 6.5 10 6.5 2 0 3.7-.6 5.1-1.5M9.9 5.8A10 10 0 0 1 12 5.5c6.5 0 10 6.5 10 6.5a16.6 16.6 0 0 1-2.3 3.2" opacity="0.9" />
    <line x1="3" y1="3" x2="21" y2="21" />
  </I>
);

export const RulerIcon = (p) => (
  <I {...p}>
    <rect x="2" y="8.5" width="20" height="7" rx="1.5" />
    <path d="M6.5 8.5v3M10 8.5v4.5M13.5 8.5v3M17.5 8.5v4.5" />
  </I>
);

export const PenIcon = (p) => (
  <I {...p}>
    <path d="m4 20 1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1z" />
    <line x1="14.5" y1="6.5" x2="17.5" y2="9.5" />
  </I>
);

export const FogIcon = (p) => (
  <I {...p}>
    <path d="M4 14a5 5 0 0 1 .8-9.8A6 6 0 0 1 16.5 5 4.5 4.5 0 0 1 20 13" />
    <line x1="4" y1="17" x2="20" y2="17" />
    <line x1="6" y1="20.5" x2="18" y2="20.5" />
  </I>
);

export const CrownIcon = (p) => (
  <I {...p}>
    <path d="M3 18h18l-1.2-9-4.8 3.5L12 5l-3 7.5L4.2 9 3 18z" />
  </I>
);

export const SparkleIcon = (p) => (
  <I {...p}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
  </I>
);

export const CampfireIcon = (p) => (
  <I {...p}>
    <path d="M12 3c2.5 2.6 4 4.6 4 7a4 4 0 0 1-8 0c0-2.4 1.5-4.4 4-7z" />
    <line x1="4" y1="21" x2="20" y2="16.5" />
    <line x1="4" y1="16.5" x2="20" y2="21" />
  </I>
);

export const BackpackIcon = (p) => (
  <I {...p}>
    <path d="M7 8a5 5 0 0 1 10 0v12H7V8z" />
    <path d="M7 12h10M9 8V6a3 3 0 0 1 6 0v2" />
    <path d="M10 16h4" />
  </I>
);

export const PlusIcon = (p) => (
  <I {...p}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </I>
);

export const XIcon = (p) => (
  <I {...p}>
    <line x1="5" y1="5" x2="19" y2="19" />
    <line x1="19" y1="5" x2="5" y2="19" />
  </I>
);

export const ChevronLeft = (p) => (
  <I {...p}>
    <polyline points="14 5 7 12 14 19" />
  </I>
);
export const ChevronRight = (p) => (
  <I {...p}>
    <polyline points="10 5 17 12 10 19" />
  </I>
);

export const TargetIcon = (p) => (
  <I {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
  </I>
);

export const WandIcon = (p) => (
  <I {...p}>
    <line x1="4" y1="20" x2="15" y2="9" />
    <path d="M15 4.5 16 7l2.5 1-2.5 1-1 2.5-1-2.5L11.5 8 14 7l1-2.5z" />
    <circle cx="20" cy="13" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="7" cy="6" r="0.8" fill="currentColor" stroke="none" />
  </I>
);

// The app's mark: a d20, in the same gold as the favicon and home-screen icon.
// The gradient reads the theme's own gold variables through `style`, because
// a CSS variable in an SVG presentation attribute is never resolved.
export const DragonLogo = ({ size = 30 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <defs>
      <linearGradient id="dnd-logo-gold" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" style={{ stopColor: 'var(--gold-bright)' }} />
        <stop offset="1" style={{ stopColor: 'var(--gold)' }} />
      </linearGradient>
    </defs>
    <g fill="url(#dnd-logo-gold)">
      <path d="M20.573,4.312l-6-3.6a4.989,4.989,0,0,0-5.146,0l-6,3.6A5.027,5.027,0,0,0,1,8.6v6.8a5.027,5.027,0,0,0,2.427,4.288l6,3.6a4.987,4.987,0,0,0,5.146,0l6-3.6A5.027,5.027,0,0,0,23,15.4V8.6A5.027,5.027,0,0,0,20.573,4.312ZM3.005,8.437l2.733,1.639L3,14.09S3,8.491,3.005,8.437Zm9-5.378L15.3,9H8.7Zm9,10.918-2.73-3.905L21,8.437C21,8.491,21,13.977,21,13.977ZM8.805,11H15.2L12,16.113ZM4.018,16.147l2.943-4.322L10.007,16.7Zm13.029-4.334,3.027,4.332L14,16.683Zm2.5-5.786a2.98,2.98,0,0,1,.668.548L17.233,8.361l-3.1-5.579Zm-15.086,0L9.868,2.781,6.77,8.363,3.789,6.575A2.98,2.98,0,0,1,4.457,6.027Zm.44,12.21L11,18.8v3.03a3.022,3.022,0,0,1-.543-.257Zm8.646,3.335a3.022,3.022,0,0,1-.543.257v-3.05l6.1-.54Z" />
    </g>
  </svg>
);

// Simple polyhedral die shapes for the dice tray
export const DieShape = ({ sides, size = 30, label }) => {
  const shapes = {
    4: <polygon points="50,8 94,88 6,88" />,
    6: <rect x="14" y="14" width="72" height="72" rx="8" />,
    8: <polygon points="50,5 92,50 50,95 8,50" />,
    10: <polygon points="50,5 90,35 78,90 22,90 10,35" />,
    12: <polygon points="50,4 84,20 96,55 74,90 26,90 4,55 16,20" />,
    20: <polygon points="50,3 91,26 91,74 50,97 9,74 9,26" />,
    100: <polygon points="50,5 90,35 78,90 22,90 10,35" />,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="die-shape">
      <g fill="none" stroke="currentColor" strokeWidth="6" strokeLinejoin="round">
        {shapes[sides] || shapes[6]}
      </g>
      <text x="50" y="50" dy="0.36em" textAnchor="middle" fontFamily="Cinzel, Georgia, serif" fontWeight="700" fontSize={sides === 100 ? 30 : 36} fill="currentColor" stroke="none">
        {label || sides}
      </text>
    </svg>
  );
};

// ---- control / chrome glyphs (replace text symbols & emoji) ----

export const MinusIcon = (p) => (
  <I {...p}>
    <line x1="5" y1="12" x2="19" y2="12" />
  </I>
);

export const ChevronDown = (p) => (
  <I {...p}>
    <polyline points="5 9 12 16 19 9" />
  </I>
);
export const ChevronUp = (p) => (
  <I {...p}>
    <polyline points="5 15 12 8 19 15" />
  </I>
);

export const CopyIcon = (p) => (
  <I {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </I>
);

export const ExpandIcon = (p) => (
  <I {...p}>
    <polyline points="9 4 4 4 4 9" />
    <polyline points="15 4 20 4 20 9" />
    <polyline points="9 20 4 20 4 15" />
    <polyline points="15 20 20 20 20 15" />
  </I>
);

export const LightningIcon = (p) => (
  <I {...p}>
    <polygon points="13 2 4 14 11 14 10 22 20 9 13 9" />
  </I>
);

export const BurstIcon = (p) => (
  <I {...p}>
    <polygon points="12 2 14 9 21 7 16 12 21 17 14 15 12 22 10 15 3 17 8 12 3 7 10 9" />
  </I>
);

export const FlagIcon = (p) => (
  <I {...p}>
    <path d="M5 21V4" />
    <path d="M5 4h11l-2 4 2 4H5" />
  </I>
);

export const PersonIcon = (p) => (
  <I {...p}>
    <circle cx="12" cy="8" r="3.4" />
    <path d="M5 20c0-3.6 3-6 7-6s7 2.4 7 6" />
  </I>
);

export const LockIcon = (p) => (
  <I {...p}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </I>
);

export const Heal2Icon = (p) => (
  <I {...p}>
    <path d="M12 20.5C6 16 3 12.7 3 9a4.6 4.6 0 0 1 9-1.5A4.6 4.6 0 0 1 21 9c0 3.7-3 7-9 11.5z" />
    <line x1="12" y1="9" x2="12" y2="15" />
    <line x1="9" y1="12" x2="15" y2="12" />
  </I>
);

export const TrophyIcon = (p) => (
  <I {...p}>
    <path d="M7 4h10v4a5 5 0 0 1-10 0V4z" />
    <path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3" />
    <line x1="12" y1="13" x2="12" y2="17" />
    <path d="M8 20h8M9 20l.5-3h5l.5 3" />
  </I>
);

export const MoonIcon = (p) => (
  <I {...p}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />
  </I>
);

export const HourglassIcon = (p) => (
  <I {...p}>
    <path d="M6 3h12M6 21h12" />
    <path d="M7 3c0 4 5 5 5 9s-5 5-5 9" />
    <path d="M17 3c0 4-5 5-5 9s5 5 5 9" />
  </I>
);

export const StarIcon = (p) => (
  <I {...p}>
    <polygon points="12 3 14.6 9 21 9.5 16 13.8 17.6 20 12 16.5 6.4 20 8 13.8 3 9.5 9.4 9" />
  </I>
);

export const CoinsIcon = (p) => (
  <I {...p}>
    <ellipse cx="9" cy="7" rx="6" ry="3" />
    <path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7" />
    <path d="M9 15v2c0 1.7 2.7 3 6 3s6-1.3 6-3v-5c0-1.4-1.9-2.6-4.5-2.9" />
  </I>
);

export const PotionIcon = (p) => (
  <I {...p}>
    <path d="M9 3h6M10 3v4l-3.5 6A4 4 0 0 0 10 20h4a4 4 0 0 0 3.5-7L14 7V3" />
    <line x1="7.5" y1="14" x2="16.5" y2="14" />
  </I>
);

/* ================= Condition glyphs =================
   One readable line-drawing per SRD condition, so a status never depends on an
   emoji font. Rendered on tokens, in the sheet and in the rules reference. */

const CONDITION_GLYPHS = {
  blinded: (
    <>
      <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" />
      <line x1="4" y1="20" x2="20" y2="4" />
    </>
  ),
  charmed: <path d="M12 20.5C6 16 3 12.7 3 9a4.6 4.6 0 0 1 9-1.5A4.6 4.6 0 0 1 21 9c0 3.7-3 7-9 11.5z" />,
  deafened: (
    <>
      <path d="M4 15V9h3l5-4v14l-5-4H4z" />
      <line x1="16" y1="9" x2="21" y2="15" />
      <line x1="21" y1="9" x2="16" y2="15" />
    </>
  ),
  frightened: (
    <>
      <path d="M6 20V9a6 6 0 0 1 12 0v11l-3-2-3 2-3-2-3 2z" />
      <line x1="9.5" y1="10" x2="9.5" y2="12" />
      <line x1="14.5" y1="10" x2="14.5" y2="12" />
      <path d="M9.5 16h5" />
    </>
  ),
  grappled: (
    <>
      <path d="M7 8a3 3 0 0 1 0 8h-1a4 4 0 0 1 0-8z" />
      <path d="M17 8a3 3 0 0 0 0 8h1a4 4 0 0 0 0-8z" />
      <line x1="9" y1="12" x2="15" y2="12" />
    </>
  ),
  incapacitated: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <line x1="8" y1="10" x2="8" y2="10.01" />
      <line x1="16" y1="10" x2="16" y2="10.01" />
      <path d="M8.5 16h7" />
    </>
  ),
  invisible: (
    <>
      <path d="M4 12s3.2-5.5 8-5.5 8 5.5 8 5.5-3.2 5.5-8 5.5S4 12 4 12z" strokeDasharray="3 3" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
  paralyzed: (
    <>
      <path d="M13 2 5 13h5l-1 9 8-11h-5l1-9z" />
    </>
  ),
  petrified: (
    <>
      <path d="M5 18 3 10l5-6h8l5 6-2 8z" />
      <path d="M8 4l3 7-4 7M16 4l-3 7 4 7" />
    </>
  ),
  poisoned: (
    <>
      <path d="M9 3h6v3l3 8a6 6 0 0 1-12 0l3-8z" />
      <line x1="10" y1="15" x2="10" y2="15.01" />
      <line x1="14" y1="17" x2="14" y2="17.01" />
    </>
  ),
  prone: (
    <>
      <circle cx="6" cy="14" r="2.6" />
      <path d="M9 17h11" />
      <path d="M9 13l6-2 5 3" />
    </>
  ),
  restrained: (
    <>
      <path d="M12 3v18M3 12h18" />
      <path d="M5 5l14 14M19 5 5 19" />
    </>
  ),
  stunned: (
    <>
      <path d="M12 2 14 9l7-2-5 5 5 5-7-2-2 7-2-7-7 2 5-5-5-5 7 2z" />
    </>
  ),
  unconscious: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8 10.5 10 12l-2 1.5M16 10.5 14 12l2 1.5" />
      <path d="M9 16.5h6" />
    </>
  ),
  concentrating: (
    <>
      <path d="M12 3a5 5 0 0 0-5 5c0 1.6-1.5 2.2-1.5 4A4.5 4.5 0 0 0 10 16.5V21h4v-4.5a4.5 4.5 0 0 0 4.5-4.5c0-1.8-1.5-2.4-1.5-4a5 5 0 0 0-5-5z" />
    </>
  ),
};

export const ConditionIcon = ({ index, size = 14, ...rest }) => (
  <I size={size} {...rest}>
    {CONDITION_GLYPHS[index] || <circle cx="12" cy="12" r="7" />}
  </I>
);

/* ================= Board & builder icons ================= */

export const BrushIcon = (p) => (
  <I {...p}>
    <rect x="2.5" y="4.5" width="19" height="15" rx="1.5" />
    <path d="M2.5 9.5h19M2.5 14.5h19" />
    <path d="M9 4.5v5M15 4.5v5M6 9.5v5M12 9.5v5M18 9.5v5M9 14.5v5M15 14.5v5" />
  </I>
);

export const EraserIcon = (p) => (
  <I {...p}>
    <path d="M7.5 20 3 15.5 13 5.5l5 5z" />
    <path d="M10 22h11" />
    <path d="M13 5.5 18 10.5 21 7.5 16 2.5z" />
  </I>
);

export const SquareIcon = (p) => (
  <I {...p}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
  </I>
);

export const RoomIcon = (p) => (
  <I {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
    <path d="M3.5 12h4M16.5 12h4" />
  </I>
);

export const BucketIcon = (p) => (
  <I {...p}>
    <path d="M6 8.5 12.5 2 21 10.5 14.5 17z" />
    <path d="M6 8.5 2.5 12 9 18.5" />
    <path d="M20 15c1.3 2 2 3.2 2 4a2 2 0 1 1-4 0c0-.8.7-2 2-4z" />
  </I>
);

export const LayersIcon = (p) => (
  <I {...p}>
    <path d="M12 3 2.5 8 12 13l9.5-5z" />
    <path d="M2.5 12.5 12 17.5l9.5-5" />
    <path d="M2.5 17 12 22l9.5-5" />
  </I>
);

export const ListIcon = (p) => (
  <I {...p}>
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <circle cx="3.8" cy="6" r="1.3" />
    <circle cx="3.8" cy="12" r="1.3" />
    <circle cx="3.8" cy="18" r="1.3" />
  </I>
);

export const PlayIcon = (p) => (
  <I {...p}>
    <path d="M7 4.5 19.5 12 7 19.5z" />
  </I>
);

export const CheckIcon = (p) => (
  <I {...p}>
    <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
  </I>
);

export const PencilIcon = (p) => (
  <I {...p}>
    <path d="M4 20h4L20 8l-4-4L4 16z" />
    <path d="M14.5 5.5 18.5 9.5" />
  </I>
);

export const TrashIcon = (p) => (
  <I {...p}>
    <path d="M4 7h16" />
    <path d="M9 7V4.5h6V7" />
    <path d="M6 7l1 13h10l1-13" />
    <path d="M10 11v6M14 11v6" />
  </I>
);

export const DuplicateIcon = (p) => (
  <I {...p}>
    <rect x="8.5" y="3.5" width="12" height="12" rx="2" />
    <path d="M15.5 19.5A1.5 1.5 0 0 1 14 21H5a2 2 0 0 1-2-2V9a1.5 1.5 0 0 1 1.5-1.5" />
  </I>
);

export const ResizeIcon = (p) => (
  <I {...p}>
    <path d="M4 10V4h6" />
    <path d="M20 14v6h-6" />
    <path d="M4 4l7 7M20 20l-7-7" />
  </I>
);

export const SwatchIcon = (p) => (
  <I {...p}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
  </I>
);

export const HandIcon = (p) => (
  <I {...p}>
    <path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11" />
    <path d="M12 11V4.5a1.5 1.5 0 0 1 3 0V11" />
    <path d="M15 11V6.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-2.7L3.5 15a1.6 1.6 0 0 1 2.6-1.9L9 16" />
  </I>
);

export const MenuIcon = (p) => (
  <I {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </I>
);

export const InfoIcon = (p) => (
  <I {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5" />
    <line x1="12" y1="7.8" x2="12" y2="7.81" />
  </I>
);

export const SearchIcon = (p) => (
  <I {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </I>
);
