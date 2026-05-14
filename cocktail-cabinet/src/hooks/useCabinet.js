import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

export function useCabinet() {
  const [bottles, setBottles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchBottles(); }, []);

  async function fetchBottles() {
    setLoading(true);
    const { data, error } = await supabase
      .from("cabinet")
      .select("*")
      .order("spirit_type")
      .order("brand");
    if (!error) setBottles(data || []);
    setLoading(false);
  }

  async function addBottle(bottle) {
    const { data, error } = await supabase.from("cabinet").insert(bottle).select().single();
    if (!error && data) {
      setBottles((prev) =>
        [...prev, data].sort(
          (a, b) => a.spirit_type.localeCompare(b.spirit_type) || a.brand.localeCompare(b.brand)
        )
      );
    }
    return { data, error };
  }

  async function removeBottle(id) {
    const { error } = await supabase.from("cabinet").delete().eq("id", id);
    if (!error) setBottles((prev) => prev.filter((b) => b.id !== id));
    return { error };
  }

  return { bottles, loading, addBottle, removeBottle, refresh: fetchBottles };
}
