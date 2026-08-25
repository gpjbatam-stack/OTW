import { supabase } from "./supabase.js";

const $ = (s) => document.querySelector(s);

const ROUTES = Object.freeze({
  home:"home.html",
  orders:"orders.html",
  history:"history.html",
  notifications:"notifications.html",
  personalData:"profile-edit.html",
  documents:"documents.html",
  security:"security.html",
  help:"help.html",
  about:"about.html",
  settings:"settings.html",
  login:"login.html"
});

let currentUser = null;

function toast(message){
  const el=$("#toast");
  el.textContent=message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer=setTimeout(()=>el.classList.remove("show"),2200);
}

function navigate(route){
  window.location.href=route;
}

function initials(name,email){
  const text=(name||email||"U").trim();
  if(!text) return "U";
  const parts=text.split(/\s+/).filter(Boolean);
  return parts.length>1
    ? `${parts[0][0]}${parts[parts.length-1][0]}`.toUpperCase()
    : text.slice(0,2).toUpperCase();
}

function normalizeProfile(user, profile){
  const meta=user?.user_metadata||{};
  return {
    name:
      profile?.full_name ||
      profile?.name ||
      meta?.full_name ||
      meta?.name ||
      user?.email?.split("@")[0] ||
      "Pengguna LetsGo",
    email:user?.email||profile?.email||"—",
    phone:
      profile?.phone ||
      profile?.phone_number ||
      profile?.no_hp ||
      meta?.phone ||
      user?.phone ||
      "—",
    avatar:
      profile?.avatar_url ||
      profile?.photo_url ||
      profile?.photo ||
      meta?.avatar_url ||
      meta?.picture ||
      ""
  };
}

async function findProfile(userId){
  const {data,error}=await supabase
    .from("profiles")
    .select("*")
    .eq("id",userId)
    .maybeSingle();

  if(error) throw error;
  return data||null;
}

function renderProfile(profile){
  $("#profileName").textContent=profile.name;
  $("#profileEmail").textContent=profile.email;
  $("#profilePhone").textContent=profile.phone;
  $("#avatarInitial").textContent=initials(profile.name,profile.email);

  if(profile.avatar){
    $("#avatarImg").src=profile.avatar;
    $("#avatarImg").classList.remove("hidden");
    $("#avatarInitial").classList.add("hidden");

    $("#avatarImg").addEventListener("error",()=>{
      $("#avatarImg").classList.add("hidden");
      $("#avatarInitial").classList.remove("hidden");
    },{once:true});
  }
}

async function init(){
  try{
    const {data,error}=await supabase.auth.getUser();

    if(error || !data?.user){
      try { await supabase.auth.signOut({ scope:"local" }); } catch {}
      currentUser=null;
      location.replace(`${ROUTES.login}?next=profile.html`);
      return;
    }

    currentUser=data.user;

    const profileRow=await findProfile(currentUser.id);
    renderProfile(normalizeProfile(currentUser,profileRow));

  }catch(error){
    console.error("[LetsGo Profile]",error);
    toast("Profil gagal dimuat.");
  }
}

function openLogout(){
  $("#logoutModal").classList.remove("hidden");
  document.body.style.overflow="hidden";
}

function closeLogout(){
  $("#logoutModal").classList.add("hidden");
  document.body.style.overflow="";
}

async function logout(){
  const btn=$("#confirmLogoutBtn");
  const old=btn.textContent;

  btn.disabled=true;
  btn.textContent="Mengeluarkan akun...";

  try{
    const {error}=await supabase.auth.signOut({ scope:"local" });
    if(error) throw error;

    sessionStorage.removeItem("letsgo_admin_profile");
    sessionStorage.removeItem("letsgo_selected_flight");
    sessionStorage.removeItem("letsgo_selected_offer_id");
    sessionStorage.removeItem("letsgo_search");
    sessionStorage.removeItem("letsgo_passenger_details");
    sessionStorage.removeItem("letsgo_uploaded_spt");
    sessionStorage.removeItem("letsgo_flight_review");

    location.replace(ROUTES.login);
  }catch(error){
    console.error("[LetsGo Logout]",error);
    closeLogout();
    toast(error?.message||"Logout gagal. Silakan coba lagi.");
  }finally{
    btn.disabled=false;
    btn.textContent=old;
  }
}

$("#backBtn")?.addEventListener("click",()=>history.back());
$("#settingsBtn")?.addEventListener("click",()=>navigate(ROUTES.settings));
$("#ordersBtn")?.addEventListener("click",()=>navigate(ROUTES.orders));
$("#historyBtn")?.addEventListener("click",()=>navigate(ROUTES.history));
$("#personalDataBtn")?.addEventListener("click",()=>navigate(ROUTES.personalData));
$("#documentsBtn")?.addEventListener("click",()=>navigate(ROUTES.documents));
$("#securityBtn")?.addEventListener("click",()=>navigate(ROUTES.security));
$("#helpBtn")?.addEventListener("click",()=>navigate(ROUTES.help));
$("#aboutBtn")?.addEventListener("click",()=>navigate(ROUTES.about));
$("#editPhotoBtn")?.addEventListener("click",()=>navigate(ROUTES.personalData));

$("#logoutBtn")?.addEventListener("click",openLogout);
$("#cancelLogoutBtn")?.addEventListener("click",closeLogout);
$("#confirmLogoutBtn")?.addEventListener("click",logout);
$("#logoutModal")?.addEventListener("click",(e)=>{
  if(e.target===$("#logoutModal")) closeLogout();
});

init();
