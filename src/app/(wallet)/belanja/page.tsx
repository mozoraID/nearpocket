import { redirect } from "next/navigation";

/** Legacy Indonesian path — prefer /shop */
export default function BelanjaRedirect() {
  redirect("/shop");
}
