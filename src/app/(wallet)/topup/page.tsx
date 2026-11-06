import { redirect } from "next/navigation";
export default function TopUpRedirect() {
  redirect("/app?topup=1");
}
