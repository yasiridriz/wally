import type { Pace } from './types';

/**
 * Running covers ground 2.25x faster than walking (the middle of a 2–2.5x
 * range). Travel time divides by this; planned stop visits do not, so a
 * running budget reaches further and plans longer routes.
 */
export const RUN_SPEED = 2.25;

export const paceSpeed = (pace: Pace | undefined): number => pace === 'run' ? RUN_SPEED : 1;
export const isPace = (value: unknown): value is Pace => value === 'walk' || value === 'run';
