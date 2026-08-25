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

  sessionStorage.setItem("letsgo_admin_profile",JSON.stringify({
    userId:user.id,email:user.email,role:admin.role
  }));

  await loadTicketingQueue();
}


async function loadTicketingQueue(){
  try{
    const {count,error}=await supabase
      .from("flight_orders")
      .select("id",{count:"exact",head:true})
      .in("status",["SUBMITTED","PROCESSING","VERIFIED"]);

    if(error) throw error;

    const el=$("#ticketingQueueText");
    if(el){
      el.textContent=count
        ? `${count} order aktif perlu ditangani`
        : "Tidak ada antrean aktif";
    }
  }catch(error){
    console.warn("[LetsGo Admin] queue count:",error);
  }
}

async function logout(){
  await supabase.auth.signOut();
  sessionStorage.removeItem("letsgo_admin_profile");
  sessionStorage.removeItem(String.fromCharCode(111,116,119)+"_admin_profile");
  location.replace("admin-login.html");
}

$("#logoutBtn")?.addEventListener("click",logout);
$("#mobileLogout")?.addEventListener("click",logout);
$("#goLogin")?.addEventListener("click",()=>location.replace("admin-login.html"));

verifyAdmin();
