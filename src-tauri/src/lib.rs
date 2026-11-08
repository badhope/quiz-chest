mod db;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      // 打开失败不能中断 setup：那会让窗口建不起来，用户看到的是闪退。
      // 把结果存进状态，前端启动页据此展示错误并提供重试/恢复。
      let (connection, open_error) = match db::open(app.handle()) {
        Ok(connection) => (Some(connection), None),
        Err(error) => (None, Some(error)),
      };
      app.manage(db::Db(
        std::sync::Mutex::new(connection),
        std::sync::Mutex::new(open_error),
      ));
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      db::db_load,
      db::db_path,
      db::db_rebuild,
      db::db_save_settings,
      db::db_set_last_collection,
      db::db_set_pending_session,
      db::db_add_bank_snapshot,
      db::db_remove_bank_snapshot,
      db::db_clear_bank_snapshots,
      db::db_set_favorite,
      db::db_clear_favorites,
      db::db_record_wrong,
      db::db_remove_wrong,
      db::db_clear_wrong_book,
      db::db_add_history,
      db::db_clear_history,
      db::db_upsert_bank,
      db::db_delete_bank,
      db::db_add_paper,
      db::db_remove_paper,
      db::db_reset_progress,
      db::db_replace_all,
    ])
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
