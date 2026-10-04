export class ApiError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

/** Keep server faults and network internals out of user-facing messages. */
export function errorMessage(error: unknown, fallback = "Permintaan gagal. Silakan coba kembali."): string {
  return error instanceof ApiError ? error.message : fallback;
}

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, { credentials: "include", ...options });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError("Tidak dapat terhubung ke server. Periksa koneksi Anda dan coba kembali.", 0);
  }
  if (response.ok) return response;
  const defaults: Record<number, string> = {
    401: url.includes("/auth/login") ? "Email atau kata sandi salah, atau akun belum disetujui." : "Sesi Anda berakhir. Silakan masuk kembali.",
    403: "Anda tidak memiliki izin untuk tindakan ini.",
    404: "Data tidak ditemukan atau tidak tersedia untuk akun Anda.",
    413: "Data atau file terlalu besar. Kurangi ukuran lalu coba kembali.",
    429: "Terlalu banyak permintaan. Tunggu sebentar lalu coba kembali.",
  };
  let message = defaults[response.status] ?? (response.status >= 500
    ? "Server belum dapat memproses permintaan. Silakan coba kembali."
    : "Periksa data yang Anda masukkan lalu coba kembali.");
  if ([400, 409, 422].includes(response.status)) {
    const body: unknown = await response.json().catch(() => null);
    if (body && typeof body === "object") {
      const data = body as Record<string, unknown>;
      const detail = data.error ?? data.message;
      if (typeof detail === "string" && detail.length <= 300 && !/stack|sql|exception|\bat\s+\S+\(.+:\d+|ER_[A-Z_]+|<[^>]+>/i.test(detail)) message = detail;
    }
  }
  throw new ApiError(message, response.status);
}
