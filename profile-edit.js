import { supabase } from "./supabase.js";
import { requireAuth } from "./guard.js";

const $ = (s) => document.querySelector(s);

const session = await requireAuth({ redirect:"login.html", splash:"index.html" });
if(!session) await new Promise(()=>{});

const user = session.user;
let profileRow = null;
let original = { fullName:"", phone:"" };
let uploading = false;

function toast(message){
  const el=$("#toast");
  if(!el) return;
  el.textContent=message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer=setTimeout(()=>el.classList.remove("show"),2100);
}

function showNotice(message,type="error"){
  const el=$("#notice");
  el.textContent=message;
  el.className=`form-notice show ${type}`;
}

function clearNotice(){
  const el=$("#notice");
  el.textContent="";
  el.className="form-notice";
}

function initials(name,email){
  const text=(name||email||"U").trim();
  const parts=text.split(/\s+/).filter(Boolean);
  return parts.length>1
    ? `${parts[0][0]}${parts[parts.length-1][0]}`.toUpperCase()
    : text.slice(0,2).toUpperCase();
}

function normalizePhone(value=""){
  return String(value).replace(/\D/g,"").replace(/^62/,"").replace(/^0+/,"");
}

function updateDirtyState(){
  const changed=
    $("#fullName").value.trim()!==original.fullName ||
    normalizePhone($("#phone").value)!==normalizePhone(original.phone);

  $("#saveState").textContent=changed?"Ada perubahan belum disimpan":"Belum ada perubahan";
  return changed;
}

async function loadProfile(){
  try{
    $("#email").value=user.email||"";
    $("#heroEmail").textContent=user.email||"—";

    const {data,error}=await supabase
      .from("profiles")
      .select("*")
      .eq("id",user.id)
      .maybeSingle();

    if(error) throw error;
    profileRow=data||{};

    const meta=user.user_metadata||{};
    const fullName=
      profileRow.full_name ||
      profileRow.name ||
      meta.full_name ||
      meta.name ||
      user.email?.split("@")[0] ||
      "Pengguna LetsGo";

    const phone=
      profileRow.phone ||
      profileRow.phone_number ||
      profileRow.no_hp ||
      meta.phone ||
      user.phone ||
      "";

    const avatar=
      profileRow.avatar_url ||
      profileRow.photo_url ||
      profileRow.photo ||
      meta.avatar_url ||
      meta.picture ||
      "";

    $("#fullName").value=fullName;
    $("#phone").value=normalizePhone(phone);
    $("#heroName").textContent=fullName;
    $("#avatarInitial").textContent=initials(fullName,user.email);

    original={fullName,phone:normalizePhone(phone)};

    if(avatar){
      $("#avatarImg").src=avatar;
      $("#avatarImg").classList.remove("hidden");
      $("#avatarInitial").classList.add("hidden");
      $("#avatarImg").addEventListener("error",()=>{
        $("#avatarImg").classList.add("hidden");
        $("#avatarInitial").classList.remove("hidden");
      },{once:true});
    }
  }catch(error){
    console.error("[LetsGo Profile Edit]",error);
    toast("Data profil belum dapat dimuat.");
  }
}

async function saveProfile(){
  if(uploading) return toast("Tunggu upload foto selesai.");

  clearNotice();
  $("#fullNameError").textContent="";
  $("#phoneError").textContent="";

  const fullName=$("#fullName").value.trim();
  const phone=normalizePhone($("#phone").value);

  let valid=true;
  if(fullName.length<3){
    $("#fullNameError").textContent="Nama lengkap minimal 3 karakter.";
    valid=false;
  }
  if(phone && !/^8[1-9][0-9]{6,11}$/.test(phone)){
    $("#phoneError").textContent="Nomor HP belum valid.";
    valid=false;
  }
  if(!valid) return;

  const btn=$("#saveBtn");
  const bottom=$("#saveBottomBtn");
  btn.disabled=true;
  bottom.disabled=true;
  const old=btn.innerHTML;
  btn.innerHTML="<span>Menyimpan...</span>";

  try{
    const payload={
      id:user.id,
      full_name:fullName,
      phone:phone?`+62${phone}`:null,
      updated_at:new Date().toISOString()
    };

    const {error}=await supabase
      .from("profiles")
      .upsert(payload,{onConflict:"id"});

    if(error) throw error;

    await supabase.auth.updateUser({
      data:{
        ...(user.user_metadata||{}),
        full_name:fullName,
        phone:phone?`+62${phone}`:""
      }
    });

    original={fullName,phone};
    $("#heroName").textContent=fullName;
    $("#avatarInitial").textContent=initials(fullName,user.email);
    updateDirtyState();

    showNotice("Perubahan profil berhasil disimpan.","success");
    toast("Profil berhasil diperbarui.");
  }catch(error){
    console.error("[LetsGo Save Profile]",error);
    showNotice(error?.message||"Profil belum berhasil disimpan.");
  }finally{
    btn.disabled=false;
    bottom.disabled=false;
    btn.innerHTML=old;
  }
}

function validateAvatar(file){
  const allowed=["image/jpeg","image/png","image/webp"];
  if(!file) throw new Error("Pilih foto terlebih dahulu.");
  if(!allowed.includes(file.type)) throw new Error("Format foto harus JPG, PNG, atau WEBP.");
  if(file.size>5*1024*1024) throw new Error("Ukuran foto maksimal 5 MB.");
}

async function uploadAvatar(file){
  try{
    validateAvatar(file);
    uploading=true;

    $("#uploadProgress").classList.remove("hidden");
    $("#progressBar").style.width="20%";
    $("#progressText").textContent="Menyiapkan foto...";

    const ext=(file.name.split(".").pop()||"jpg").toLowerCase();
    const path=`${user.id}/avatar-${Date.now()}.${ext}`;

    $("#progressBar").style.width="50%";
    $("#progressText").textContent="Mengunggah foto...";

    const {error:uploadError}=await supabase.storage
      .from("profile-avatars")
      .upload(path,file,{
        upsert:true,
        cacheControl:"3600",
        contentType:file.type
      });

    if(uploadError) throw uploadError;

    $("#progressBar").style.width="78%";
    $("#progressText").textContent="Menyimpan foto profil...";

    const {data:urlData}=supabase.storage
      .from("profile-avatars")
      .getPublicUrl(path);

    const publicUrl=urlData?.publicUrl||"";

    const {error:updateError}=await supabase
      .from("profiles")
      .upsert({
        id:user.id,
        avatar_url:publicUrl,
        updated_at:new Date().toISOString()
      },{onConflict:"id"});

    if(updateError) throw updateError;

    await supabase.auth.updateUser({
      data:{
        ...(user.user_metadata||{}),
        avatar_url:publicUrl
      }
    });

    $("#progressBar").style.width="100%";
    $("#progressText").textContent="Foto profil berhasil diperbarui.";

    $("#avatarImg").src=URL.createObjectURL(file);
    $("#avatarImg").classList.remove("hidden");
    $("#avatarInitial").classList.add("hidden");

    toast("Foto profil berhasil diperbarui.");
    setTimeout(()=>$("#uploadProgress").classList.add("hidden"),800);
  }catch(error){
    console.error("[LetsGo Avatar]",error);
    $("#uploadProgress").classList.add("hidden");
    toast(error?.message||"Foto profil belum berhasil diperbarui.");
  }finally{
    uploading=false;
    $("#avatarFile").value="";
  }
}

$("#backBtn")?.addEventListener("click",()=>history.length>1?history.back():location.href="profile.html");
$("#homeBtn")?.addEventListener("click",()=>location.href="home.html");
$("#securityBtn")?.addEventListener("click",()=>location.href="security.html");
$("#changePhotoBtn")?.addEventListener("click",()=>$("#avatarFile").click());
$("#avatarFile")?.addEventListener("change",e=>{
  const file=e.target.files?.[0];
  if(file) uploadAvatar(file);
});

$("#fullName")?.addEventListener("input",updateDirtyState);
$("#phone")?.addEventListener("input",updateDirtyState);
$("#profileForm")?.addEventListener("submit",e=>{
  e.preventDefault();
  saveProfile();
});
$("#saveBottomBtn")?.addEventListener("click",saveProfile);

loadProfile();
