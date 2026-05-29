import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Observation } from "@/types";
import ObservationList from "@/components/ObservationList";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: items } = await supabase
    .from("observations")
    .select("*")
    .order("created_at", { ascending: false });

  return <ObservationList items={(items as Observation[]) || []} />;
}
