/** Loose string tree so nl/fr can differ from English literals. */
export type DeepLoose<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? readonly DeepLoose<U>[]
    : T extends object
      ? { [K in keyof T]: DeepLoose<T[K]> }
      : T;

/** Top-level catalog keys that are plain strings (SEO title/description). */
export type SiteCopyLeafKey<T> = {
  [K in keyof T]: T[K] extends string ? K : never;
}[keyof T];
