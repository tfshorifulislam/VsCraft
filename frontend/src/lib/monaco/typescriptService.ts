import type * as Monaco from "monaco-editor";
import { Project } from "@/types/editor";

let extraLibDisposables: Monaco.IDisposable[] = [];

/**
 * Standard ambient TypeScript declarations for React, Next.js, Lucide, Radix, and utility libraries.
 * These provide the Monaco Editor TypeScript worker with full type-checking capabilities.
 */
const AMBIENT_DECLARATIONS = `
// --- React 19 & JSX Runtime ---
declare namespace JSX {
  interface Element {
    type: any;
    props: any;
    key: any;
  }
  interface IntrinsicElements {
    [elemName: string]: any;
    div: any;
    span: any;
    p: any;
    h1: any;
    h2: any;
    h3: any;
    h4: any;
    h5: any;
    h6: any;
    main: any;
    section: any;
    article: any;
    header: any;
    footer: any;
    nav: any;
    aside: any;
    button: any;
    input: any;
    textarea: any;
    select: any;
    option: any;
    label: any;
    form: any;
    a: any;
    img: any;
    ul: any;
    ol: any;
    li: any;
    code: any;
    pre: any;
    svg: any;
    path: any;
    kbd: any;
    strong: any;
    em: any;
    b: any;
    i: any;
  }
}

declare module "react/jsx-runtime" {
  export const jsx: any;
  export const jsxs: any;
  export const Fragment: any;
}

declare module "react" {
  export type ReactNode = any;
  export type ReactElement = any;
  export type FC<P = {}> = (props: P) => ReactElement | null;
  export type ComponentProps<T> = any;

  export type DetailedHTMLProps<E, T> = E & { ref?: any };
  export type RefAttributes<T> = { ref?: any };
  export type Ref<T> = any;
  export type RefObject<T> = { readonly current: T | null };
  export type MutableRefObject<T> = { current: T };

  export type ForwardRefExoticComponent<P> = {
    (props: P): ReactElement | null;
    displayName?: string;
    defaultProps?: Partial<P>;
    propTypes?: any;
  };

  export type CSSProperties = { [key: string]: any };

  export interface HTMLAttributes<T> {
    className?: string;
    style?: CSSProperties;
    children?: ReactNode;
    id?: string;
    title?: string;
    tabIndex?: number;
    role?: string;
    ariaLabel?: string;
    onClick?: (e: any) => void;
    onKeyDown?: (e: any) => void;
    onKeyUp?: (e: any) => void;
    onChange?: (e: any) => void;
    onSubmit?: (e: any) => void;
    onMouseEnter?: (e: any) => void;
    onMouseLeave?: (e: any) => void;
    [key: string]: any;
  }

  export interface ImgHTMLAttributes<T> extends HTMLAttributes<T> {
    alt?: string;
    crossOrigin?: "anonymous" | "use-credentials" | "";
    decoding?: "async" | "auto" | "sync";
    height?: number | string;
    loading?: "eager" | "lazy";
    referrerPolicy?: string;
    sizes?: string;
    src?: string;
    srcSet?: string;
    useMap?: string;
    width?: number | string;
    onLoad?: (e: any) => void;
    onError?: (e: any) => void;
  }

  export interface AnchorHTMLAttributes<T> extends HTMLAttributes<T> {
    href?: string;
    target?: string;
    rel?: string;
    download?: any;
    as?: string;
  }

  export interface ButtonHTMLAttributes<T> extends HTMLAttributes<T> {
    disabled?: boolean;
    type?: "submit" | "reset" | "button";
    onClick?: (e: any) => void;
    name?: string;
    value?: string | number | readonly string[];
  }

  export interface InputHTMLAttributes<T> extends HTMLAttributes<T> {
    type?: string;
    value?: string | number | readonly string[];
    defaultValue?: string | number | readonly string[];
    placeholder?: string;
    disabled?: boolean;
    readOnly?: boolean;
    required?: boolean;
    onChange?: (e: any) => void;
    onFocus?: (e: any) => void;
    onBlur?: (e: any) => void;
    name?: string;
    checked?: boolean;
    min?: number | string;
    max?: number | string;
    step?: number | string;
  }

  export interface SVGProps<T> extends HTMLAttributes<T> {
    width?: number | string;
    height?: number | string;
    viewBox?: string;
    fill?: string;
    stroke?: string;
    strokeWidth?: number | string;
    strokeLinecap?: string;
    strokeLinejoin?: string;
    xmlns?: string;
    [key: string]: any;
  }

  export function forwardRef<T, P = {}>(
    render: (props: P, ref: any) => ReactElement | null
  ): (props: P & { ref?: any }) => ReactElement | null;

  export function useState<T>(initialState: T | (() => T)): [T, (action: T | ((prev: T) => T)) => void];
  export function useEffect(effect: () => void | (() => void), deps?: any[]): void;
  export function useCallback<T extends (...args: any[]) => any>(callback: T, deps: any[]): T;
  export function useMemo<T>(factory: () => T, deps: any[] | undefined): T;
  export function useRef<T>(initialValue?: T): { current: T };
  export function createContext<T>(defaultValue: T): any;
  export function useContext<T>(context: any): T;
  export function useId(): string;
  export const Fragment: any;
  export default React;
}

declare module "react-dom" {
  export function createRoot(container: any): any;
}

declare module "react-dom/client" {
  export function createRoot(container: any): any;
}

// --- Next.js Framework & App Router ---
declare module "next" {
  export interface NextConfig {
    reactStrictMode?: boolean;
    experimental?: Record<string, any>;
    images?: Record<string, any>;
    turbopack?: Record<string, any>;
    webpack?: (config: any, context: any) => any;
    env?: Record<string, string>;
    pageExtensions?: string[];
    transpilePackages?: string[];
    output?: "standalone" | "export";
    distDir?: string;
    basePath?: string;
    assetPrefix?: string;
    headers?: () => Promise<any[]>;
    rewrites?: () => Promise<any>;
    redirects?: () => Promise<any[]>;
    [key: string]: any;
  }
  export interface Metadata {
    title?: string | { default: string; template?: string; absolute?: string };
    description?: string;
    keywords?: string[] | string;
    icons?: any;
    openGraph?: any;
    twitter?: any;
    metadataBase?: URL;
    alternates?: any;
    manifest?: string;
    viewport?: any;
    [key: string]: any;
  }
  export type NextPage<P = {}, IP = P> = (props: P) => any;
  const Next: any;
  export default Next;
}

declare module "next/image" {
  import * as React from "react";

  export type ImageLoader = (p: ImageLoaderProps) => string;

  export interface ImageLoaderProps {
    src: string;
    width: number;
    quality?: number;
  }

  export type LoadingValue = "lazy" | "eager" | undefined;
  export type PlaceholderValue = "blur" | "empty";
  export type OnLoadingComplete = (img: HTMLImageElement) => void;

  export interface StaticImageData {
    src: string;
    height: number;
    width: number;
    blurDataURL?: string;
    blurWidth?: number;
    blurHeight?: number;
  }

  export interface StaticRequire {
    default: StaticImageData;
  }

  export type StaticImport = StaticRequire | StaticImageData;

  export interface ImageProps {
    src: string | StaticImport;
    alt: string;
    width?: number | string;
    height?: number | string;
    fill?: boolean;
    loader?: ImageLoader;
    quality?: number | string;
    priority?: boolean;
    preload?: boolean;
    loading?: LoadingValue;
    placeholder?: PlaceholderValue;
    blurDataURL?: string;
    unoptimized?: boolean;
    overrideSrc?: string;
    onLoadingComplete?: OnLoadingComplete;
    layout?: string;
    objectFit?: string;
    objectPosition?: string;
    lazyBoundary?: string;
    lazyRoot?: string;
    sizes?: string;
    className?: string;
    style?: React.CSSProperties | Record<string, any>;
    id?: string;
    tabIndex?: number;
    title?: string;
    role?: string;
    ariaLabel?: string;
    crossOrigin?: "anonymous" | "use-credentials" | "";
    decoding?: "async" | "auto" | "sync";
    referrerPolicy?: string;
    onClick?: (e: any) => void;
    onLoad?: (e: any) => void;
    onError?: (e: any) => void;
    [key: string]: any;
  }

  export function getImageProps(props: ImageProps): { props: Record<string, any> };

  const Image: React.ForwardRefExoticComponent<
    ImageProps & React.RefAttributes<HTMLImageElement>
  >;

  export default Image;
}

declare module "next/link" {
  import * as React from "react";
  export interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
    href: string;
    as?: string;
    replace?: boolean;
    scroll?: boolean;
    shallow?: boolean;
    passHref?: boolean;
    prefetch?: boolean;
  }
  const Link: React.FC<LinkProps>;
  export default Link;
}

declare module "next/navigation" {
  export function useRouter(): {
    push: (href: string) => void;
    replace: (href: string) => void;
    refresh: () => void;
    back: () => void;
    forward: () => void;
    prefetch: (href: string) => void;
  };
  export function usePathname(): string;
  export function useSearchParams(): URLSearchParams;
  export function useParams<T = Record<string, string | string[]>>(): T;
  export function redirect(url: string): never;
  export function notFound(): never;
}

declare module "next/font/google" {
  export interface NextFont {
    className: string;
    style: { fontFamily: string; fontWeight?: number | string; fontStyle?: string };
    variable?: string;
  }
  export interface FontOptions {
    weight?: string | string[];
    style?: string | string[];
    subsets?: string[];
    display?: string;
    preload?: boolean;
    fallback?: string[];
    adjustFontFallback?: boolean;
    variable?: string;
    axes?: string[];
  }
  export type FontLoader = (options?: FontOptions) => NextFont;

  export const Geist: FontLoader;
  export const Geist_Mono: FontLoader;
  export const Inter: FontLoader;
  export const Roboto: FontLoader;
  export const Roboto_Mono: FontLoader;
  export const Open_Sans: FontLoader;
  export const Montserrat: FontLoader;
  export const Poppins: FontLoader;
  export const Lato: FontLoader;
  export const Oswald: FontLoader;
  export const Raleway: FontLoader;
  export const Fira_Code: FontLoader;
  export const JetBrains_Mono: FontLoader;
  export const Plus_Jakarta_Sans: FontLoader;

  const defaultFont: FontLoader;
  export default defaultFont;
}

declare module "next/font/local" {
  export interface LocalFontOptions {
    src: string | Array<{ path: string; weight?: string; style?: string }>;
    display?: string;
    weight?: string;
    style?: string;
    fallback?: string[];
    preload?: boolean;
    variable?: string;
    declarations?: Array<{ prop: string; value: string }>;
  }
  export default function localFont(options: LocalFontOptions): {
    className: string;
    style: { fontFamily: string; fontWeight?: number | string; fontStyle?: string };
    variable?: string;
  };
}

declare module "next/server" {
  export class NextRequest extends Request {
    readonly nextUrl: URL;
    readonly cookies: any;
    readonly ip?: string;
    readonly geo?: any;
  }
  export class NextResponse extends Response {
    static json(body: any, init?: ResponseInit): NextResponse;
    static redirect(url: string | URL, status?: number): NextResponse;
    static rewrite(url: string | URL): NextResponse;
    static next(init?: ResponseInit): NextResponse;
    readonly cookies: any;
  }
}

declare module "next/headers" {
  export function cookies(): Promise<any> | any;
  export function headers(): Promise<Headers> | Headers;
  export function draftMode(): Promise<any> | any;
}

declare module "next/dynamic" {
  import * as React from "react";
  export type DynamicOptions<P = {}> = {
    loading?: (props: { error?: Error | null; isLoading?: boolean; pastDelay?: boolean; retry?: () => void }) => React.ReactElement | null;
    ssr?: boolean;
    suspense?: boolean;
  };
  export default function dynamic<P = {}>(
    dynamicOptions: () => Promise<React.ComponentType<P> | { default: React.ComponentType<P> }>,
    options?: DynamicOptions<P>
  ): React.ComponentType<P>;
}

declare module "next/head" {
  import * as React from "react";
  export default function Head({ children }: { children: React.ReactNode }): React.ReactElement;
}

// --- Next.js App Router Global Page & Layout Types ---
interface LayoutProps<T = any> {
  children?: any;
  params?: Promise<Record<string, string | string[]>>;
  [key: string]: any;
}

interface PageProps<T = any> {
  params?: Promise<Record<string, string | string[]>>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
  [key: string]: any;
}

// --- Next.js Image Types & Asset Modules ---
declare module "next/image-types/global" {}

declare module "*.png" {
  import { StaticImageData } from "next/image";
  const content: StaticImageData;
  export default content;
}
declare module "*.svg" {
  const content: any;
  export default content;
}
declare module "*.jpg" {
  import { StaticImageData } from "next/image";
  const content: StaticImageData;
  export default content;
}
declare module "*.jpeg" {
  import { StaticImageData } from "next/image";
  const content: StaticImageData;
  export default content;
}
declare module "*.gif" {
  import { StaticImageData } from "next/image";
  const content: StaticImageData;
  export default content;
}
declare module "*.webp" {
  import { StaticImageData } from "next/image";
  const content: StaticImageData;
  export default content;
}
declare module "*.avif" {
  import { StaticImageData } from "next/image";
  const content: StaticImageData;
  export default content;
}
declare module "*.ico" {
  import { StaticImageData } from "next/image";
  const content: StaticImageData;
  export default content;
}
declare module "*.bmp" {
  import { StaticImageData } from "next/image";
  const content: StaticImageData;
  export default content;
}

// --- lucide-react ---
declare module "lucide-react" {
  import * as React from "react";
  export interface LucideProps extends React.SVGProps<SVGSVGElement> {
    size?: string | number;
    color?: string;
    strokeWidth?: string | number;
    className?: string;
  }
  export type LucideIcon = React.FC<LucideProps>;

  export const Sparkles: LucideIcon;
  export const ArrowRight: LucideIcon;
  export const ArrowLeft: LucideIcon;
  export const Code2: LucideIcon;
  export const Plus: LucideIcon;
  export const Search: LucideIcon;
  export const Folder: LucideIcon;
  export const FolderOpen: LucideIcon;
  export const FolderPlus: LucideIcon;
  export const FolderGit2: LucideIcon;
  export const File: LucideIcon;
  export const FileCode: LucideIcon;
  export const FileText: LucideIcon;
  export const FileJson: LucideIcon;
  export const Check: LucideIcon;
  export const CheckCircle2: LucideIcon;
  export const X: LucideIcon;
  export const AlertCircle: LucideIcon;
  export const ChevronRight: LucideIcon;
  export const ChevronDown: LucideIcon;
  export const ChevronUp: LucideIcon;
  export const ChevronLeft: LucideIcon;
  export const Play: LucideIcon;
  export const Save: LucideIcon;
  export const RefreshCw: LucideIcon;
  export const RotateCcw: LucideIcon;
  export const Download: LucideIcon;
  export const Trash2: LucideIcon;
  export const Edit2: LucideIcon;
  export const Moon: LucideIcon;
  export const Sun: LucideIcon;
  export const Cloud: LucideIcon;
  export const Loader2: LucideIcon;
  export const Terminal: LucideIcon;
  export const Layers: LucideIcon;
  export const Server: LucideIcon;
  export const Globe: LucideIcon;
  export const Lock: LucideIcon;
  export const GitBranch: LucideIcon;
  export const Wrench: LucideIcon;
  export const Settings: LucideIcon;

  // Wildcard fallback for any unlisted Lucide icon
  const icon: LucideIcon;
  export default icon;
}

// --- shadcn/ui & Utility Dependencies ---
declare module "@radix-ui/react-slot" {
  import * as React from "react";
  export interface SlotProps extends React.HTMLAttributes<HTMLElement> {
    children?: React.ReactNode;
  }
  export const Slot: React.ForwardRefExoticComponent<SlotProps & React.RefAttributes<HTMLElement>>;
  export const Slottable: React.FC<{ children: React.ReactNode }>;
}

declare module "class-variance-authority" {
  export type VariantProps<T extends (...args: any) => any> = T extends (props?: infer P) => any ? P : {};
  export type ClassValue = string | number | boolean | undefined | null | { [key: string]: any } | ClassValue[];
  export function cva<T = any>(base?: ClassValue, config?: any): (props?: any) => string;
}

declare module "clsx" {
  export type ClassValue = string | number | boolean | undefined | null | { [key: string]: any } | ClassValue[];
  export function clsx(...inputs: ClassValue[]): string;
  export default clsx;
}

declare module "tailwind-merge" {
  export function twMerge(...classLists: any[]): string;
}
`;

interface MonacoTypeScriptNamespace {
  typescriptDefaults: {
    setCompilerOptions: (options: Record<string, unknown>) => void;
    setDiagnosticsOptions: (options: Record<string, unknown>) => void;
    addExtraLib: (content: string, filePath?: string) => Monaco.IDisposable;
  };
  javascriptDefaults?: {
    setCompilerOptions: (options: Record<string, unknown>) => void;
    setDiagnosticsOptions: (options: Record<string, unknown>) => void;
    addExtraLib: (content: string, filePath?: string) => Monaco.IDisposable;
  };
  ScriptTarget?: { ES2022: number };
  ModuleResolutionKind?: { NodeJs: number };
  ModuleKind?: { ESNext: number };
  JsxEmit?: { ReactJSX: number };
}

/**
 * Configures Monaco's TypeScript language service to match the workspace project,
 * resolving tsconfig options, path aliases (@/*), ambient types, and all workspace files.
 */
export function configureMonacoTypeScript(monaco: typeof Monaco, project: Project) {
  const ts = (monaco.languages as unknown as { typescript: MonacoTypeScriptNamespace })?.typescript;
  if (!ts?.typescriptDefaults) return;

  const tsDefaults = ts.typescriptDefaults;
  const defaultsList = [ts.typescriptDefaults, ts.javascriptDefaults].filter(Boolean) as Array<{
    setCompilerOptions: (options: Record<string, unknown>) => void;
    setDiagnosticsOptions: (options: Record<string, unknown>) => void;
    addExtraLib: (content: string, filePath?: string) => Monaco.IDisposable;
  }>;

  // 1. Determine whether project uses a src/ directory
  const hasSrcDir = project.files.some(
    (f) => f.path.startsWith("src/") || f.path === "src"
  );

  // 2. Resolve tsconfig.json if present in the workspace
  let tsconfigPaths: Record<string, string[]> = hasSrcDir
    ? { "@/*": ["file:///src/*", "file:///*"] }
    : { "@/*": ["file:///*", "file:///src/*"] };

  let skipLibCheck = true;
  let strict = true;
  let allowJs = true;

  const tsconfigFile = project.files.find((f) => f.path === "tsconfig.json");
  if (tsconfigFile) {
    try {
      const parsed = JSON.parse(tsconfigFile.content);
      const opts = parsed.compilerOptions || {};

      if (opts.skipLibCheck !== undefined) {
        skipLibCheck = Boolean(opts.skipLibCheck);
      }
      if (opts.strict !== undefined) {
        strict = Boolean(opts.strict);
      }
      if (opts.allowJs !== undefined) {
        allowJs = Boolean(opts.allowJs);
      }

      if (opts.paths) {
        const resolved: Record<string, string[]> = {};
        for (const [key, paths] of Object.entries(opts.paths)) {
          if (Array.isArray(paths)) {
            resolved[key] = paths.map((p: string) => {
              const cleaned = p.replace(/^\.\//, "").replace(/^\//, "");
              return `file:///${cleaned}`;
            });
          }
        }
        if (Object.keys(resolved).length > 0) {
          tsconfigPaths = resolved;
        }
      }
    } catch {
      // Fallback to detected src paths
    }
  }

  // 3. Configure Monaco TypeScript & JavaScript Compiler Options
  const compilerOptions = {
    target: ts.ScriptTarget?.ES2022 ?? 99,
    allowNonTextExtensions: true,
    moduleResolution: ts.ModuleResolutionKind?.NodeJs ?? 2,
    module: ts.ModuleKind?.ESNext ?? 99,
    noEmit: true,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    jsx: ts.JsxEmit?.ReactJSX ?? 4,
    reactNamespace: "React",
    allowJs,
    resolveJsonModule: true,
    baseUrl: "file:///",
    paths: tsconfigPaths,
    strict,
    skipLibCheck,
  };

  const diagnosticsOptions = {
    noSemanticValidation: false,
    noSyntaxValidation: false,
  };

  for (const defaults of defaultsList) {
    defaults.setCompilerOptions(compilerOptions);
    defaults.setDiagnosticsOptions(diagnosticsOptions);
  }

  // 4. Configure HTML & CSS defaults in Monaco
  const htmlDefaults = (monaco.languages as unknown as { html?: { htmlDefaults?: { setOptions: (opts: unknown) => void } } })?.html?.htmlDefaults;
  if (htmlDefaults?.setOptions) {
    htmlDefaults.setOptions({
      format: { tabSize: 2, insertSpaces: true },
      suggest: { html5: true },
    });
  }

  const cssDefaults = (monaco.languages as unknown as { css?: { cssDefaults?: { setOptions: (opts: unknown) => void } } })?.css?.cssDefaults;
  if (cssDefaults?.setOptions) {
    cssDefaults.setOptions({
      validate: true,
      lint: {
        compatibleVendorPrefixes: "ignore",
        vendorPrefix: "warning",
        duplicateProperties: "warning",
        emptyRules: "warning",
        unknownAtRules: "ignore",
      },
    });
  }

  // 5. Clean up existing extraLib disposables
  extraLibDisposables.forEach((d) => d.dispose());
  extraLibDisposables = [];

  // 6. Register ambient package definitions
  for (const defaults of defaultsList) {
    const ambientDisposable = defaults.addExtraLib(
      AMBIENT_DECLARATIONS,
      "file:///node_modules/@types/workspace-globals/index.d.ts"
    );
    extraLibDisposables.push(ambientDisposable);

    const nextImageDisposable = defaults.addExtraLib(
      AMBIENT_DECLARATIONS,
      "file:///node_modules/next/image.d.ts"
    );
    extraLibDisposables.push(nextImageDisposable);

    const nextGlobalDisposable = defaults.addExtraLib(
      AMBIENT_DECLARATIONS,
      "file:///node_modules/next/image-types/global.d.ts"
    );
    extraLibDisposables.push(nextGlobalDisposable);
  }

  // 7. Register every workspace file into Monaco's language service as an extraLib and Monaco Model
  for (const file of project.files) {
    if (file.isFolder) continue;

    const fileUri = monaco.Uri.parse(`file:///${file.path}`);

    // Register file content as extraLib so TypeScript worker can resolve exports across files
    try {
      const libDisposable = tsDefaults.addExtraLib(file.content, fileUri.toString());
      extraLibDisposables.push(libDisposable);
    } catch {
      // extraLib may already be tracked
    }

    // Ensure model exists in Monaco for language service cross-referencing
    let model = monaco.editor.getModel(fileUri);
    if (!model) {
      const ext = file.name.split(".").pop()?.toLowerCase();
      const language = ext === "tsx" || ext === "ts" ? "typescript" : ext === "jsx" || ext === "js" ? "javascript" : ext === "json" ? "json" : ext === "css" ? "css" : ext === "html" ? "html" : "plaintext";
      model = monaco.editor.createModel(file.content, language, fileUri);
    }
  }
}

/**
 * Restarts and refreshes the Monaco TypeScript language service after framework initialization,
 * package dependency updates, or workspace restructuring.
 */
export function restartMonacoLanguageService(monaco: typeof Monaco, project: Project) {
  configureMonacoTypeScript(monaco, project);
}
