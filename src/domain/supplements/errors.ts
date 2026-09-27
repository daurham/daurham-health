export class SupplementInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SupplementInputError'
  }
}
