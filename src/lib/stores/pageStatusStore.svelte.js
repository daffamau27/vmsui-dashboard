import { writable } from "svelte/store";

export const pageStatus = writable({
  dataReceived: "-",
  queue: "-",
  sdcard: "-",
  online: false,
  sourcePage: ""
});

export function setPageStatus(status = {}) {
  pageStatus.set({
    dataReceived: status.dataReceived ?? "-",
    queue: status.queue ?? "-",
    sdcard: status.sdcard ?? "-",
    online: Boolean(status.online),
    sourcePage: status.sourcePage ?? ""
  });
}

export function resetPageStatus() {
  pageStatus.set({
    dataReceived: "-",
    queue: "-",
    sdcard: "-",
    online: false,
    sourcePage: ""
  });
}