import { redirect } from "next/navigation";
export default function TopUpRedirect() {
  redirect("/home?topup=1");
}
