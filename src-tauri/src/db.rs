use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

/// 启动时可能拿不到连接（权限、磁盘满、库被更高版本写过）。
/// 这种失败不能用 `?` 冒泡出 `setup()`——那会让窗口根本建不起来，
/// 用户看到的是进程闪退而不是可操作的错误页。改为把错误带进状态，
/// 由前端在启动页展示并提供重试与恢复入口。
pub struct Db(pub Mutex<Option<Connection>>, pub Mutex<Option<String>>);

const SCHEMA_VERSION: i64 = 3;

/// 每个题库保留的历史版本数上限。与前端 src/services/snapshotPolicy.ts 保持一致；
/// 两端都强制，任何一端漏掉都不会导致无限增长。
const BANK_SNAPSHOT_LIMIT: i64 = 20;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SettingsRecord {
  pub theme: String,
  pub font_scale: String,
  pub auto_next: bool,
  pub show_sample_banks: bool,
}

impl Default for SettingsRecord {
  fn default() -> Self {
    Self {
      theme: "light".into(),
      font_scale: "normal".into(),
      auto_next: false,
      show_sample_banks: true,
    }
  }
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct QuestionRecord {
  #[serde(rename = "type")]
  pub kind: String,
  pub stem: String,
  pub options: Vec<String>,
  pub answer: Vec<i64>,
  pub explanation: String,
  pub difficulty: i64,
  pub tags: Vec<String>,
  /// 题干配图（URL 或 data URI）。老数据没有这一列时读成 None。
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub image: Option<String>,
  /// 选项配图，与 options 对齐；空数组表示全是文字选项。
  #[serde(default, skip_serializing_if = "Vec::is_empty")]
  pub option_images: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BankRecord {
  pub id: String,
  pub title: String,
  pub subtitle: String,
  pub description: String,
  pub exam: String,
  pub icon: String,
  pub accent: String,
  pub level: String,
  pub duration_min: i64,
  pub tags: Vec<String>,
  pub imported_at: i64,
  pub questions: Vec<QuestionRecord>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WrongRecord {
  pub question_id: String,
  pub collection_id: String,
  pub wrong_count: i64,
  pub last_wrong_at: i64,
  pub last_selection: Vec<i64>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HistoryRecord {
  pub id: String,
  pub mode: String,
  pub collection_id: String,
  pub collection_title: String,
  pub domain_id: Option<String>,
  pub answered: i64,
  pub correct: i64,
  pub wrong: i64,
  pub skipped: i64,
  pub total: i64,
  pub accuracy: f64,
  pub duration_sec: i64,
  pub finished_at: i64,
  pub date_key: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DailyRecord {
  pub date: String,
  pub answered: i64,
  pub correct: i64,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PaperRecord {
  pub id: String,
  pub title: String,
  pub collection_ids: Vec<String>,
  pub count: i64,
  pub duration_min: i64,
  pub order: String,
  pub created_at: i64,
}

/// 题库历史版本。
///
/// `bank` 整条存 JSON 而不是拆成关系表：快照是「某一刻的完整副本」，
/// 拆表后字段一改就要同时迁移两份结构，而且快照本就不需要被查询字段。
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BankSnapshotRecord {
  pub id: String,
  pub bank_id: String,
  pub saved_at: i64,
  pub revision: i64,
  pub bank: BankRecord,
}

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
  pub settings: SettingsRecord,
  pub favorites: Vec<String>,
  pub wrong_book: Vec<WrongRecord>,
  pub history: Vec<HistoryRecord>,
  pub daily: Vec<DailyRecord>,
  pub last_collection_id: Option<String>,
  pub banks: Vec<BankRecord>,
  pub papers: Vec<PaperRecord>,
  /// 未完成会话：保持原样透传（前端定义的 JSON），Rust 侧不解释其结构。
  /// 用 serde_json::Value 而不是具体结构体，避免每次前端加字段都要改 Rust。
  pub pending_session: Option<serde_json::Value>,
  pub bank_snapshots: Vec<BankSnapshotRecord>,
}

fn json<T: Serialize>(value: &T) -> String {
  serde_json::to_string(value).unwrap_or_else(|_| "[]".into())
}

fn from_json<T: for<'de> Deserialize<'de>>(raw: String) -> T
where
  T: Default,
{
  serde_json::from_str(&raw).unwrap_or_default()
}

pub fn open(app: &AppHandle) -> Result<Connection, String> {
  open_at(&database_path(app)?)
}

pub fn database_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
  let dir = app
    .path()
    .app_data_dir()
    .map_err(|error| format!("无法定位应用数据目录: {error}"))?;
  Ok(dir.join("quizchest.db"))
}

pub fn open_at(path: &Path) -> Result<Connection, String> {
  if let Some(parent) = path.parent() {
    std::fs::create_dir_all(parent).map_err(|error| format!("无法创建数据目录: {error}"))?;
  }
  let mut connection =
    Connection::open(path).map_err(|error| format!("无法打开数据库 {}: {error}", path.display()))?;
  // 先验证这个文件到底是不是可用的 SQLite 库。`Connection::open` 对任意
  // 字节内容都会成功（它只是打开句柄），真正的失败出现在第一次读取，
  // 所以必须显式跑一次完整性查询，才能拿到「file is not a database」。
  connection
    .query_row("PRAGMA schema_version", [], |row| row.get::<_, i64>(0))
    .map_err(|error| format!("数据库文件无法读取（可能已损坏）: {error}"))?;
  connection
    .execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON;")
    .map_err(|error| format!("数据库初始化失败: {error}"))?;
  migrate(&mut connection)?;
  Ok(connection)
}

/// 把无法使用的数据库文件改名隔离（不删除），再建一个空库。
///
/// 为什么不是直接删：用户的库可能只是被更高版本写过、或者文件被占用，
/// 直接删会连带丢掉可能还能抢救的数据。改名后可以在备份里找到它。
pub fn quarantine_and_recreate(path: &Path) -> Result<std::path::PathBuf, String> {
  let stamp = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map(|duration| duration.as_secs())
    .unwrap_or(0);
  let backup = path.with_extension(format!("broken-{stamp}.db"));
  if path.exists() {
    std::fs::rename(path, &backup)
      .map_err(|error| format!("无法隔离损坏的数据库 {}: {error}", path.display()))?;
  }
  // WAL / SHM 是同一份库的附属文件，必须一起挪走，否则新库会读到旧日志。
  for suffix in ["-wal", "-shm"] {
    let sidecar = format!("{}{suffix}", path.display());
    let sidecar = Path::new(&sidecar);
    if sidecar.exists() {
      let _ = std::fs::remove_file(sidecar);
    }
  }
  Ok(backup)
}

fn migrate(connection: &mut Connection) -> Result<(), String> {
  // 版本表必须先于一切存在：全新库里连 meta 都没有，直接查会报 no such table。
  connection
    .execute_batch("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);")
    .map_err(|error| format!("创建版本表失败: {error}"))?;

  let current: i64 = connection
    .query_row("SELECT CAST(value AS INTEGER) FROM meta WHERE key = 'schema_version'", [], |row| {
      row.get(0)
    })
    .optional()
    .map_err(|error| format!("读取 schema 版本失败: {error}"))?
    .unwrap_or(0);

  if current > SCHEMA_VERSION {
    // 库是新版应用写的，当前版本不认识它的结构。宁可拒绝启动也不能用旧 SQL
    // 往里写——那会造成静默的数据损坏，而且用户无法察觉。
    return Err(format!(
      "数据库版本 {current} 高于本应用支持的 {SCHEMA_VERSION}，请升级应用后重试"
    ));
  }

  if current == SCHEMA_VERSION {
    return Ok(());
  }

  // 逐步升级：每一步只做「从 N 到 N+1」的增量，并且都在同一个事务里。
  // 这样任何一个中间步骤失败都会整体回滚，不会留下半升级的库。
  // 新增字段时追加一个 step，不要改已有 step 的内容——那会让老库的升级路径静默错位。
  let mut version = current;
  while version < SCHEMA_VERSION {
    let step = version + 1;
    let tx = connection
      .transaction()
      .map_err(|error| format!("开启迁移事务失败: {error}"))?;
    match step {
      1 => schema_v1(&tx)?,
      2 => schema_v2(&tx)?,
      3 => schema_v3(&tx)?,
      other => return Err(format!("缺少 schema v{other} 的迁移步骤")),
    }
    tx.execute(
      "INSERT INTO meta(key, value) VALUES('schema_version', ?1)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      params![step.to_string()],
    )
    .map_err(|error| format!("写入 schema 版本失败: {error}"))?;
    tx.commit().map_err(|error| format!("提交迁移失败: {error}"))?;
    version = step;
  }
  Ok(())
}

/// v1：初始表结构。只用 `IF NOT EXISTS`，因此对空库与已存在的 v1 库都安全。
fn schema_v1(tx: &Transaction) -> Result<(), String> {
  tx.execute_batch(
    r#"
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS banks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        subtitle TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        exam TEXT NOT NULL DEFAULT '',
        icon TEXT NOT NULL DEFAULT 'book',
        accent TEXT NOT NULL DEFAULT '#315B7D',
        level TEXT NOT NULL DEFAULT '入门',
        duration_min INTEGER NOT NULL DEFAULT 20,
        tags TEXT NOT NULL DEFAULT '[]',
        imported_at INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS questions (
        bank_id TEXT NOT NULL REFERENCES banks(id) ON DELETE CASCADE,
        ordinal INTEGER NOT NULL,
        type TEXT NOT NULL,
        stem TEXT NOT NULL,
        options TEXT NOT NULL DEFAULT '[]',
        answer TEXT NOT NULL DEFAULT '[]',
        explanation TEXT NOT NULL DEFAULT '',
        difficulty INTEGER NOT NULL DEFAULT 2,
        tags TEXT NOT NULL DEFAULT '[]',
        PRIMARY KEY (bank_id, ordinal)
      );
      CREATE INDEX IF NOT EXISTS idx_questions_bank ON questions(bank_id, ordinal);
      CREATE TABLE IF NOT EXISTS favorites (
        question_id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS wrong_book (
        question_id TEXT PRIMARY KEY,
        collection_id TEXT NOT NULL,
        wrong_count INTEGER NOT NULL DEFAULT 0,
        last_wrong_at INTEGER NOT NULL DEFAULT 0,
        last_selection TEXT NOT NULL DEFAULT '[]'
      );
      CREATE TABLE IF NOT EXISTS history (
        id TEXT PRIMARY KEY,
        mode TEXT NOT NULL,
        collection_id TEXT NOT NULL,
        collection_title TEXT NOT NULL,
        domain_id TEXT,
        answered INTEGER NOT NULL DEFAULT 0,
        correct INTEGER NOT NULL DEFAULT 0,
        wrong INTEGER NOT NULL DEFAULT 0,
        skipped INTEGER NOT NULL DEFAULT 0,
        total INTEGER NOT NULL DEFAULT 0,
        accuracy REAL NOT NULL DEFAULT 0,
        duration_sec INTEGER NOT NULL DEFAULT 0,
        finished_at INTEGER NOT NULL,
        date_key TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_history_finished ON history(finished_at DESC);
      CREATE TABLE IF NOT EXISTS daily (
        date TEXT PRIMARY KEY,
        answered INTEGER NOT NULL DEFAULT 0,
        correct INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS papers (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        collection_ids TEXT NOT NULL DEFAULT '[]',
        count INTEGER NOT NULL DEFAULT 0,
        duration_min INTEGER NOT NULL DEFAULT 0,
        "order" TEXT NOT NULL DEFAULT 'random',
        created_at INTEGER NOT NULL
      );
      "#,
  )
  .map_err(|error| format!("建表失败: {error}"))
}

/// v2：题目支持配图。
///
/// 用 ALTER TABLE 加列而不是重建表：老库里的题库、错题、记录都不能丢。
/// SQLite 的 ADD COLUMN 对已有行填默认值，因此老数据天然满足新结构。
fn schema_v2(tx: &Transaction) -> Result<(), String> {
  // 两列都可能已存在（例如中断后重跑），用 pragma 判断后再加。
  let has_column = |name: &str| -> Result<bool, String> {
    let mut statement = tx
      .prepare("PRAGMA table_info(questions)")
      .map_err(|error| format!("读取表结构失败: {error}"))?;
    let rows = statement
      .query_map([], |row| row.get::<_, String>(1))
      .map_err(|error| format!("读取列名失败: {error}"))?;
    for column in rows {
      if column.map_err(|error| format!("读取列名失败: {error}"))? == name {
        return Ok(true);
      }
    }
    Ok(false)
  };

  if !has_column("image")? {
    tx.execute("ALTER TABLE questions ADD COLUMN image TEXT", [])
      .map_err(|error| format!("添加 image 列失败: {error}"))?;
  }
  if !has_column("option_images")? {
    tx.execute("ALTER TABLE questions ADD COLUMN option_images TEXT NOT NULL DEFAULT '[]'", [])
      .map_err(|error| format!("添加 option_images 列失败: {error}"))?;
  }
  Ok(())
}

/// v3：题库历史版本表。
fn schema_v3(tx: &Transaction) -> Result<(), String> {
  tx.execute_batch(
    r#"
    CREATE TABLE IF NOT EXISTS bank_snapshots (
      id TEXT PRIMARY KEY,
      bank_id TEXT NOT NULL,
      saved_at INTEGER NOT NULL,
      revision INTEGER NOT NULL,
      bank TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_bank_snapshots_bank ON bank_snapshots(bank_id, saved_at DESC);
    "#,
  )
  .map_err(|error| format!("创建题库快照表失败: {error}"))
}

fn setting(connection: &Connection, key: &str) -> Result<Option<String>, String> {
  connection
    .query_row("SELECT value FROM settings WHERE key = ?1", params![key], |row| row.get(0))
    .optional()
    .map_err(|error| format!("读取设置 {key} 失败: {error}"))
}

fn set_setting(connection: &Connection, key: &str, value: &str) -> Result<(), String> {
  connection
    .execute(
      "INSERT INTO settings(key, value) VALUES(?1, ?2)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      params![key, value],
    )
    .map(|_| ())
    .map_err(|error| format!("写入设置 {key} 失败: {error}"))
}

fn load_settings(connection: &Connection) -> Result<SettingsRecord, String> {
  let defaults = SettingsRecord::default();
  Ok(SettingsRecord {
    theme: setting(connection, "theme")?.unwrap_or(defaults.theme),
    font_scale: setting(connection, "fontScale")?.unwrap_or(defaults.font_scale),
    auto_next: setting(connection, "autoNext")?
      .map(|value| value == "1")
      .unwrap_or(defaults.auto_next),
    show_sample_banks: setting(connection, "showSampleBanks")?
      .map(|value| value == "1")
      .unwrap_or(defaults.show_sample_banks),
  })
}

fn load_banks(connection: &Connection) -> Result<Vec<BankRecord>, String> {
  let mut banks = Vec::new();
  {
    let mut statement = connection
      .prepare(
        "SELECT id, title, subtitle, description, exam, icon, accent, level, duration_min, tags, imported_at
         FROM banks ORDER BY imported_at DESC, rowid DESC",
      )
      .map_err(|error| format!("读取题库失败: {error}"))?;
    let rows = statement
      .query_map([], |row| {
        Ok(BankRecord {
          id: row.get(0)?,
          title: row.get(1)?,
          subtitle: row.get(2)?,
          description: row.get(3)?,
          exam: row.get(4)?,
          icon: row.get(5)?,
          accent: row.get(6)?,
          level: row.get(7)?,
          duration_min: row.get(8)?,
          tags: from_json(row.get(9)?),
          imported_at: row.get(10)?,
          questions: Vec::new(),
        })
      })
      .map_err(|error| format!("读取题库失败: {error}"))?;
    for row in rows {
      banks.push(row.map_err(|error| format!("读取题库行失败: {error}"))?);
    }
  }
  let mut statement = connection
    .prepare(
      "SELECT type, stem, options, answer, explanation, difficulty, tags, image, option_images
       FROM questions WHERE bank_id = ?1 ORDER BY ordinal ASC",
    )
    .map_err(|error| format!("读取题目失败: {error}"))?;
  for bank in &mut banks {
    let rows = statement
      .query_map(params![bank.id], |row| {
        Ok(QuestionRecord {
          kind: row.get(0)?,
          stem: row.get(1)?,
          options: from_json(row.get(2)?),
          answer: from_json(row.get(3)?),
          explanation: row.get(4)?,
          difficulty: row.get(5)?,
          tags: from_json(row.get(6)?),
          image: row.get(7)?,
          option_images: from_json(row.get::<_, String>(8)?),
        })
      })
      .map_err(|error| format!("读取题目失败: {error}"))?;
    for row in rows {
      bank.questions.push(row.map_err(|error| format!("读取题目行失败: {error}"))?);
    }
  }
  Ok(banks)
}

fn load_snapshot(connection: &Connection) -> Result<Snapshot, String> {
  let settings = load_settings(connection)?;
  let favorites = {
    let mut statement = connection
      .prepare("SELECT question_id FROM favorites ORDER BY created_at DESC, rowid DESC")
      .map_err(|error| format!("读取收藏失败: {error}"))?;
    let rows = statement
      .query_map([], |row| row.get::<_, String>(0))
      .map_err(|error| format!("读取收藏失败: {error}"))?;
    rows
      .collect::<Result<Vec<_>, _>>()
      .map_err(|error| format!("读取收藏行失败: {error}"))?
  };
  let wrong_book = {
    let mut statement = connection
      .prepare(
        "SELECT question_id, collection_id, wrong_count, last_wrong_at, last_selection
         FROM wrong_book ORDER BY last_wrong_at DESC",
      )
      .map_err(|error| format!("读取错题失败: {error}"))?;
    let rows = statement
      .query_map([], |row| {
        Ok(WrongRecord {
          question_id: row.get(0)?,
          collection_id: row.get(1)?,
          wrong_count: row.get(2)?,
          last_wrong_at: row.get(3)?,
          last_selection: from_json(row.get(4)?),
        })
      })
      .map_err(|error| format!("读取错题失败: {error}"))?;
    rows
      .collect::<Result<Vec<_>, _>>()
      .map_err(|error| format!("读取错题行失败: {error}"))?
  };
  let history = {
    let mut statement = connection
      .prepare(
        "SELECT id, mode, collection_id, collection_title, domain_id, answered, correct, wrong,
                skipped, total, accuracy, duration_sec, finished_at, date_key
         FROM history ORDER BY finished_at DESC LIMIT 100",
      )
      .map_err(|error| format!("读取练习记录失败: {error}"))?;
    let rows = statement
      .query_map([], |row| {
        Ok(HistoryRecord {
          id: row.get(0)?,
          mode: row.get(1)?,
          collection_id: row.get(2)?,
          collection_title: row.get(3)?,
          domain_id: row.get(4)?,
          answered: row.get(5)?,
          correct: row.get(6)?,
          wrong: row.get(7)?,
          skipped: row.get(8)?,
          total: row.get(9)?,
          accuracy: row.get(10)?,
          duration_sec: row.get(11)?,
          finished_at: row.get(12)?,
          date_key: row.get(13)?,
        })
      })
      .map_err(|error| format!("读取练习记录失败: {error}"))?;
    rows
      .collect::<Result<Vec<_>, _>>()
      .map_err(|error| format!("读取记录行失败: {error}"))?
  };
  let daily = {
    let mut statement = connection
      .prepare("SELECT date, answered, correct FROM daily ORDER BY date ASC")
      .map_err(|error| format!("读取每日统计失败: {error}"))?;
    let rows = statement
      .query_map([], |row| {
        Ok(DailyRecord {
          date: row.get(0)?,
          answered: row.get(1)?,
          correct: row.get(2)?,
        })
      })
      .map_err(|error| format!("读取每日统计失败: {error}"))?;
    rows
      .collect::<Result<Vec<_>, _>>()
      .map_err(|error| format!("读取每日统计行失败: {error}"))?
  };
  let papers = {
    let mut statement = connection
      .prepare(
        "SELECT id, title, collection_ids, count, duration_min, \"order\", created_at
         FROM papers ORDER BY created_at DESC LIMIT 20",
      )
      .map_err(|error| format!("读取组卷失败: {error}"))?;
    let rows = statement
      .query_map([], |row| {
        Ok(PaperRecord {
          id: row.get(0)?,
          title: row.get(1)?,
          collection_ids: from_json(row.get(2)?),
          count: row.get(3)?,
          duration_min: row.get(4)?,
          order: row.get(5)?,
          created_at: row.get(6)?,
        })
      })
      .map_err(|error| format!("读取组卷失败: {error}"))?;
    rows
      .collect::<Result<Vec<_>, _>>()
      .map_err(|error| format!("读取组卷行失败: {error}"))?
  };
  Ok(Snapshot {
    settings,
    favorites,
    wrong_book,
    history,
    daily,
    // 空串是「无」的存储形式（set_last_collection 用 '' 表示 null），读回来要还原成 None，
    // 否则快照里会出现 Some("") 这种类型谎言。
    last_collection_id: setting(connection, "lastCollectionId")?.filter(|value| !value.is_empty()),
    banks: load_banks(connection)?,
    papers,
    pending_session: setting(connection, "pendingSession")?
      .filter(|value| !value.is_empty())
      .and_then(|value| serde_json::from_str(&value).ok()),
    bank_snapshots: load_bank_snapshots(connection)?,
  })
}

fn load_bank_snapshots(connection: &Connection) -> Result<Vec<BankSnapshotRecord>, String> {
  let mut statement = connection
    .prepare("SELECT id, bank_id, saved_at, revision, bank FROM bank_snapshots ORDER BY saved_at DESC")
    .map_err(|error| format!("读取题库快照失败: {error}"))?;
  let rows = statement
    .query_map([], |row| {
      Ok((
        row.get::<_, String>(0)?,
        row.get::<_, String>(1)?,
        row.get::<_, i64>(2)?,
        row.get::<_, i64>(3)?,
        row.get::<_, String>(4)?,
      ))
    })
    .map_err(|error| format!("读取题库快照失败: {error}"))?;
  let mut result = Vec::new();
  for row in rows {
    let (id, bank_id, saved_at, revision, bank_json) =
      row.map_err(|error| format!("读取题库快照行失败: {error}"))?;
    // 快照是历史副本，结构坏了就跳过而不是让整个应用打不开。
    if let Ok(bank) = serde_json::from_str::<BankRecord>(&bank_json) {
      result.push(BankSnapshotRecord { id, bank_id, saved_at, revision, bank });
    }
  }
  Ok(result)
}

/// 打开成功时持有连接；失败时连接为空并带上错误信息。
/// 用 `Deref` 包一层，让所有命令照旧按 `&Connection` 使用，不必逐个改签名。
pub struct DbConn<'a>(std::sync::MutexGuard<'a, Option<Connection>>);

impl std::ops::Deref for DbConn<'_> {
  type Target = Connection;
  fn deref(&self) -> &Connection {
    // lock() 已确认 Some 才会返回 DbConn。
    self.0.as_ref().expect("connection checked before wrapping")
  }
}

impl std::ops::DerefMut for DbConn<'_> {
  fn deref_mut(&mut self) -> &mut Connection {
    self.0.as_mut().expect("connection checked before wrapping")
  }
}

fn lock<'a>(db: &'a State<Db>) -> Result<DbConn<'a>, String> {
  let guard = db.0.lock().map_err(|_| "数据库连接已被占用".to_string())?;
  if guard.is_none() {
    let detail = db
      .1
      .lock()
      .ok()
      .and_then(|message| message.clone())
      .unwrap_or_else(|| "数据库未成功打开".to_string());
    return Err(detail);
  }
  Ok(DbConn(guard))
}

fn upsert_bank(tx: &Transaction, bank: &BankRecord) -> Result<(), String> {
  tx.execute(
    "INSERT INTO banks(id, title, subtitle, description, exam, icon, accent, level, duration_min, tags, imported_at)
     VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title, subtitle = excluded.subtitle, description = excluded.description,
       exam = excluded.exam, icon = excluded.icon, accent = excluded.accent, level = excluded.level,
       duration_min = excluded.duration_min, tags = excluded.tags, imported_at = excluded.imported_at",
    params![
      bank.id,
      bank.title,
      bank.subtitle,
      bank.description,
      bank.exam,
      bank.icon,
      bank.accent,
      bank.level,
      bank.duration_min,
      json(&bank.tags),
      bank.imported_at
    ],
  )
  .map_err(|error| format!("写入题库失败: {error}"))?;
  tx.execute("DELETE FROM questions WHERE bank_id = ?1", params![bank.id])
    .map_err(|error| format!("清理旧题目失败: {error}"))?;
  for (index, question) in bank.questions.iter().enumerate() {
    tx.execute(
      "INSERT INTO questions(bank_id, ordinal, type, stem, options, answer, explanation, difficulty, tags, image, option_images)
       VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
      params![
        bank.id,
        index as i64 + 1,
        question.kind,
        question.stem,
        json(&question.options),
        json(&question.answer),
        question.explanation,
        question.difficulty,
        json(&question.tags),
        question.image,
        json(&question.option_images)
      ],
    )
    .map_err(|error| format!("写入题目失败: {error}"))?;
  }
  Ok(())
}

fn replace_all(connection: &mut Connection, snapshot: &Snapshot) -> Result<(), String> {
  let tx = connection.transaction().map_err(|error| format!("开启事务失败: {error}"))?;
  tx.execute_batch(
    "DELETE FROM questions; DELETE FROM banks; DELETE FROM favorites; DELETE FROM wrong_book;
     DELETE FROM history; DELETE FROM daily; DELETE FROM papers; DELETE FROM settings;
     DELETE FROM bank_snapshots;",
  )
  .map_err(|error| format!("清空旧数据失败: {error}"))?;
  save_settings_tx(&tx, &snapshot.settings)?;
  set_setting_tx(&tx, "lastCollectionId", snapshot.last_collection_id.as_deref().unwrap_or(""))?;
  // 未完成会话随快照整体替换：备份恢复后不该保留旧机器的半截进度。
  let pending = snapshot
    .pending_session
    .as_ref()
    .map(|value| value.to_string())
    .unwrap_or_default();
  set_setting_tx(&tx, "pendingSession", &pending)?;
  for (index, favorite) in snapshot.favorites.iter().enumerate() {
    tx.execute(
      "INSERT INTO favorites(question_id, created_at) VALUES(?1, ?2)",
      params![favorite, snapshot.favorites.len() as i64 - index as i64],
    )
    .map_err(|error| format!("写入收藏失败: {error}"))?;
  }
  for bank in &snapshot.banks {
    upsert_bank(&tx, bank)?;
  }
  for wrong in &snapshot.wrong_book {
    tx.execute(
      "INSERT INTO wrong_book(question_id, collection_id, wrong_count, last_wrong_at, last_selection)
       VALUES(?1, ?2, ?3, ?4, ?5)",
      params![
        wrong.question_id,
        wrong.collection_id,
        wrong.wrong_count,
        wrong.last_wrong_at,
        json(&wrong.last_selection)
      ],
    )
    .map_err(|error| format!("写入错题失败: {error}"))?;
  }
  for entry in &snapshot.history {
    insert_history_tx(&tx, entry)?;
  }
  for day in &snapshot.daily {
    tx.execute(
      "INSERT INTO daily(date, answered, correct) VALUES(?1, ?2, ?3)
       ON CONFLICT(date) DO UPDATE SET answered = excluded.answered, correct = excluded.correct",
      params![day.date, day.answered, day.correct],
    )
    .map_err(|error| format!("写入每日统计失败: {error}"))?;
  }
  for entry in &snapshot.bank_snapshots {
    tx.execute(
      "INSERT OR REPLACE INTO bank_snapshots(id, bank_id, saved_at, revision, bank)
       VALUES(?1, ?2, ?3, ?4, ?5)",
      params![
        entry.id,
        entry.bank_id,
        entry.saved_at,
        entry.revision,
        serde_json::to_string(&entry.bank).unwrap_or_else(|_| "{}".into())
      ],
    )
    .map_err(|error| format!("写入题库快照失败: {error}"))?;
  }
  for paper in &snapshot.papers {
    tx.execute(
      "INSERT INTO papers(id, title, collection_ids, count, duration_min, \"order\", created_at)
       VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7)",
      params![
        paper.id,
        paper.title,
        json(&paper.collection_ids),
        paper.count,
        paper.duration_min,
        paper.order,
        paper.created_at
      ],
    )
    .map_err(|error| format!("写入组卷失败: {error}"))?;
  }
  tx.commit().map_err(|error| format!("提交事务失败: {error}"))
}

fn set_setting_tx(tx: &Transaction, key: &str, value: &str) -> Result<(), String> {
  tx.execute(
    "INSERT INTO settings(key, value) VALUES(?1, ?2)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    params![key, value],
  )
  .map(|_| ())
  .map_err(|error| format!("写入设置 {key} 失败: {error}"))
}

fn save_settings_tx(tx: &Transaction, settings: &SettingsRecord) -> Result<(), String> {
  set_setting_tx(tx, "theme", &settings.theme)?;
  set_setting_tx(tx, "fontScale", &settings.font_scale)?;
  set_setting_tx(tx, "autoNext", if settings.auto_next { "1" } else { "0" })?;
  set_setting_tx(
    tx,
    "showSampleBanks",
    if settings.show_sample_banks { "1" } else { "0" },
  )
}

fn insert_history_tx(tx: &Transaction, entry: &HistoryRecord) -> Result<(), String> {
  tx.execute(
    "INSERT INTO history(id, mode, collection_id, collection_title, domain_id, answered, correct,
                         wrong, skipped, total, accuracy, duration_sec, finished_at, date_key)
     VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
     ON CONFLICT(id) DO UPDATE SET
       answered = excluded.answered, correct = excluded.correct, wrong = excluded.wrong,
       skipped = excluded.skipped, accuracy = excluded.accuracy, duration_sec = excluded.duration_sec",
    params![
      entry.id,
      entry.mode,
      entry.collection_id,
      entry.collection_title,
      entry.domain_id,
      entry.answered,
      entry.correct,
      entry.wrong,
      entry.skipped,
      entry.total,
      entry.accuracy,
      entry.duration_sec,
      entry.finished_at,
      entry.date_key
    ],
  )
  .map(|_| ())
  .map_err(|error| format!("写入练习记录失败: {error}"))
}

#[tauri::command]
pub fn db_load(db: State<Db>) -> Result<Snapshot, String> {
  let connection = lock(&db)?;
  load_snapshot(&connection)
}

#[tauri::command]
pub fn db_path(app: AppHandle) -> Result<String, String> {
  Ok(database_path(&app)?.display().to_string())
}

/// 隔离当前不可用的数据库并新建空库，然后重新挂载连接。
///
/// 这是损坏/版本不兼容时唯一能让应用重新可用的路径：前端在启动错误页
/// 调用它，成功后再用备份文件恢复数据。原文件被改名保留，不删除。
#[tauri::command]
pub fn db_rebuild(app: AppHandle, db: State<Db>, confirm: bool) -> Result<String, String> {
  if !confirm {
    return Err("重建数据库需要显式确认".to_string());
  }
  let path = database_path(&app)?;
  let quarantined = quarantine_and_recreate(&path)?;
  let connection = open_at(&path)?;
  {
    let mut slot = db.0.lock().map_err(|_| "数据库连接已被占用".to_string())?;
    *slot = Some(connection);
  }
  {
    let mut error = db.1.lock().map_err(|_| "错误状态被占用".to_string())?;
    *error = None;
  }
  Ok(quarantined.display().to_string())
}

#[tauri::command]
pub fn db_save_settings(db: State<Db>, settings: SettingsRecord) -> Result<(), String> {
  let mut connection = lock(&db)?;
  let tx = connection.transaction().map_err(|error| format!("开启事务失败: {error}"))?;
  save_settings_tx(&tx, &settings)?;
  tx.commit().map_err(|error| format!("提交失败: {error}"))
}

#[tauri::command]
pub fn db_set_last_collection(db: State<Db>, collection_id: Option<String>) -> Result<(), String> {
  let connection = lock(&db)?;
  set_setting(&connection, "lastCollectionId", collection_id.as_deref().unwrap_or(""))
}

#[tauri::command]
pub fn db_set_pending_session(db: State<Db>, session: Option<serde_json::Value>) -> Result<(), String> {
  let connection = lock(&db)?;
  let payload = session.map(|value| value.to_string()).unwrap_or_default();
  set_setting(&connection, "pendingSession", &payload)
}

#[tauri::command]
pub fn db_add_bank_snapshot(db: State<Db>, snapshot: BankSnapshotRecord) -> Result<(), String> {
  let mut connection = lock(&db)?;
  let tx = connection.transaction().map_err(|error| format!("开启事务失败: {error}"))?;
  tx.execute(
    "INSERT OR REPLACE INTO bank_snapshots(id, bank_id, saved_at, revision, bank)
     VALUES(?1, ?2, ?3, ?4, ?5)",
    params![
      snapshot.id,
      snapshot.bank_id,
      snapshot.saved_at,
      snapshot.revision,
      serde_json::to_string(&snapshot.bank).unwrap_or_else(|_| "{}".into())
    ],
  )
  .map_err(|error| format!("写入题库快照失败: {error}"))?;
  // 上限在数据库侧强制：调用方漏了裁剪也不会让存储无限增长。
  tx.execute(
    "DELETE FROM bank_snapshots WHERE bank_id = ?1 AND id NOT IN (
       SELECT id FROM bank_snapshots WHERE bank_id = ?1 ORDER BY saved_at DESC LIMIT ?2
     )",
    params![snapshot.bank_id, BANK_SNAPSHOT_LIMIT],
  )
  .map_err(|error| format!("裁剪题库快照失败: {error}"))?;
  tx.commit().map_err(|error| format!("提交失败: {error}"))
}

#[tauri::command]
pub fn db_remove_bank_snapshot(db: State<Db>, snapshot_id: String) -> Result<(), String> {
  let connection = lock(&db)?;
  connection
    .execute("DELETE FROM bank_snapshots WHERE id = ?1", params![snapshot_id])
    .map(|_| ())
    .map_err(|error| format!("删除题库快照失败: {error}"))
}

#[tauri::command]
pub fn db_clear_bank_snapshots(db: State<Db>, bank_id: String) -> Result<(), String> {
  let connection = lock(&db)?;
  connection
    .execute("DELETE FROM bank_snapshots WHERE bank_id = ?1", params![bank_id])
    .map(|_| ())
    .map_err(|error| format!("清空题库快照失败: {error}"))
}

#[tauri::command]
pub fn db_set_favorite(db: State<Db>, question_id: String, favorite: bool) -> Result<(), String> {
  let connection = lock(&db)?;
  if favorite {
    connection
      .execute(
        "INSERT INTO favorites(question_id, created_at) VALUES(?1, ?2)
         ON CONFLICT(question_id) DO NOTHING",
        params![question_id, chrono_millis()],
      )
      .map(|_| ())
  } else {
    connection
      .execute("DELETE FROM favorites WHERE question_id = ?1", params![question_id])
      .map(|_| ())
  }
  .map_err(|error| format!("更新收藏失败: {error}"))
}

#[tauri::command]
pub fn db_clear_favorites(db: State<Db>) -> Result<(), String> {
  let connection = lock(&db)?;
  connection
    .execute("DELETE FROM favorites", [])
    .map(|_| ())
    .map_err(|error| format!("清空收藏失败: {error}"))
}

#[tauri::command]
pub fn db_record_wrong(db: State<Db>, entry: WrongRecord) -> Result<(), String> {
  let connection = lock(&db)?;
  connection
    .execute(
      "INSERT INTO wrong_book(question_id, collection_id, wrong_count, last_wrong_at, last_selection)
       VALUES(?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(question_id) DO UPDATE SET
         collection_id = excluded.collection_id, wrong_count = excluded.wrong_count,
         last_wrong_at = excluded.last_wrong_at, last_selection = excluded.last_selection",
      params![
        entry.question_id,
        entry.collection_id,
        entry.wrong_count,
        entry.last_wrong_at,
        json(&entry.last_selection)
      ],
    )
    .map(|_| ())
    .map_err(|error| format!("写入错题失败: {error}"))
}

#[tauri::command]
pub fn db_remove_wrong(db: State<Db>, question_id: String) -> Result<(), String> {
  let connection = lock(&db)?;
  connection
    .execute("DELETE FROM wrong_book WHERE question_id = ?1", params![question_id])
    .map(|_| ())
    .map_err(|error| format!("删除错题失败: {error}"))
}

#[tauri::command]
pub fn db_clear_wrong_book(db: State<Db>) -> Result<(), String> {
  let connection = lock(&db)?;
  connection
    .execute("DELETE FROM wrong_book", [])
    .map(|_| ())
    .map_err(|error| format!("清空错题失败: {error}"))
}

#[tauri::command]
pub fn db_add_history(db: State<Db>, entry: HistoryRecord) -> Result<(), String> {
  let mut connection = lock(&db)?;
  let tx = connection.transaction().map_err(|error| format!("开启事务失败: {error}"))?;
  insert_history_tx(&tx, &entry)?;
  tx.execute(
    "INSERT INTO daily(date, answered, correct) VALUES(?1, ?2, ?3)
     ON CONFLICT(date) DO UPDATE SET
       answered = daily.answered + excluded.answered,
       correct = daily.correct + excluded.correct",
    params![entry.date_key, entry.answered, entry.correct],
  )
  .map_err(|error| format!("更新每日统计失败: {error}"))?;
  tx.execute(
    "DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY finished_at DESC LIMIT 100)",
    [],
  )
  .map_err(|error| format!("裁剪历史记录失败: {error}"))?;
  tx.commit().map_err(|error| format!("提交失败: {error}"))
}

#[tauri::command]
pub fn db_clear_history(db: State<Db>) -> Result<(), String> {
  let mut connection = lock(&db)?;
  let tx = connection.transaction().map_err(|error| format!("开启事务失败: {error}"))?;
  tx.execute("DELETE FROM history", [])
    .map_err(|error| format!("清空记录失败: {error}"))?;
  tx.execute("DELETE FROM daily", [])
    .map_err(|error| format!("清空每日统计失败: {error}"))?;
  tx.commit().map_err(|error| format!("提交失败: {error}"))
}

#[tauri::command]
pub fn db_upsert_bank(db: State<Db>, bank: BankRecord) -> Result<(), String> {
  let mut connection = lock(&db)?;
  let tx = connection.transaction().map_err(|error| format!("开启事务失败: {error}"))?;
  upsert_bank(&tx, &bank)?;
  tx.commit().map_err(|error| format!("提交失败: {error}"))
}

#[tauri::command]
pub fn db_delete_bank(db: State<Db>, bank_id: String) -> Result<(), String> {
  let mut connection = lock(&db)?;
  delete_bank(&mut connection, &bank_id)
}

/// 删除题库及其关联数据，抽成普通函数以便测试直接调用。
fn delete_bank(connection: &mut Connection, bank_id: &str) -> Result<(), String> {
  let tx = connection.transaction().map_err(|error| format!("开启事务失败: {error}"))?;
  tx.execute("DELETE FROM banks WHERE id = ?1", params![bank_id])
    .map_err(|error| format!("删除题库失败: {error}"))?;
  // questions 由外键级联清理；错题与收藏没有外键，必须显式删，
  // 否则设置页的计数会把已无对应题目的孤儿行也算进去。
  tx.execute("DELETE FROM wrong_book WHERE collection_id = ?1", params![bank_id])
    .map_err(|error| format!("清理错题失败: {error}"))?;
  // 题目 ID 的构成是 `{bankId}-{序号}`，用前缀匹配而不是 LIKE，
  // 避免题库 ID 里的字符被当成通配符。
  tx.execute(
    "DELETE FROM favorites WHERE substr(question_id, 1, length(?1) + 1) = ?1 || '-'",
    params![bank_id],
  )
  .map_err(|error| format!("清理收藏失败: {error}"))?;
  tx.commit().map_err(|error| format!("提交失败: {error}"))
}

#[tauri::command]
pub fn db_add_paper(db: State<Db>, paper: PaperRecord) -> Result<(), String> {
  let mut connection = lock(&db)?;
  let tx = connection.transaction().map_err(|error| format!("开启事务失败: {error}"))?;
  tx.execute(
    "INSERT INTO papers(id, title, collection_ids, count, duration_min, \"order\", created_at)
     VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, collection_ids = excluded.collection_ids,
       count = excluded.count, duration_min = excluded.duration_min, \"order\" = excluded.\"order\"",
    params![
      paper.id,
      paper.title,
      json(&paper.collection_ids),
      paper.count,
      paper.duration_min,
      paper.order,
      paper.created_at
    ],
  )
  .map_err(|error| format!("写入组卷失败: {error}"))?;
  tx.execute(
    "DELETE FROM papers WHERE id NOT IN (SELECT id FROM papers ORDER BY created_at DESC LIMIT 20)",
    [],
  )
  .map_err(|error| format!("裁剪组卷历史失败: {error}"))?;
  tx.commit().map_err(|error| format!("提交失败: {error}"))
}

#[tauri::command]
pub fn db_remove_paper(db: State<Db>, paper_id: String) -> Result<(), String> {
  let connection = lock(&db)?;
  connection
    .execute("DELETE FROM papers WHERE id = ?1", params![paper_id])
    .map(|_| ())
    .map_err(|error| format!("删除组卷失败: {error}"))
}

#[tauri::command]
pub fn db_reset_progress(db: State<Db>) -> Result<(), String> {
  let mut connection = lock(&db)?;
  let tx = connection.transaction().map_err(|error| format!("开启事务失败: {error}"))?;
  tx.execute_batch(
    "DELETE FROM favorites; DELETE FROM wrong_book; DELETE FROM history; DELETE FROM daily;",
  )
  .map_err(|error| format!("重置失败: {error}"))?;
  set_setting_tx(&tx, "lastCollectionId", "")?;
  // 未完成会话也要清：否则「继续上次」会带用户回到一个已被清空进度的练习。
  set_setting_tx(&tx, "pendingSession", "")?;
  tx.commit().map_err(|error| format!("提交失败: {error}"))
}

#[tauri::command]
pub fn db_replace_all(db: State<Db>, snapshot: Snapshot) -> Result<(), String> {
  let mut connection = lock(&db)?;
  replace_all(&mut connection, &snapshot)
}

fn chrono_millis() -> i64 {
  std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map(|duration| duration.as_millis() as i64)
    .unwrap_or(0)
}

#[cfg(test)]
mod tests {
  use super::*;

  fn memory() -> Connection {
    let mut connection = Connection::open_in_memory().unwrap();
    migrate(&mut connection).unwrap();
    connection
  }

  #[test]
  fn round_trips_snapshot() {
    let mut connection = memory();
    let snapshot = Snapshot {
      settings: SettingsRecord {
        theme: "dark".into(),
        font_scale: "large".into(),
        auto_next: true,
        show_sample_banks: false,
      },
      favorites: vec!["bank-1-1".into()],
      wrong_book: vec![WrongRecord {
        question_id: "bank-1-2".into(),
        collection_id: "bank".into(),
        wrong_count: 3,
        last_wrong_at: 42,
        last_selection: vec![1, 2],
      }],
      history: vec![HistoryRecord {
        id: "h1".into(),
        mode: "exam".into(),
        collection_id: "bank".into(),
        collection_title: "题库".into(),
        domain_id: Some("imported".into()),
        answered: 2,
        correct: 1,
        wrong: 1,
        skipped: 0,
        total: 2,
        accuracy: 50.0,
        duration_sec: 61,
        finished_at: 1000,
        date_key: "2026-11-06".into(),
      }],
      daily: vec![DailyRecord { date: "2026-11-06".into(), answered: 2, correct: 1 }],
      last_collection_id: Some("bank".into()),
      banks: vec![BankRecord {
        id: "bank".into(),
        title: "示例".into(),
        subtitle: "副标题".into(),
        description: "描述".into(),
        exam: "考试".into(),
        icon: "book".into(),
        accent: "#000000".into(),
        level: "进阶".into(),
        duration_min: 30,
        tags: vec!["a".into()],
        imported_at: 7,
        questions: vec![
          QuestionRecord {
            kind: "single".into(),
            stem: "题干".into(),
            options: vec!["A".into(), "B".into()],
            answer: vec![0],
            explanation: "解析".into(),
            difficulty: 2,
            tags: vec![],
            image: None,
            option_images: vec![],
          },
          QuestionRecord {
            kind: "judge".into(),
            stem: "判断题".into(),
            options: vec!["对".into(), "错".into()],
            answer: vec![1],
            explanation: "".into(),
            difficulty: 1,
            tags: vec![],
            image: None,
            option_images: vec![],
          },
        ],
      }],
      papers: vec![PaperRecord {
        id: "p1".into(),
        title: "卷".into(),
        collection_ids: vec!["bank".into()],
        count: 2,
        duration_min: 20,
        order: "random".into(),
        created_at: 11,
      }],
      pending_session: Some(serde_json::json!({
        "id": "s1",
        "mode": "practice",
        "collectionId": "bank",
        "questionIds": ["bank-1-1"],
        "answers": { "bank-1-1": [0] },
        "index": 0
      })),
      bank_snapshots: vec![BankSnapshotRecord {
        id: "bank:r1".into(),
        bank_id: "bank".into(),
        saved_at: 1000,
        revision: 1,
        bank: sample_bank("bank"),
      }],
    };
    replace_all(&mut connection, &snapshot).unwrap();
    let loaded = load_snapshot(&connection).unwrap();
    assert_eq!(loaded.banks.len(), 1);
    assert_eq!(loaded.banks[0].questions.len(), 2);
    assert_eq!(loaded.banks[0].questions[1].kind, "judge");
    assert_eq!(loaded.favorites, vec!["bank-1-1".to_string()]);
    assert_eq!(loaded.wrong_book[0].wrong_count, 3);
    assert_eq!(loaded.history[0].accuracy, 50.0);
    assert_eq!(loaded.daily[0].answered, 2);
    assert!(!loaded.settings.show_sample_banks);
    assert_eq!(loaded.papers[0].collection_ids, vec!["bank".to_string()]);
    // 未完成会话必须原样往返：它是「关掉应用还能继续做题」的唯一依据。
    let pending = loaded.pending_session.expect("pending session should round-trip");
    assert_eq!(pending["id"], "s1");
    assert_eq!(pending["answers"]["bank-1-1"][0], 0);
    // 历史版本也要往返，否则「回滚」在重启后失效。
    assert_eq!(loaded.bank_snapshots.len(), 1);
    assert_eq!(loaded.bank_snapshots[0].revision, 1);
    assert_eq!(loaded.bank_snapshots[0].bank.id, "bank");
  }

  #[test]
  fn deleting_bank_cascades_questions() {
    let mut connection = memory();
    let tx = connection.transaction().unwrap();
    upsert_bank(&tx, &sample_bank("b")).unwrap();
    tx.commit().unwrap();
    delete_bank(&mut connection, "b").unwrap();
    let remaining: i64 = connection
      .query_row("SELECT COUNT(*) FROM questions", [], |row| row.get(0))
      .unwrap();
    assert_eq!(remaining, 0);
  }

  #[test]
  fn deleting_bank_also_clears_its_wrong_entries_and_favorites() {
    // 错题与收藏没有外键，必须显式清理。留下孤儿行会让设置页的计数
    // 与错题本、收藏页显示的条目数对不上。
    let mut connection = memory();
    let tx = connection.transaction().unwrap();
    upsert_bank(&tx, &sample_bank("gone")).unwrap();
    upsert_bank(&tx, &sample_bank("kept")).unwrap();
    tx.commit().unwrap();

    let tx = connection.transaction().unwrap();
    for (question_id, collection_id) in [("gone-1", "gone"), ("kept-1", "kept")] {
      tx.execute(
        "INSERT INTO wrong_book(question_id, collection_id, wrong_count, last_wrong_at, last_selection)
         VALUES(?1, ?2, 1, 0, '[]')",
        params![question_id, collection_id],
      )
      .unwrap();
      tx.execute(
        "INSERT INTO favorites(question_id, created_at) VALUES(?1, 0)",
        params![question_id],
      )
      .unwrap();
    }
    tx.commit().unwrap();

    delete_bank(&mut connection, "gone").unwrap();

    let wrong: Vec<String> = {
      let mut statement = connection.prepare("SELECT question_id FROM wrong_book").unwrap();
      statement
        .query_map([], |row| row.get::<_, String>(0))
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap()
    };
    let favorites: Vec<String> = {
      let mut statement = connection.prepare("SELECT question_id FROM favorites").unwrap();
      statement
        .query_map([], |row| row.get::<_, String>(0))
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap()
    };
    assert_eq!(wrong, vec!["kept-1".to_string()], "只应清掉被删题库的错题");
    assert_eq!(favorites, vec!["kept-1".to_string()], "只应清掉被删题库的收藏");
  }

  fn sample_bank(id: &str) -> BankRecord {
    BankRecord {
      id: id.into(),
      title: format!("题库 {id}"),
      subtitle: String::new(),
      description: String::new(),
      exam: String::new(),
      icon: "book".into(),
      accent: "#000".into(),
      level: "入门".into(),
      duration_min: 10,
      tags: vec![],
      imported_at: 1,
      questions: vec![QuestionRecord {
        kind: "single".into(),
        stem: "s".into(),
        options: vec![],
        answer: vec![0],
        explanation: String::new(),
        difficulty: 1,
        tags: vec![],
        image: None,
        option_images: vec![],
      }],
    }
  }

  #[test]
  fn bank_snapshot_limit_is_enforced_in_the_database() {
    // 前端的裁剪可能被绕过（例如直接调命令），数据库侧必须自己兜住上限，
    // 否则每次编辑存一份完整题库，存储会无限膨胀。
    let mut connection = memory();
    for index in 0..(BANK_SNAPSHOT_LIMIT + 5) {
      let tx = connection.transaction().unwrap();
      tx.execute(
        "INSERT OR REPLACE INTO bank_snapshots(id, bank_id, saved_at, revision, bank)
         VALUES(?1, 'b', ?2, ?3, '{}')",
        params![format!("b:{index}"), index as i64, index as i64],
      )
      .unwrap();
      tx.execute(
        "DELETE FROM bank_snapshots WHERE bank_id = ?1 AND id NOT IN (
           SELECT id FROM bank_snapshots WHERE bank_id = ?1 ORDER BY saved_at DESC LIMIT ?2
         )",
        params!["b", BANK_SNAPSHOT_LIMIT],
      )
      .unwrap();
      tx.commit().unwrap();
    }
    let count: i64 = connection
      .query_row("SELECT COUNT(*) FROM bank_snapshots WHERE bank_id = 'b'", [], |row| row.get(0))
      .unwrap();
    assert_eq!(count, BANK_SNAPSHOT_LIMIT);
    // 保留的应该是最新的那批
    let newest: i64 = connection
      .query_row("SELECT MAX(saved_at) FROM bank_snapshots", [], |row| row.get(0))
      .unwrap();
    assert_eq!(newest, BANK_SNAPSHOT_LIMIT + 4);
  }

  fn version_of(connection: &Connection) -> i64 {
    connection
      .query_row("SELECT CAST(value AS INTEGER) FROM meta WHERE key = 'schema_version'", [], |row| {
        row.get(0)
      })
      .optional()
      .unwrap()
      .unwrap_or(0)
  }

  #[test]
  fn fresh_database_reaches_current_schema_version() {
    let connection = memory();
    assert_eq!(version_of(&connection), SCHEMA_VERSION);
  }

  #[test]
  fn migrating_an_existing_v1_database_is_idempotent_and_keeps_data() {
    // 模拟「用户已经在用 v1」：手工建出 v1 结构并写入数据，再跑一次 migrate。
    // 这是升级路径的真正风险点——重复执行不能清空或重建用户数据。
    let mut connection = Connection::open_in_memory().unwrap();
    connection
      .execute_batch("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);")
      .unwrap();
    let tx = connection.transaction().unwrap();
    schema_v1(&tx).unwrap();
    tx.commit().unwrap();
    connection
      .execute("INSERT INTO meta(key, value) VALUES('schema_version', '1')", [])
      .unwrap();

    // 用 v1 的列直接插数据（不能用 upsert_bank：那是 v2 的写入路径，
    // 会引用 v1 还没有的 image 列，测的就不是「老库升级」了）。
    connection
      .execute(
        "INSERT INTO banks(id, title, subtitle, description, exam, icon, accent, level, duration_min, tags, imported_at)
         VALUES('kept', '已有题库', '', '', '', 'book', '#000', '入门', 10, '[]', 1)",
        [],
      )
      .unwrap();
    connection
      .execute(
        "INSERT INTO questions(bank_id, ordinal, type, stem, options, answer, explanation, difficulty, tags)
         VALUES('kept', 1, 'single', '题干', '[\"A\"]', '[0]', '', 1, '[]')",
        [],
      )
      .unwrap();

    migrate(&mut connection).unwrap();
    migrate(&mut connection).unwrap();

    assert_eq!(version_of(&connection), SCHEMA_VERSION);
    let banks = load_banks(&connection).unwrap();
    assert_eq!(banks.len(), 1, "迁移不应清空已有题库");
    assert_eq!(banks[0].id, "kept");
    assert_eq!(banks[0].questions.len(), 1);
    // v2 新增的列对老数据给出安全默认值：无图、无选项图。
    assert_eq!(banks[0].questions[0].image, None);
    assert!(banks[0].questions[0].option_images.is_empty());
  }

  #[test]
  fn unknown_future_version_is_rejected_instead_of_downgraded() {
    // 用新版应用写过的库在老版本里打开：必须报错，不能把 schema_version 降回去，
    // 也不能继续用旧 SQL 往里写。
    let mut connection = Connection::open_in_memory().unwrap();
    connection
      .execute_batch("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);")
      .unwrap();
    connection
      .execute(
        "INSERT INTO meta(key, value) VALUES('schema_version', ?1)",
        params![(SCHEMA_VERSION + 1).to_string()],
      )
      .unwrap();

    let error = migrate(&mut connection).unwrap_err();
    assert!(error.contains("高于本应用支持"), "错误信息应说明版本过高: {error}");
    assert_eq!(version_of(&connection), SCHEMA_VERSION + 1);
  }

  #[test]
  fn corrupt_database_is_reported_and_can_be_quarantined() {
    // Connection::open 对任意字节都返回 Ok，必须主动探一次 schema 才能
    // 发现「file is not a database」。这条测试锁住该探测行为。
    let dir = std::env::temp_dir().join(format!(
      "quizchest-corrupt-{}",
      std::process::id()
    ));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("quizchest.db");
    std::fs::write(&path, b"definitely not a sqlite database").unwrap();

    let error = open_at(&path).unwrap_err();
    assert!(error.contains("无法读取") || error.contains("not a database"), "应识别为损坏: {error}");

    let quarantined = quarantine_and_recreate(&path).unwrap();
    assert!(quarantined.exists(), "原文件应被改名保留而不是删除");
    assert_eq!(
      std::fs::read(&quarantined).unwrap(),
      b"definitely not a sqlite database",
      "隔离文件的内容必须原样保留，用户还能尝试抢救"
    );

    // 隔离后同一路径应能开出全新的可用库。
    let connection = open_at(&path).unwrap();
    assert_eq!(version_of(&connection), SCHEMA_VERSION);
    drop(connection);
    let _ = std::fs::remove_dir_all(&dir);
  }
}
