import { redirect } from "next/navigation";

/** Ideas live at /briefing/[id]; the bare path goes to Today instead of a 404. */
export default function BriefingIndex() {
  redirect("/");
}
