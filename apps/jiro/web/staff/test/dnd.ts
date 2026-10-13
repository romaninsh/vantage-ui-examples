// Native drag and drop for jsdom, which has no DataTransfer: enough of one
// for pragmatic-drag-and-drop to start a drag, find the drop target, and drop.
import { act, fireEvent } from "@testing-library/react";

class FakeDataTransfer {
  private data = new Map<string, string>();
  dropEffect = "none";
  effectAllowed = "all";
  files = [] as unknown as FileList;
  items = [] as unknown as DataTransferItemList;
  get types() {
    return [...this.data.keys()];
  }
  setData(type: string, value: string) {
    this.data.set(type, value);
  }
  getData(type: string) {
    return this.data.get(type) ?? "";
  }
  clearData() {
    this.data.clear();
  }
  setDragImage() {}
}

const frame = () => act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

export async function dragAndDrop(source: Element, target: Element) {
  const dataTransfer = new FakeDataTransfer();
  fireEvent.dragStart(source, { dataTransfer });
  await frame();
  fireEvent.dragEnter(target, { dataTransfer });
  fireEvent.dragOver(target, { dataTransfer });
  await frame();
  fireEvent.drop(target, { dataTransfer });
  await frame();
}
