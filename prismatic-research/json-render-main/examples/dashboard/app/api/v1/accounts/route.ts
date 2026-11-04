import { getAccounts } from "@/lib/db/store";

export async function GET() {
  const accountList = await getAccounts();

  return Response.json({
    data: accountList,
    total: accountList.length,
    summary: {
      totalBalance: accountList.reduce(
        (sum, a) => sum + parseFloat(a.balance as string),
        0,
      ),
      byType: {
        bank: accountList
          .filter((a) => a.type === "bank")
          .reduce((sum, a) => sum + parseFloat(a.balance as string), 0),
        credit_card: accountList
          .filter((a) => a.type === "credit_card")
          .reduce((sum, a) => sum + parseFloat(a.balance as string), 0),
        cash: accountList
          .filter((a) => a.type === "cash")
          .reduce((sum, a) => sum + parseFloat(a.balance as string), 0),
      },
    },
  });
}
