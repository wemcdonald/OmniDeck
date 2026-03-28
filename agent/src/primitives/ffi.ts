import type { FfiType, FfiSymbol, FfiLibrary } from "@omnideck/agent-sdk";

// Lazy-loaded bun:ffi module
let bunFfi: typeof import("bun:ffi") | undefined;
let ffiInitAttempted = false;

async function ensureFfi(): Promise<typeof import("bun:ffi")> {
  if (bunFfi) return bunFfi;
  if (ffiInitAttempted) throw new Error("bun:ffi not available");
  ffiInitAttempted = true;
  try {
    bunFfi = await import("bun:ffi" as string);
    return bunFfi;
  } catch {
    throw new Error("bun:ffi not available (requires Bun runtime)");
  }
}

function mapType(ffi: typeof import("bun:ffi"), t: FfiType): number {
  const { FFIType } = ffi;
  const map: Record<FfiType, number> = {
    void: FFIType.void,
    bool: FFIType.bool,
    i8: FFIType.i8,
    i16: FFIType.i16,
    i32: FFIType.i32,
    i64: FFIType.i64,
    u8: FFIType.u8,
    u16: FFIType.u16,
    u32: FFIType.u32,
    u64: FFIType.u64,
    f32: FFIType.f32,
    f64: FFIType.f64,
    ptr: FFIType.ptr,
  };
  const mapped = map[t];
  if (mapped === undefined) throw new Error(`Unknown FFI type: ${t}`);
  return mapped;
}

export function openLibrary(
  path: string,
  symbols: Record<string, FfiSymbol>,
): FfiLibrary {
  // ensureFfi() must have been called before this (it's async, openLibrary is sync)
  if (!bunFfi) throw new Error("bun:ffi not initialized — call ensureFfi() first");

  const dlSymbols: Record<string, { args: number[]; returns: number }> = {};
  for (const [name, sym] of Object.entries(symbols)) {
    dlSymbols[name] = {
      args: sym.args.map((t) => mapType(bunFfi!, t)),
      returns: mapType(bunFfi!, sym.returns),
    };
  }

  const lib = bunFfi.dlopen(path, dlSymbols as any);

  return {
    call(name: string, ...args: unknown[]): unknown {
      const fn = lib.symbols[name];
      if (!fn) throw new Error(`Symbol not found: ${name}`);
      return (fn as Function)(...args);
    },
    close() {
      lib.close();
    },
  };
}

export { ensureFfi };
