"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ConfirmationWatcher() {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    const continueIfConfirmed = async () => {
      const { data } = await supabase.auth.getSession();
      if (active && data.session) {
        setConfirmed(true);
        window.location.assign("/app");
      }
    };

    void continueIfConfirmed();
    const interval = window.setInterval(() => void continueIfConfirmed(), 2500);
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active && session) {
        setConfirmed(true);
        window.location.assign("/app");
      }
    });

    return () => {
      active = false;
      window.clearInterval(interval);
      listener.subscription.unsubscribe();
    };
  }, []);

  return (
    <p className="mt-4 text-sm text-slate" aria-live="polite">
      {confirmed ? "Confirmed. Taking you to the next step..." : "This page will continue automatically after you confirm."}
    </p>
  );
}
