import { supabase } from "./supabase.js";

const $=(s)=>document.querySelector(s);

function toast(message){
  const el=$("#toast");
  el.textContent=message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer=setTimeout(()=>el.classList.remove("show"),2200);
}

async function isAdmin(userId){
  const {data,error}=await supabase
    .from("app_admins")
    .select("user_id,role,is_active")
    .eq("user_id",userId)
    .eq("is_active",true)
    .maybeSingle();

  if(error) throw error;
  return data;
}

async function redirectIfAdminSessionExists(){
  const {data}=await supabase.auth.getSession();
  const user=data?.session?.user;
  if(!user) return;

  try{
    const admin=await isAdmin(user.id);
    if(admin) location.replace("admin.html");
  }catch(error){
    console.warn("[OTW Admin Login] session check:",error);
  }
}

$("#togglePassword").addEventListener("click",()=>{
  const input=$("#password");
  const show=input.type==="password";
  input.type=show?"text":"password";
  $("#togglePassword").textContent=show?"Sembunyi":"Lihat";
});

$("#backToApp").addEventListener("click",()=>location.href="login.html");

$("#loginForm").addEventListener("submit",async(e)=>{
  e.preventDefault();

  $("#emailError").textContent="";
  $("#passwordError").textContent="";

  const email=$("#email").value.trim();
  const password=$("#password").value;
  const remember=$("#rememberMe").checked;

  if(!email){
    $("#emailError").textContent="Email admin wajib diisi.";
    return;
  }
  if(password.length<6){
    $("#passwordError").textContent="Password belum valid.";
    return;
  }

  const btn=$("#loginBtn");
  const original=btn.innerHTML;
  btn.disabled=true;
  btn.innerHTML="<span>Memverifikasi...</span>";

  try{
    if(!remember){
      sessionStorage.setItem("otw_admin_session_only","1");
    }else{
      sessionStorage.removeItem("otw_admin_session_only");
    }

    const {data,error}=await supabase.auth.signInWithPassword({email,password});
    if(error) throw error;

    const user=data?.user;
    if(!user) throw new Error("Sesi admin tidak berhasil dibuat.");

    const admin=await isAdmin(user.id);

    if(!admin){
      await supabase.auth.signOut();
      throw new Error("Akun ini tidak memiliki akses administrator OTW.");
    }

    sessionStorage.setItem("otw_admin_profile",JSON.stringify({
      userId:user.id,
      email:user.email,
      role:admin.role,
      signedInAt:new Date().toISOString()
    }));

    toast("Login admin berhasil.");
    setTimeout(()=>location.replace("admin.html"),250);

  }catch(error){
    console.error("[OTW Admin Login]",error);
    toast(error?.message||"Login admin gagal.");
  }finally{
    btn.disabled=false;
    btn.innerHTML=original;
  }
});

redirectIfAdminSessionExists();
