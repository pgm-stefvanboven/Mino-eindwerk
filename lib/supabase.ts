import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://euechlwdifknegdoxxfg.supabase.co";

const supabaseKey =
  "sb_publishable_z1dskcmLu-LaAeZJiJXxuQ_QHyonFPX";

export const supabase = createClient(
  supabaseUrl,
  supabaseKey,
);