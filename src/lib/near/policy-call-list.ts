/** Call lists for the policy contract. Each entry is one transaction. */

export interface PolicyCallSpec {
  receiverId: string;
  methodName: string;
  args: Record<string, unknown>;
}

function usdc6(amount: number): string {
  return String(Math.round(amount * 1_000_000));
}

export function shopRequestCallList(
  receiverId: string,
  item: { id: string; title: string; category: string; amountUsdc: number; withinBudget: boolean },
): PolicyCallSpec[] {
  const amount = usdc6(item.amountUsdc);
  const queue: PolicyCallSpec = {
    receiverId,
    methodName: "queue_item",
    args: {
      id: item.id,
      title: item.title.slice(0, 180),
      category: item.category.slice(0, 64) || "shopping",
      target_usdc_6: amount,
    },
  };
  if (!item.withinBudget) return [queue];
  return [
    queue,
    { receiverId, methodName: "request_spend", args: { id: item.id, amount_usdc_6: amount } },
  ];
}

export function shopBuyCallList(
  receiverId: string,
  item: { id: string; title: string; category: string; amountUsdc: number },
): PolicyCallSpec[] {
  const amount = usdc6(item.amountUsdc);
  return [
    ...shopRequestCallList(receiverId, { ...item, withinBudget: true }),
    {
      receiverId,
      methodName: "approve_spend",
      args: { id: item.id, amount_usdc_6: amount, plan_id: null },
    },
  ];
}
