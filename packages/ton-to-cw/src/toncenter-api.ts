export default class TonCenterV3API {
  constructor(public readonly baseUrl: string) {}

  async queryTransactions(contractAddr: string, limit: number, offset: number) {
    return fetch(
      `${this.baseUrl}/transactions?account=${contractAddr}&limit=${limit}&offset=${offset}&sort=desc`
    ).then((data) => data.json());
  }
}
