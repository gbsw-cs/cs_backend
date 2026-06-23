export const POSTURE_STATES = [
  'TURTLE_NECK',
  'ROUND_SHOULDER',
  'SHOULDER_ASYMMETRY',
  'DARK_ENV',
  'GOOD_POSTURE',
  'SLOUCH',
  'UNCLASSIFIED',
] as const;

export type PostureState = (typeof POSTURE_STATES)[number];
