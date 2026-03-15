/**
 * Error type utilities for API error codes and validation keys.
 * Derives union types from nested constant objects for compile-time safety.
 */

import type { API_ERROR, VALIDATION_KEY } from '@/constants/finance';

type RecursiveValues<T> = T extends string ? T : T extends object ? RecursiveValues<T[keyof T]> : never;

export type ApiErrorKey = RecursiveValues<typeof API_ERROR>;
export type ValidationKey = RecursiveValues<typeof VALIDATION_KEY>;
