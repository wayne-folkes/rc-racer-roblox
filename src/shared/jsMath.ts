// The JavaScript Math functions the game code uses, built on Luau's math library. Luau has no Math
// global, so modules copied from rc-racer import this instead of having every call rewritten.

export const Infinity = math.huge;

export const Math = {
  PI: math.pi,
  abs: (x: number) => math.abs(x),
  atan2: (y: number, x: number) => math.atan2(y, x),
  cos: (x: number) => math.cos(x),
  exp: (x: number) => math.exp(x),
  floor: (x: number) => math.floor(x),
  hypot: (x: number, y: number) => math.sqrt(x * x + y * y),
  // Math.imul: the low 32 bits of a * b. JS returns it signed, this returns it unsigned; both are the
  // same value mod 2^32. Split into 16-bit halves so no product exceeds 2^32, and reduce with % rather
  // than bit operations on sums above 2^32.
  imul: (a: number, b: number) => {
    const ah = a >>> 16;
    const al = a & 0xffff;
    const bh = b >>> 16;
    const bl = b & 0xffff;
    // The high halves multiply to a multiple of 2^32, so they drop out; the cross terms only matter mod 2^16.
    const cross = ((ah * bl) & 0xffff) + ((al * bh) & 0xffff);
    return (al * bl + (cross & 0xffff) * 65536) % 4294967296;
  },
  max: (a: number, b: number) => math.max(a, b),
  min: (a: number, b: number) => math.min(a, b),
  pow: (x: number, y: number) => math.pow(x, y),
  // JS rounds halves up (Math.round(-2.5) is -2), unlike math.round, which rounds them away from zero.
  round: (x: number) => math.floor(x + 0.5),
  sign: (x: number) => math.sign(x),
  sin: (x: number) => math.sin(x),
  sqrt: (x: number) => math.sqrt(x),
};
