import { serve } from "inngest/next";

import { inngest } from "@/lib/inngest/client";
import { reconcileSweep, resolveGeneration } from "@/lib/inngest/functions";

// App Router requires all three verbs. Inngest authenticates inbound calls with INNGEST_SIGNING_KEY.
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [reconcileSweep, resolveGeneration],
});
