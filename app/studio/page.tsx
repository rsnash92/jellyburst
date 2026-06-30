import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import StudioClient from "./studio-client";

export default async function StudioPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <StudioClient />;
}
