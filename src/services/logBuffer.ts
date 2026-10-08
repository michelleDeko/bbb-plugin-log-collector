/** Bounded FIFO buffer: oldest entries are dropped once the cap is reached. */
export class RingBuffer<T> {
  private items: T[] = [];

  private capacity: number;

  private dropped = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  push(item: T): void {
    this.items.push(item);
    if (this.items.length > this.capacity) {
      this.items.splice(0, this.items.length - this.capacity);
      this.dropped += 1;
    }
  }

  setCapacity(capacity: number): void {
    if (capacity > 0) {
      this.capacity = capacity;
      if (this.items.length > capacity) {
        this.dropped += this.items.length - capacity;
        this.items.splice(0, this.items.length - capacity);
      }
    }
  }

  toArray(): T[] {
    return this.items.slice();
  }

  get size(): number {
    return this.items.length;
  }

  get droppedCount(): number {
    return this.dropped;
  }
}
