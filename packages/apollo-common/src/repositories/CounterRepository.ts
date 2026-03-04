export interface CounterRepository {
  getNextSequenceValue(sequenceName: string): Promise<number>
}
