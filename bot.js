const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');

// Проверка обязательных переменных окружения
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_KEY', 'TELEGRAM_BOT_TOKEN'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error(`Ошибка: Отсутствуют обязательные переменные окружения: ${missingVars.join(', ')}`);
  process.exit(1);
}

// Инициализация Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Инициализация бота
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {polling: true});

// Объект для хранения активных задач cron
const activeTasks = {};

// Инициализация базы данных
async function initDatabase() {
  try {
    const { error } = await supabase
      .from('reminders')
      .select('*')
      .limit(1);
      
    if (error && error.code !== '42P01') {
      throw error;
    }
    
    if (error?.code === '42P01') {
      const { error: createError } = await supabase.rpc(`
        CREATE TABLE reminders (
          id SERIAL PRIMARY KEY,
          chat_id BIGINT NOT NULL UNIQUE,
          active BOOLEAN NOT NULL DEFAULT false,
          interval_minutes INTEGER NOT NULL DEFAULT 60,
          last_reminder TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
        );
      `);
      
      if (createError) throw createError;
      console.log('Таблица напоминаний успешно создана');
    }
  } catch (error) {
    console.error('Ошибка при инициализации базы данных:', error.message);
    process.exit(1);
  }
}

// Функция для отправки клавиатуры с командами
function sendCommandKeyboard(chatId, message = '') {
  const keyboard = {
    reply_markup: {
      keyboard: [
        ['🔔 Включить напоминания', '🔕 Выключить напоминания'],
        ['⏱ 30 мин', '⏱ 60 мин', '⏱ 120 мин'],
        ['✅ Публикация сделана']
      ],
      resize_keyboard: true
    }
  };
  
  if (message) {
    bot.sendMessage(chatId, message, keyboard);
  } else {
    const defaultMessage = `Доступные команды:\n
🔔 Включить напоминания - начать напоминания
🔕 Выключить напоминания - остановить напоминания
⏱ 30/60/120 мин - установить интервал
✅ Публикация сделана - отметить публикацию`;
    
    bot.sendMessage(chatId, defaultMessage, keyboard);
  }
}

// Обработка текстовых команд (для кнопок)
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === '🔔 Включить напоминания') {
    bot.onText(/\/remind/, msg);
  } 
  else if (text === '🔕 Выключить напоминания') {
    bot.onText(/\/stop/, msg);
  }
  else if (text === '✅ Публикация сделана') {
    bot.onText(/\/published/, msg);
  }
  else if (text === '⏱ 30 мин') {
    bot.onText(/\/interval 30/, msg);
  }
  else if (text === '⏱ 60 мин') {
    bot.onText(/\/interval 60/, msg);
  }
  else if (text === '⏱ 120 мин') {
    bot.onText(/\/interval 120/, msg);
  }
});

// Команда /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    await initDatabase();
    sendCommandKeyboard(chatId, `Привет! Я буду напоминать тебе о необходимости публикации.\nПо умолчанию интервал напоминаний - 60 минут.`);
  } catch (error) {
    console.error('Ошибка в команде /start:', error);
    bot.sendMessage(chatId, 'Произошла ошибка при инициализации. Пожалуйста, попробуйте позже.');
  }
});

// Команда /remind - начать напоминания
bot.onText(/\/remind/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    // Проверяем существующие напоминания
    const { data: existing, error: checkError } = await supabase
      .from('reminders')
      .select('*')
      .eq('chat_id', chatId);
      
    if (checkError) throw checkError;
    
    // Получаем или устанавливаем интервал
    let interval = 60;
    if (existing.length > 0) {
      interval = existing[0].interval_minutes;
    } else {
      const { error: insertError } = await supabase
        .from('reminders')
        .insert([{ chat_id: chatId, active: true, interval_minutes: interval }]);
        
      if (insertError) throw insertError;
    }
    
    // Останавливаем предыдущую задачу, если есть
    if (activeTasks[chatId]) {
      activeTasks[chatId].stop();
    }
    
    // Создаем новую задачу cron
    const cronPattern = `*/${interval} * * * *`;
    const task = cron.schedule(cronPattern, async () => {
      try {
        const { data } = await supabase
          .from('reminders')
          .select('active')
          .eq('chat_id', chatId)
          .single();
          
        if (data?.active) {
          await supabase
            .from('reminders')
            .update({ last_reminder: new Date().toISOString() })
            .eq('chat_id', chatId);
            
          bot.sendMessage(chatId, `⏰ Время публиковать контент! (интервал: ${interval} минут)`);
        }
      } catch (error) {
        console.error('Ошибка в задаче cron:', error);
      }
    });
    
    activeTasks[chatId] = task;
    
    // Активируем напоминание
    const { error: updateError } = await supabase
      .from('reminders')
      .update({ active: true })
      .eq('chat_id', chatId);
      
    if (updateError) throw updateError;
    
    sendCommandKeyboard(
      chatId, 
      `🔔 Напоминания включены с интервалом ${interval} минут.\n` +
      `Используй кнопки ниже для изменения интервала или отключения.`
    );
  } catch (error) {
    console.error('Ошибка при включении напоминаний:', error);
    bot.sendMessage(chatId, 'Произошла ошибка. Пожалуйста, попробуйте позже.');
  }
});

// Команда /interval - изменить интервал
bot.onText(/\/interval (\d+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const minutes = parseInt(match[1]);
  
  if (isNaN(minutes)) {
    return sendCommandKeyboard(chatId, 'Неверный формат интервала. Пожалуйста, укажите число минут.');
  }
  
  if (minutes < 5 || minutes > 1440) {
    return sendCommandKeyboard(
      chatId, 
      'Интервал должен быть от 5 до 1440 минут (24 часа).\n' +
      'Рекомендуемые значения: 30, 60 или 120 минут.'
    );
  }
  
  try {
    // Обновляем интервал в базе
    const { error: updateError } = await supabase
      .from('reminders')
      .upsert({ 
        chat_id: chatId, 
        interval_minutes: minutes 
      }, { 
        onConflict: 'chat_id' 
      });
      
    if (updateError) throw updateError;
    
    // Если напоминания активны - перезапускаем
    const { data } = await supabase
      .from('reminders')
      .select('active')
      .eq('chat_id', chatId)
      .single();
      
    if (data?.active) {
      bot.sendMessage(chatId, `Интервал изменен на ${minutes} минут. Перезапускаю напоминания...`);
      return bot.onText(/\/remind/, msg);
    }
    
    sendCommandKeyboard(chatId, `Интервал установлен на ${minutes} минут. Нажми "Включить напоминания" для старта.`);
  } catch (error) {
    console.error('Ошибка при изменении интервала:', error);
    bot.sendMessage(chatId, 'Произошла ошибка при изменении интервала.');
  }
});

// Команда /stop - остановить напоминания
bot.onText(/\/stop/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    // Останавливаем задачу cron
    if (activeTasks[chatId]) {
      activeTasks[chatId].stop();
      delete activeTasks[chatId];
    }
    
    // Обновляем статус в базе
    const { error } = await supabase
      .from('reminders')
      .update({ active: false })
      .eq('chat_id', chatId);
      
    if (error) throw error;
    
    sendCommandKeyboard(chatId, '🔕 Напоминания отключены. Нажми "Включить напоминания" для возобновления.');
  } catch (error) {
    console.error('Ошибка при отключении напоминаний:', error);
    bot.sendMessage(chatId, 'Произошла ошибка при отключении напоминаний.');
  }
});

// Команда /published - отметить публикацию
bot.onText(/\/published/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    // Останавливаем задачу cron
    if (activeTasks[chatId]) {
      activeTasks[chatId].stop();
      delete activeTasks[chatId];
    }
    
    // Обновляем статус в базе
    const { error } = await supabase
      .from('reminders')
      .update({ active: false })
      .eq('chat_id', chatId);
      
    if (error) throw error;
    
    sendCommandKeyboard(chatId, '🎉 Отлично! Публикация выполнена. Напоминания отключены.');
  } catch (error) {
    console.error('Ошибка при отметке публикации:', error);
    bot.sendMessage(chatId, 'Произошла ошибка при отметке публикации.');
  }
});

// Обработка ошибок
process.on('unhandledRejection', (error) => {
  console.error('Необработанное исключение:', error);
});

// Корректное завершение работы
process.on('SIGTERM', () => {
  console.log('Получен сигнал завершения. Останавливаю бота...');
  Object.values(activeTasks).forEach(task => task.stop());
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Получен сигнал прерывания. Останавливаю бота...');
  Object.values(activeTasks).forEach(task => task.stop());
  process.exit(0);
});

console.log('Бот успешно запущен и готов к работе');