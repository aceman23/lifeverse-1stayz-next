import { redirect } from "next/navigation";

// Unknown paths inside the app go to the dashboard.
export default function UnknownRoute() {
  redirect("/");
}
