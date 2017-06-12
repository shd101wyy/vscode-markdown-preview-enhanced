export class Cache {

  private capacity:number = 100; 
  private threshold:number = 5;
  private count:number = 0;

  private cache:{[key:string]: [string, number]} = {}

  constructor(capacity:number, threshold:number) {
    this.capacity = capacity
    this.threshold = threshold
  }

  get(key:string) {
    return this.cache[key]
  }

  set(key:string, value:string) {
    if (!(key in this.cache)) {
      this.cache[key] = [value, 1]
      this.count += 1
    } else {
      this.cache[key][1] = this.cache[key][1] + 1 // increase appear time
    }

    this.autoRemove()
  }

  autoRemove() {
    if (this.count > this.capacity) {
      
    }
  }
}