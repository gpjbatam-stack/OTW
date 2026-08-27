import { supabase } from "./supabase.js";

async function clearStaleSession() {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch (error) {
    console.warn("[LetsGo Auth] Gagal membersihkan sesi lokal:", error);
  }
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    await clearStaleSession();
    return null;
  }
  return data.user;
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session) return null;

  const user = await getCurrentUser();
  if (!user) return null;

  return { ...data.session, user };
}

export async function signUp({ fullName, email, phone, password, next = "home.html" }) {
  const safeNext = /^[a-zA-Z0-9._-]+(?:\?[a-zA-Z0-9%&=._-]*)?$/.test(next) && !next.includes("://") ? next : "home.html";
  const emailRedirectTo = `${window.location.origin}${window.location.pathname.replace(/[^/]+$/, "")}confirm-email.html?next=${encodeURIComponent(safeNext)}`;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo,
      data: {
        full_name: fullName,
        phone,
      },
    },
  });

  if (error) throw error;
  return data;
}

export async function resendSignupConfirmation(email, next = "home.html") {
  const safeNext = /^[a-zA-Z0-9._-]+(?:\?[a-zA-Z0-9%&=._-]*)?$/.test(next) && !next.includes("://") ? next : "home.html";
  const emailRedirectTo = `${window.location.origin}${window.location.pathname.replace(/[^/]+$/, "")}confirm-email.html?next=${encodeURIComponent(safeNext)}`;

  const { data, error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo },
  });

  if (error) throw error;
  return data;
}

export async function signIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function resetPassword(email) {
  const redirectTo = `${window.location.origin}${window.location.pathname.replace(/[^/]+$/, "")}reset-password.html`;

  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (error) throw error;
  return data;
}
