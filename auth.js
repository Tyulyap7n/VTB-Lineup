// auth.js — регистрация и вход с реальной авторизацией в Supabase
document.addEventListener("DOMContentLoaded", () => {
  const registerForm = document.getElementById("register-form");
  const loginForm = document.getElementById("login-form");

  // Проверка наличия Supabase клиента
  const ensureClient = () => {
    if (!window.supabase || !window.supabase.auth) {
      console.error("[Auth] Supabase клиент недоступен.");
      alert("Произошла ошибка инициализации. Обновите страницу.");
      return false;
    }
    return true;
  };

  let currentUserTeamId = null;

  // Создание или получение user_team
  async function ensureUserTeam(user) {
    if (!user?.id) return;

    try {
      const { data: existingTeam } = await supabase
        .from('user_teams')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (!existingTeam) {
        const username = user.user_metadata?.username || "Игрок";
        const { data, error } = await supabase
          .from('user_teams')
          .insert([{ user_id: user.id, team_name: username }]);

        if (!error && data?.[0]) currentUserTeamId = data[0].id;
      } else {
        currentUserTeamId = existingTeam.id;
      }
    } catch (err) {
      console.error("Ошибка при проверке/создании user_team:", err);
    }
  }

  // Общая функция после регистрации/входа
  async function postAuthSetup(user) {
    await ensureUserTeam(user);
  }

  // Регистрация
  registerForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!ensureClient()) return;

    const username = document.getElementById("register-username").value.trim();
    const email = document.getElementById("register-email").value.trim();
    const password = document.getElementById("register-password").value;

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username } } // сохраняем ник в user_metadata
      });

      if (error) {
        alert("Ошибка регистрации: " + error.message);
        return;
      }

      if (data?.user) await postAuthSetup(data.user);

      alert("Регистрация успешна! Подтвердите email, затем войдите.");
    } catch (err) {
      console.error("Ошибка регистрации:", err);
      alert("Не удалось завершить регистрацию. Попробуйте снова.");
    }
  });

  // Вход
  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!ensureClient()) return;

    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        alert("Ошибка входа: " + error.message);
        return;
      }

      const user = data?.user || data?.session?.user;
      if (!user) {
        alert("Не удалось получить пользователя после входа.");
        return;
      }

      await postAuthSetup(user);

      // Редирект на дашборд
      window.location.href = "dashboard.html";
    } catch (err) {
      console.error("Ошибка входа:", err);
      alert("Не удалось войти. Попробуйте снова.");
    }
  });

  // Подписка на изменения сессии
  try {
    if (window.supabase?.auth?.onAuthStateChange) {
      supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === "SIGNED_IN" && session?.user) {
          await postAuthSetup(session.user);
          if (["/", "/index.html", ""].includes(window.location.pathname)) {
            window.location.href = "dashboard.html";
          }
        }
      });
    }
  } catch (e) {
    console.warn("onAuthStateChange failed:", e);
  }
});
