// Luau globals and roblox-ts array methods the ported code expects, so it runs under Node.
const g = globalThis as any;
g.math = { huge: Infinity, pi: Math.PI, abs: Math.abs, atan2: Math.atan2, cos: Math.cos, exp: Math.exp,
  floor: Math.floor, sqrt: Math.sqrt, max: Math.max, min: Math.min, pow: Math.pow, sign: Math.sign, sin: Math.sin,
  clamp: (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x)),
  // Luau rounds halves away from zero; the same as JavaScript's for the positive numbers used here.
  round: Math.round };
(Array.prototype as any).size = function () { return this.length; };
(Array.prototype as any).insert = function (index: number, value: unknown) { this.splice(index, 0, value); };

// roblox-ts sort comparators return a boolean ("a goes before b"), as Luau's table.sort expects.
// JavaScript would read true/false as 1/0, so translate them; number comparators pass through.
const jsSort = Array.prototype.sort;
Array.prototype.sort = function (this: unknown[], compare?: (a: any, b: any) => any) {
  if (!compare) return jsSort.call(this);
  return jsSort.call(this, (a: unknown, b: unknown) => {
    const r = compare(a, b);
    if (typeof r !== 'boolean') return r;
    return r ? -1 : compare(b, a) ? 1 : 0;
  });
} as typeof Array.prototype.sort;
