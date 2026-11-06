import { redirect } from "next/navigation";

/** Legacy Indonesian path — prefer /activity */
export default function AktivitasRedirect() {
  redirect("/activity");
}
