// Makes a clickable div behave like a button for keyboard and screen-reader
// users: focusable, Enter/Space activates, announced as a button.
export const press = (fn, extra = {}) => ({
  role: 'button',
  tabIndex: 0,
  onClick: fn,
  onKeyDown: (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(e); }
  },
  ...extra,
});
