/** One function-call per transaction. A NEAR function-call access key rejects a second action. */

export interface SingleActionCall {
  receiverId: string;
  methodName: string;
}

export function singleActionTransactions<T extends SingleActionCall>(calls: T[]): T[][] {
  return calls.map((call) => [call]);
}

export function policyTransactionsHaveOneAction(
  batches: SingleActionCall[][],
  policyContractId: string,
): boolean {
  return batches.every((batch) => {
    if (batch.length !== 1) return false;
    if (batch[0]?.receiverId === policyContractId && batch.length !== 1) return false;
    return true;
  });
}
