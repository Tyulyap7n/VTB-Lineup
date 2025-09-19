// supabaseClient.js
// Инициализация клиента Supabase и сохранение его в глобальной области видимости.
(function() {
  try {
    if (!window.supabase || !window.supabase.createClient) {
      throw new Error('[Supabase] Библиотека Supabase не загружена.');
    }

    const SUPABASE_URL = 'https://svnnneohwcuxirsximkp.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2bm5uZW9od2N1eGlyc3hpbWtwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcwNjM0NTcsImV4cCI6MjA3MjYzOTQ1N30.9H5aI1gj0FHGAC6NM08BbMno26ZdueNg7G1PnTDItpA';

    // Создаем клиент Supabase
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Сохраняем клиент в глобальной области видимости
    window.supabase = supabase;

    console.debug('[Supabase] Клиент успешно инициализирован.');
  } catch (err) {
    console.error('[Supabase] Ошибка инициализации:', err.message);
  }
})();
