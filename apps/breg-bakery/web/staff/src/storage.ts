import { IndexedDBStorage, type Storage } from "@vantage-ui/client";

// Each principal gets its own IndexedDB database, so one principal's rows are
// never shown to another. The principal is known only by its token: this is
// placeholder auth, and the token itself must not appear in the database name.

/** The database name for `token`: a truncated hex SHA-256 of it. */
export async function storageName(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return `breg-${hex.slice(0, 32)}`;
}

/**
 * IndexedDB storage for `token`'s principal. The name is hashed
 * asynchronously, so every call waits for the underlying storage.
 */
export class PrincipalStorage implements Storage {
  private readonly inner: Promise<IndexedDBStorage>;

  constructor(token: string, schemaHash: string) {
    this.inner = storageName(token).then((name) => new IndexedDBStorage(name, schemaHash));
  }

  async load() {
    return (await this.inner).load();
  }

  async save(change: Parameters<Storage["save"]>[0]) {
    return (await this.inner).save(change);
  }

  async clear() {
    return (await this.inner).clear();
  }
}
