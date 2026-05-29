// Plain-JS template builders. Each function takes the RenderRequest props
// the worker sends and returns a Satori-compatible node tree. NO JSX needed —
// keeps the runner zero-build (just `node render.mjs`).
//
// Visual fidelity matches the worker-side .tsx templates exactly. If you
// change a TSX template, mirror the change here.

// ── Shared design tokens (mirror src/templates/_design-system.ts) ───────────

const CANVAS = { width: 1000, height: 1500, safeTop: 80, safeBottom: 80, safeSide: 60 };
const SIZE   = { hero: 140, large: 56, body: 36, meta: 26, badge: 30, micro: 22 };
const TYPE   = {
  headline:  { fontFamily: 'BebasNeue',       fontWeight: 400 },
  body:      { fontFamily: 'Barlow',          fontWeight: 400 },
  bodyBold:  { fontFamily: 'Barlow',          fontWeight: 700 },
  condensed: { fontFamily: 'BarlowCondensed', fontWeight: 700 },
};
const SHADOW = {
  card:  '0 18px 40px rgba(0,0,0,0.15)',
  badge: '0 4px 12px rgba(0,0,0,0.2)',
};

const DEFAULT_THEME = {
  primary: '#facc15', background: '#fef3c7',
  textOnDark: '#ffffff', textOnLight: '#0a0a0a',
  headlineFont: 'BebasNeue', bodyFont: 'Barlow',
  badgeStyle: 'rectangle', pexelsVibe: 'modern minimalist',
};

const CATEGORY_THEMES = {
  'espresso-machines': {
    primary: '#92400e', background: '#fef7ed',
    textOnDark: '#fef7ed', textOnLight: '#1c1917',
    badgeStyle: 'pill', pexelsVibe: 'cozy coffee kitchen',
  },
};

function getTheme(slug) { return CATEGORY_THEMES[slug] ?? DEFAULT_THEME; }

function tokensFromTheme(t) {
  return {
    bg: t.background, fg: t.textOnLight,
    accent: t.primary, accentFg: t.textOnDark,
    cardBg: '#ffffff', cardBorder: 'rgba(0,0,0,0.06)',
  };
}

function badgeStyle(style, tk) {
  const base = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backgroundColor: tk.accent, color: tk.accentFg,
    fontFamily: TYPE.condensed.fontFamily, fontWeight: TYPE.condensed.fontWeight,
    letterSpacing: '0.05em', fontSize: SIZE.badge,
    paddingTop: 12, paddingBottom: 12, paddingLeft: 28, paddingRight: 28,
    boxShadow: SHADOW.badge,
  };
  if (style === 'pill') return { ...base, borderRadius: 9999 };
  if (style === 'ribbon') return { ...base, borderRadius: 4, transform: 'skewX(-8deg)' };
  return { ...base, borderRadius: 8 };
}

function formatPrice(p) {
  if (!p || p <= 0) return '';
  if (p >= 1000) return `$${(p / 1000).toFixed(1)}k`;
  return `$${Math.round(p)}`;
}
function formatRating(r) { return r ? `${Number(r).toFixed(1)} ★` : ''; }

function truncate(s, n) {
  if (!s) return '';
  return s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…';
}

// Satori node helper — equivalent of JSX <type style={...}>{children}</type>.
function el(type, props, children) {
  return { type, props: { ...(props ?? {}), children: children ?? undefined } };
}

function sanityImageUrl(raw) {
  if (!raw) return '';
  if (!raw.startsWith('https://cdn.sanity.io/')) return raw;
  const u = new URL(raw);
  u.searchParams.set('w', '1200');
  u.searchParams.set('h', '1200');
  u.searchParams.set('fit', 'max');
  u.searchParams.set('auto', 'format');
  u.searchParams.set('q', '85');
  return u.toString();
}

// ── Template dispatcher ─────────────────────────────────────────────────────

export function buildTemplateTree(req) {
  const theme = getTheme(req.source.category?.slug);
  const productImageUrl = sanityImageUrl(req.source.imageUrl);
  switch (req.templateId) {
    case 'product-highlight-v1': return productHighlight(req, theme, productImageUrl);
    case 'listicle-v1':          return listicle(req, theme);
    case 'comparison-v1':        return comparison(req, theme, productImageUrl);
    case 'roundup-v1':           return roundup(req, theme);
    case 'lifestyle-v1':         return lifestyle(req, theme, productImageUrl);
    case 'seasonal-v1':          return seasonal(req, theme, productImageUrl);
    case 'educational-v1':       return educational(req, theme, productImageUrl);
    default: throw new Error(`Unknown templateId: ${req.templateId}`);
  }
}

// ── product-highlight-v1 ────────────────────────────────────────────────────

function productHighlight(req, theme, productImageUrl) {
  const t = tokensFromTheme(theme);
  const { source, copy } = req;
  const rating = formatRating(source.rating);
  const price = formatPrice(source.price);
  const brand = source.brand ?? source.category?.title ?? 'BestPicks';

  // Adaptive headline size — shrinks for longer text so it never overflows
  // into the product card. Cuts in at ~22/30/40 chars (Pinterest tests
  // showed real headlines cluster around 4 buckets).
  const headlineLen = (copy.headline || '').length;
  const headlineFontSize = headlineLen > 40 ? 80
                         : headlineLen > 30 ? 100
                         : headlineLen > 22 ? 120
                         : SIZE.hero;

  return el('div', { style: {
    width: CANVAS.width, height: CANVAS.height,
    display: 'flex', flexDirection: 'column',
    backgroundColor: t.bg, position: 'relative',
  }}, [
    // Top-right badge
    el('div', { style: {
      position: 'absolute', top: 70, right: 60,
      ...badgeStyle(theme.badgeStyle, t),
    }}, `REVIEW · ${new Date().getFullYear()}`),

    // Headline — adaptive height for short vs long headlines.
    el('div', { style: {
      display: 'flex', flexDirection: 'column',
      paddingTop: CANVAS.safeTop + 60,
      paddingLeft: CANVAS.safeSide, paddingRight: CANVAS.safeSide + 220,
      height: headlineLen > 30 ? 420 : 460,
    }}, [
      el('div', { style: {
        fontFamily: TYPE.headline.fontFamily, fontWeight: TYPE.headline.fontWeight,
        letterSpacing: '-0.01em', lineHeight: 0.95,
        fontSize: headlineFontSize, color: t.fg, textTransform: 'uppercase',
      }}, copy.headline),
    ]),

    // Product card
    el('div', { style: {
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: t.cardBg,
      marginLeft: CANVAS.safeSide, marginRight: CANVAS.safeSide,
      borderRadius: 32, height: 580,
      boxShadow: SHADOW.card, overflow: 'hidden', position: 'relative',
    }}, [
      rating && el('div', { style: {
        position: 'absolute', top: 24, left: 24,
        transform: 'rotate(-3deg)',
        ...badgeStyle('pill', t),
        backgroundColor: '#111111', color: '#facc15',
        fontSize: SIZE.badge - 2,
      }}, rating),
      el('div', { style: {
        position: 'absolute', top: 24, right: 24,
        display: 'flex',
        fontFamily: TYPE.bodyBold.fontFamily, fontWeight: TYPE.bodyBold.fontWeight,
        fontSize: SIZE.micro, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: t.fg, opacity: 0.7,
      }}, brand),
      productImageUrl && el('img', {
        src: productImageUrl, width: 520, height: 520,
        style: { objectFit: 'contain' },
      }),
    ].filter(Boolean)),

    // CTA bar
    el('div', { style: {
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: t.accent,
      marginTop: 60,
      marginLeft: CANVAS.safeSide, marginRight: CANVAS.safeSide,
      borderRadius: 24,
      paddingTop: 28, paddingBottom: 28,
      boxShadow: SHADOW.card,
    }}, [
      el('div', { style: {
        display: 'flex',
        fontFamily: TYPE.headline.fontFamily, fontWeight: TYPE.headline.fontWeight,
        fontSize: SIZE.large + 12, color: t.accentFg,
        letterSpacing: '0.02em', textTransform: 'uppercase',
      }}, price ? `FROM ${price} · CHECK PRICE` : 'SEE LATEST PRICE'),
      el('div', { style: {
        display: 'flex',
        fontFamily: TYPE.body.fontFamily, fontSize: SIZE.meta,
        color: t.accentFg, opacity: 0.85, marginTop: 6,
      }}, 'bestpicksup.com'),
    ]),

    // #ad
    el('div', { style: {
      position: 'absolute', bottom: 20, right: 28,
      display: 'flex',
      fontFamily: TYPE.body.fontFamily, fontSize: SIZE.micro - 2,
      color: t.fg, opacity: 0.55,
    }}, '#ad'),
  ]);
}

// ── listicle-v1 ─────────────────────────────────────────────────────────────

function listicle(req, theme) {
  const t = tokensFromTheme(theme);
  const { source, copy, items = [], totalCount = 9 } = req;
  const rows = items.slice(0, 4);

  return el('div', { style: {
    width: CANVAS.width, height: CANVAS.height,
    display: 'flex', flexDirection: 'column',
    backgroundColor: t.bg, position: 'relative',
  }}, [
    // Headline block
    el('div', { style: {
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      paddingTop: CANVAS.safeTop + 30,
      paddingLeft: CANVAS.safeSide, paddingRight: CANVAS.safeSide,
    }}, [
      el('div', { style: {
        display: 'flex', backgroundColor: t.accent, color: t.accentFg,
        paddingTop: 14, paddingBottom: 14, paddingLeft: 32, paddingRight: 32,
        fontFamily: TYPE.condensed.fontFamily, fontWeight: TYPE.condensed.fontWeight,
        letterSpacing: '0.05em', fontSize: SIZE.badge - 4,
        textTransform: 'uppercase', marginBottom: 20,
      }}, 'Tested · Verified · Ranked'),
      el('div', { style: {
        display: 'flex', textAlign: 'center', justifyContent: 'center',
        fontFamily: TYPE.headline.fontFamily, fontSize: SIZE.hero - 10,
        lineHeight: 0.95, color: t.fg,
        textTransform: 'uppercase', maxWidth: 880,
      }}, copy.headline),
    ]),

    // Rows
    el('div', { style: {
      display: 'flex', flexDirection: 'column',
      marginTop: 70,
      paddingLeft: CANVAS.safeSide, paddingRight: CANVAS.safeSide, flex: 1,
    }}, rows.map((item, i) => el('div', { style: {
      display: 'flex', flexDirection: 'row', alignItems: 'center',
      backgroundColor: t.cardBg, borderRadius: 20,
      paddingTop: 22, paddingBottom: 22, paddingLeft: 24, paddingRight: 24,
      marginBottom: 18, boxShadow: SHADOW.card, border: `1px solid ${t.cardBorder}`,
    }}, [
      el('div', { style: {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 84, height: 84, borderRadius: 9999,
        backgroundColor: t.accent, color: t.accentFg,
        fontFamily: TYPE.headline.fontFamily, fontSize: 64,
        marginRight: 24,
      }}, String(i + 1)),
      el('div', { style: { display: 'flex', flexDirection: 'column', flex: 1 }}, [
        el('div', { style: {
          display: 'flex',
          fontFamily: TYPE.bodyBold.fontFamily, fontWeight: TYPE.bodyBold.fontWeight,
          fontSize: SIZE.body, color: t.fg, lineHeight: 1.1,
        }}, truncate(item.title, 42)),
        el('div', { style: {
          display: 'flex',
          fontFamily: TYPE.body.fontFamily, fontSize: SIZE.meta,
          color: t.fg, opacity: 0.65, marginTop: 4,
        }}, [item.brand, formatRating(item.rating)].filter(Boolean).join(' · ')),
      ]),
    ]))),

    el('div', { style: {
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: t.fg, color: t.bg,
      paddingTop: 26, paddingBottom: 26,
    }}, el('div', { style: {
      display: 'flex',
      fontFamily: TYPE.headline.fontFamily, fontSize: SIZE.large,
      letterSpacing: '0.02em', textTransform: 'uppercase',
    }}, `See all ${totalCount} picks · bestpicksup.com`)),

    el('div', { style: {
      position: 'absolute', bottom: 8, right: 14, display: 'flex',
      fontFamily: TYPE.body.fontFamily, fontSize: SIZE.micro - 4,
      color: t.bg, opacity: 0.6,
    }}, '#ad'),
  ]);
}

// ── Other templates — slim stubs that fall back to product-highlight ────────
//
// These render correctly but use the product-highlight layout. Future enhancement:
// port the full distinct layouts for comparison/roundup/lifestyle/seasonal/educational.
// For now the dispatcher returns them as product-highlight variants — the publisher
// still gets a clean 1000x1500 PNG, just with less template variety than the worker's
// JSX templates produce. Mix will skew toward product-highlight/listicle until ported.

function comparison(req, theme, productImageUrl) { return productHighlight(req, theme, productImageUrl); }
function roundup(req, theme)                     { return productHighlight(req, theme, sanityImageUrl(req.source.imageUrl)); }
function lifestyle(req, theme, productImageUrl)  { return productHighlight(req, theme, productImageUrl); }
function seasonal(req, theme, productImageUrl)   { return productHighlight(req, theme, productImageUrl); }
function educational(req, theme, productImageUrl){ return productHighlight(req, theme, productImageUrl); }
