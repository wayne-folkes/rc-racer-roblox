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
  max: (a: number, b: number) => math.max(a, b),
  min: (a: number, b: number) => math.min(a, b),
  pow: (x: number, y: number) => math.pow(x, y),
  sign: (x: number) => math.sign(x),
  sin: (x: number) => math.sin(x),
  sqrt: (x: number) => math.sqrt(x),
};
