import { supabase } from "./supabase.js";

const $=(s)=>document.querySelector(s);

async function verifyAdmin(){
  const {data:sessionData,error:sessionError}=await supabase.auth.getSession();

  if(sessionError || !sessionData?.session?.user){
    location.replace("admin-login.html");
    return;
  }

  const user=sessionData.session.user;
  const {data:admin,error}=await supabase
    .from("app_admins")
    .select("role,is_active")
    .eq("user_id",user.id)
    .eq("is_active",true)
    .maybeSingle();

  if(error || !admin){
    $("#accessDenied").classList.remove("hidden");
    return;
  }

  $("#welcomeTitle").textContent="Selamat datang, Admin.";
  $("#adminMeta").textContent=`${user.email} · ${admin.role}`;
  $("#roleText").textContent=`${admin.role} · aktif`;

  sessionStorage.setItem("otw_admin_profile",JSON.stringify({
    userId:user.id,email:user.email,role:admin.role
  }));
}

async function logout(){
  await supabase.auth.signOut();
  sessionStorage.removeItem("otw_admin_profile");
  location.replace("admin-login.html");
}

$("#logoutBtn")?.addEventListener("click",logout);
$("#mobileLogout")?.addEventListener("click",logout);
$("#goLogin")?.addEventListener("click",()=>location.replace("admin-login.html"));

verifyAdmin();
