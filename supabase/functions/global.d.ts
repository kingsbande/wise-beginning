declare const Deno: {
  env: {
    get(key: string): string | undefined
  }
  serve(handler: (req: Request) => Promise<Response> | Response): void
}

declare module 'https://esm.sh/@supabase/supabase-js@2.45.4' {
  export function createClient(...args: any[]): any
}
