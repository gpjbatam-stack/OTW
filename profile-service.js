import { supabase } from "./supabase.js";

export async function getMyProfile() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) throw error;
  return data;
}

export async function updateMyProfile(payload) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error("Sesi login tidak ditemukan.");

  const allowed = {
    full_name: payload.full_name,
    phone: payload.phone,
    employee_number: payload.employee_number,
    position_title: payload.position_title,
    department: payload.department,
    gender: payload.gender || null,
    date_of_birth: payload.date_of_birth || null,
    city_of_birth: payload.city_of_birth || null,
    ktp_number: payload.ktp_number || null,
  };

  const { data, error } = await supabase
    .from("profiles")
    .update(allowed)
    .eq("id", user.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}
