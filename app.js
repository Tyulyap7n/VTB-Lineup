// ======== Общие настройки ========
let cachedPlayers = [];
let activeTab = null;

// ======== Загрузка игроков один раз при старте ========
async function fetchPlayersOnce() {
  if (cachedPlayers.length > 0) return cachedPlayers;

  try {
    const { data, error } = await supabase
      .from("players")
      .select("*")
      .order("last_name", { ascending: true });

    if (error) {
      console.error("Ошибка загрузки игроков:", error);
      return [];
    }

    cachedPlayers = data || [];
    return cachedPlayers;
  } catch (e) {
    console.error("Ошибка запроса игроков:", e);
    return [];
  }
}

// ======== Переключение вкладок ========
function initTabs() {
  const buttons = document.querySelectorAll(".tab-btn");
  const contents = document.querySelectorAll(".tab-content");

  buttons.forEach(button => {
    button.addEventListener("click", () => {
      const target = button.getAttribute("data-tab");

      if (activeTab === target) {
        document.getElementById(target).classList.remove("active");
        button.classList.remove("active");
        activeTab = null;
        return;
      }

      contents.forEach(content => content.classList.remove("active"));
      buttons.forEach(btn => btn.classList.remove("active"));

      document.getElementById(target).classList.add("active");
      button.classList.add("active");
      activeTab = target;

      setTimeout(() => {
        document.getElementById(target).classList.add("show");
      }, 50);
    });
  });
}

// ======== Проверка авторизации ========
async function checkAuth() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      window.location.href = "index.html";
    }
  } catch (e) {
    console.error("Проблема с проверкой сессии:", e);
    window.location.href = "index.html";
  }
}

// ======== Инициализация ========
document.addEventListener("DOMContentLoaded", async () => {
  await checkAuth();
  initTabs();
  await fetchPlayersOnce();
});

