export interface PhysicsConstants {
  G: number;
  alpha: number;
  strongForce: number;
  weakForce: number;
  lambda: number;
  c: number;
  hbar: number;
  darkMatter: number;
  baryon: number;
  H0: number;
  softening: number;
}

export const DEFAULT_CONSTANTS: PhysicsConstants = {
    G: 1.0,
    alpha: 1.0,
    strongForce: 1.0,
    weakForce: 1.0,
    lambda: 1.0,
    c: 1.0,
    hbar: 1.0,
    darkMatter: 0.25,
    baryon: 0.05,
    H0: 0.01,
    softening: 0.1
};
