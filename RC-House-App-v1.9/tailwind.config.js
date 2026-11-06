/** Tailwind CSS v3 — RC House
 *  Recompilar após alterar classes:  npm run build:css
 */
module.exports = {
  content: ['./index.html', './js/**/*.js'],
  theme: {
    extend: {
      colors: {
        obsidian: '#0D0D10',
        graphite: '#18181C',
        mist: '#F4F4F6',
        gold: { DEFAULT: '#D4AF37', soft: '#F5ECCF', deep: '#A8862A' },
        ok: '#10B981',
        wait: '#F59E0B',
        bad: '#EF4444'
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        display: ['"Playfair Display"', 'Georgia', 'serif']
      },
      boxShadow: {
        soft: '0 1px 2px rgba(13,13,16,.04), 0 8px 24px -12px rgba(13,13,16,.12)',
        lift: '0 2px 4px rgba(13,13,16,.06), 0 18px 40px -16px rgba(13,13,16,.28)',
        glow: '0 10px 30px -10px rgba(212,175,55,.65)'
      },
      opacity: { 4: '.04', 6: '.06', 7: '.07', 8: '.08', 12: '.12', 35: '.35', 45: '.45', 55: '.55', 92: '.92' },
      screens: { xs: '400px' }
    }
  },
  plugins: []
};
