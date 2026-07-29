/**
 * Exactly the slice of the extension API this PoC touches. Pulling in
 * @types/chrome would add megabytes of declarations to describe one function.
 */
declare const chrome: {
  runtime: {
    getURL(path: string): string;
  };
};
