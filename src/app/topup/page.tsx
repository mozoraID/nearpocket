import { redirect } from "next/navigation";

export default function TopUpRedirect() {
  redirect("/?topup=1");
}
