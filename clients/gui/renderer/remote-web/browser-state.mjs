import { ClientState } from "@areal/remote-client";

const DATABASE = "areal-remote-browser-v1";
// 浏览器策略可让存储 getter 抛错；拒绝持久化仍须允许仅本次使用。
function optionalBrowserResource(read) {
  try {
    return read();
  } catch {
    return null;
  }
}

class BrowserStore {
  constructor(indexedDB) {
    this.indexedDB = indexedDB;
    this.dbPromise = null;
  }
  async open() {
    if (!this.indexedDB) throw new Error("此浏览器无法记住设备：IndexedDB 不可用");
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        let failed = false;
        const request = this.indexedDB.open(DATABASE, 1);
        request.onupgradeneeded = () => request.result.createObjectStore("state");
        request.onblocked = () => {
          failed = true;
          reject(new Error("浏览器存储升级被其他标签阻塞，请关闭其他 Remote 标签"));
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          if (failed) {
            db.close();
            return;
          }
          db.onversionchange = () => {
            db.close();
            this.dbPromise = null;
            this.onInvalidate(new Error("浏览器存储版本已变化，请重新打开页面"));
          };
          resolve(db);
        };
      }).catch((error) => {
        this.dbPromise = null;
        throw error;
      });
    }
    return this.dbPromise;
  }
  async transaction(write, action) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("state", write ? "readwrite" : "readonly");
      const store = tx.objectStore("state");
      let result, failure;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure ?? tx.error ?? new Error("浏览器存储事务中止"));
      tx.onerror = () => {};
      const request = store.get("current");
      request.onsuccess = () => {
        try {
          const value = action(request.result);
          result = value.result;
          const record = value.record;
          if (write) store.put(record, "current");
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
    });
  }
  close() {
    this.dbPromise?.then((db) => db.close()).catch(() => {});
    this.dbPromise = null;
  }
}

export class BrowserState extends ClientState {
  constructor({
    createIdentity,
    identityId,
    indexedDB = optionalBrowserResource(() => globalThis.indexedDB),
    channel = optionalBrowserResource(() => new BroadcastChannel(DATABASE)),
    onInvalidate = () => {},
    sessionStorage = optionalBrowserResource(() => globalThis.sessionStorage),
  }) {
    const store = new BrowserStore(indexedDB);
    super({
      createIdentity,
      identityId,
      store,
      notifications: channel,
      drafts: sessionStorage,
      draftPrefix: DATABASE,
      onInvalidate,
    });
    store.onInvalidate = (error) => this.invalidate(error);
  }
}
