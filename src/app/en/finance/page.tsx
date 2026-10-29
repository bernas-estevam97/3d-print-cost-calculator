import { redirect } from "next/navigation";

export default function Finance() {
  redirect("/en/analytics?tab=finance");
}
