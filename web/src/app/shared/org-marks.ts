/**
 * Original marks for the seeded demo clients (fictional companies), drawn on a 32px grid.
 * Each is one simple symbol for the client's business on its own colour, so a client reads at
 * a glance in tables at 24px. Anyone not listed keeps the one-letter tile.
 */
export interface OrgMark { bg: string; svg: string }

const W = '#fff';

export const ORG_MARKS: Record<string, OrgMark> = {
  // Retail / outdoor: two peaks
  'halden-outdoor-co': { bg: '#2f5d46', svg: `<path d="M5 23 13.2 10.5l4.6 7 2.7-4 6.5 9.5z" fill="${W}"/>` },
  // Healthcare: a soft cross
  'mirabel-health': { bg: '#2563a8', svg: `<path d="M13 7h6v6h6v6h-6v6h-6v-6H7v-6h6z" fill="${W}" stroke="${W}" stroke-width="2" stroke-linejoin="round"/>` },
  // Bank by the water: three tide lines
  'quayside-bank': { bg: '#1e2a44', svg: `<path d="M6 11c2.7-2.4 5.3-2.4 8 0s5.3 2.4 8 0 3.3-1.6 4 0M6 17c2.7-2.4 5.3-2.4 8 0s5.3 2.4 8 0 3.3-1.6 4 0M6 23c2.7-2.4 5.3-2.4 8 0s5.3 2.4 8 0 3.3-1.6 4 0" fill="none" stroke="${W}" stroke-width="2.6" stroke-linecap="round"/>` },
  // Grocer: a fern leaf
  'fern-field-grocers': { bg: '#5f7f2a', svg: `<path d="M9 24C9 14 15 8 24 8c0 9-6 15-15 16z" fill="${W}"/><path d="M10 23 21 11" stroke="#5f7f2a" stroke-width="1.8" stroke-linecap="round"/>` },
  // Freight: an orbit with a moving parcel
  'orbit-freight': { bg: '#e2552c', svg: `<ellipse cx="16" cy="16" rx="10" ry="5.5" transform="rotate(-25 16 16)" fill="none" stroke="${W}" stroke-width="2.2"/><circle cx="16" cy="16" r="3.4" fill="${W}"/><rect x="22" y="7.5" width="4.5" height="4.5" rx="1" fill="${W}"/>` },
  // Education: an open book
  'atlas-learning': { bg: '#a3541c', svg: `<path d="M6 10c4-1.6 7-1.2 10 1v13c-3-2.2-6-2.6-10-1zM26 10c-4-1.6-7-1.2-10 1v13c3-2.2 6-2.6 10-1z" fill="${W}"/>` },
  // Records: a vinyl disc
  'bellweather-records': { bg: '#18181b', svg: `<circle cx="16" cy="16" r="10" fill="none" stroke="${W}" stroke-width="2"/><circle cx="16" cy="16" r="6.2" fill="none" stroke="${W}" stroke-width="1.2" opacity=".55"/><circle cx="16" cy="16" r="2.4" fill="#f0512a"/>` },
  // Housing trust: a sunrise on the horizon
  'sunbridge-housing-trust': { bg: '#e9a800', svg: `<path d="M10 22a6 6 0 0 1 12 0z" fill="#1c1917"/><path d="M5.5 25h21M16 7v3.5M8.6 10.6l2.4 2.4M23.4 10.6 21 13" stroke="#1c1917" stroke-width="2.4" stroke-linecap="round"/>` },
  // Energy: a bolt
  'kestrel-energy': { bg: '#0f766e', svg: `<path d="M18 5 9 18h6l-2 9 10-14h-6z" fill="${W}"/>` },
  // The studio's own work
  'internal': { bg: '#121214', svg: `<rect x="8" y="4.5" width="5" height="5" rx=".8" fill="${W}"/><rect x="14" y="4.5" width="5" height="5" rx=".8" fill="${W}"/><rect x="20" y="4.5" width="5" height="5" rx=".8" fill="${W}"/><rect x="8" y="10.5" width="5" height="5" rx=".8" fill="${W}"/><rect x="8" y="16.5" width="5" height="5" rx=".8" fill="${W}"/><rect x="8" y="22.5" width="5" height="5" rx=".8" fill="${W}"/><rect x="14" y="16.5" width="5" height="5" rx=".8" fill="#f0512a"/>` },
};
