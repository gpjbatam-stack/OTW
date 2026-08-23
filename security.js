import { supabase } from "./supabase.js";
import { requireAuth } from "./guard.js";

const $=(s)=>document.querySelector(s);

const session=await requireAuth({redirect:"login.html",splash:"index.html"});
if(!session) await new Promise(()=>{});

const user=session.user;
$("#accountEmail").textContent=user.email||"—";

function toast(message){
  const el=$("#toast");
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

function clearErrors(){
  $("#notice").className="form-notice";
  $("#newPasswordError").textContent="";
  $("#confirmPasswordError").textContent="";
}

function scorePassword(value){
  let score=0;
  if(value.length>=8)score++;
  if(/[A-Z]/.test(value))score++;
  if(/[a-z]/.test(value))score++;
  if(/[0-9]/.test(value))score++;
  if(/[^A-Za-z0-9]/.test(value))score++;
  return score;
}

function updateRules(){
  const password=$("#newPassword").value;
  const confirm=$("#confirmPassword").value;

  const checks={
    ruleLength:password.length>=8,
    ruleUpper:/[A-Z]/.test(password),
    ruleNumber:/[0-9]/.test(password),
    ruleMatch:Boolean(password)&&password===confirm
  };

  Object.entries(checks).forEach(([id,valid])=>{
    $(`#${id}`).classList.toggle("valid",valid);
  });

  const score=scorePassword(password);
  const pct=[0,20,40,60,80,100][score]||0;
  $("#strengthBar").style.width=`${pct}%`;

  const label=
    score===0?"Kekuatan password":
    score<=2?"Lemah":
    score===3?"Cukup":
    score===4?"Kuat":"Sangat kuat";

  $("#strengthText").textContent=label;

  if(score<=2)$("#strengthBar").style.background="#D95A66";
  else if(score===3)$("#strengthBar").style.background="#C78A1E";
  else $("#strengthBar").style.background="#10A873";
}

function togglePassword(inputId,buttonId){
  const input=$(`#${inputId}`);
  const btn=$(`#${buttonId}`);
  const show=input.type==="password";
  input.type=show?"text":"password";
  btn.textContent=show?"Sembunyi":"Lihat";
}

async function updatePassword(){
  clearErrors();

  const password=$("#newPassword").value;
  const confirm=$("#confirmPassword").value;

  if(password.length<8){
    $("#newPasswordError").textContent="Password minimal 8 karakter.";
    return;
  }
  if(!/[A-Z]/.test(password)){
    $("#newPasswordError").textContent="Tambahkan minimal satu huruf besar.";
    return;
  }
  if(!/[0-9]/.test(password)){
    $("#newPasswordError").textContent="Tambahkan minimal satu angka.";
    return;
  }
  if(password!==confirm){
    $("#confirmPasswordError").textContent="Konfirmasi password belum sama.";
    return;
  }

  const btn=$("#updatePasswordBtn");
  const old=btn.innerHTML;
  btn.disabled=true;
  btn.innerHTML="<span>Memperbarui password...</span>";

  try{
    const {error}=await supabase.auth.updateUser({password});
    if(error)throw error;

    $("#newPassword").value="";
    $("#confirmPassword").value="";
    updateRules();

    $("#successModal").classList.remove("hidden");
    document.body.style.overflow="hidden";
  }catch(error){
    console.error("[LetsGo Security]",error);
    showNotice(error?.message||"Password belum berhasil diperbarui.");
  }finally{
    btn.disabled=false;
    btn.innerHTML=old;
  }
}

async function sendResetEmail(){
  const btn=$("#sendResetEmailBtn");
  btn.disabled=true;
  const old=btn.textContent;
  btn.textContent="Mengirim...";

  try{
    if(!user.email)throw new Error("Email akun tidak ditemukan.");

    const redirectTo=`${window.location.origin}${window.location.pathname.replace(/[^/]+$/,"")}security.html`;

    const {error}=await supabase.auth.resetPasswordForEmail(user.email,{redirectTo});
    if(error)throw error;

    toast("Link reset password sudah dikirim ke email.");
  }catch(error){
    console.error("[LetsGo Password Email]",error);
    toast(error?.message||"Link reset belum berhasil dikirim.");
  }finally{
    btn.disabled=false;
    btn.textContent=old;
  }
}

$("#backBtn")?.addEventListener("click",()=>history.length>1?history.back():location.href="profile.html");
$("#homeBtn")?.addEventListener("click",()=>location.href="home.html");
$("#toggleNewPassword")?.addEventListener("click",()=>togglePassword("newPassword","toggleNewPassword"));
$("#toggleConfirmPassword")?.addEventListener("click",()=>togglePassword("confirmPassword","toggleConfirmPassword"));
$("#newPassword")?.addEventListener("input",updateRules);
$("#confirmPassword")?.addEventListener("input",updateRules);
$("#passwordForm")?.addEventListener("submit",e=>{
  e.preventDefault();
  updatePassword();
});
$("#sendResetEmailBtn")?.addEventListener("click",sendResetEmail);
$("#modalProfileBtn")?.addEventListener("click",()=>location.href="profile.html");
$("#closeModalBtn")?.addEventListener("click",()=>{
  $("#successModal").classList.add("hidden");
  document.body.style.overflow="";
});
$("#successModal")?.addEventListener("click",e=>{
  if(e.target===$("#successModal")){
    $("#successModal").classList.add("hidden");
    document.body.style.overflow="";
  }
});
