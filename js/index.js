// Login og registrer-side.
import { login, register, getSession } from "./auth.js";

if (getSession()) window.location.href = "dashboard.html";

const tabLogin = document.getElementById("tab-login");
const tabReg = document.getElementById("tab-register");
const submit = document.getElementById("submit");
const alertArea = document.getElementById("alert-area");
const form = document.getElementById("auth-form");
let mode = "login";

function setMode(m) {
  mode = m;
  tabLogin.classList.toggle("active", m === "login");
  tabReg.classList.toggle("active", m === "register");
  submit.textContent = m === "login" ? "Logg inn" : "Registrer";
  alertArea.innerHTML = "";
}

tabLogin.addEventListener("click", () => setMode("login"));
tabReg.addEventListener("click", () => setMode("register"));

function showError(msg) {
  alertArea.innerHTML = `<div class="alert alert-error">${msg}</div>`;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  alertArea.innerHTML = "";
  submit.disabled = true;
  const name = document.getElementById("name").value;
  const pin = document.getElementById("pin").value;
  try {
    if (mode === "login") await login(name, pin);
    else await register(name, pin);
    window.location.href = "dashboard.html";
  } catch (err) {
    showError(err.message || "Noe gikk galt");
    submit.disabled = false;
  }
});
