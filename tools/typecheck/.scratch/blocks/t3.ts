export function g() {
  if (__DEV__) { console.warn('dev'); }
  const t = setTimeout(() => {}, 10);
  clearTimeout(t);
  void fetch('https://example.com', {headers: {'X-A': 'b'}});
  const s = new URLSearchParams('a=b');
  console.log(s.get('a'));
  const u = new URL('https://example.com/x?y=1');
  console.log(u.hostname, u.searchParams.get('y'));
}
