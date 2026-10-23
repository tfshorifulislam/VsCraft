declare module "emmet" {
  export interface EmmetOptions {
    syntax?: string;
    type?: "markup" | "stylesheet";
    options?: Record<string, unknown>;
  }
  export default function expand(abbr: string, options?: EmmetOptions): string;
}

